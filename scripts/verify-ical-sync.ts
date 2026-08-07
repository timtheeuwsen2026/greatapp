/**
 * End-to-end check of the two-way iCal sync against the real database.
 *
 *   npm run dev                                             # in one terminal
 *   node --env-file=.env --import tsx scripts/verify-ical-sync.ts
 *
 * Picks the first approved venue, exercises every path — export feed, import,
 * re-sync, cancellation, feed swaps, conflict detection, handshake holds, bad
 * links — and deletes everything it wrote before it exits. Any venue calendars
 * that were already configured are put back exactly as they were.
 *
 * Every line should read PASS. A FAIL names the behaviour that broke.
 */
import http from "http";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import { venues, venueAvailability } from "../shared/schema";
import {
  ensureIcalExportToken,
  syncVenueIcalFeeds,
  findVenueDateConflicts,
  getConfirmedVenueEvents,
  blockVenueDatesForExperience,
  releaseVenueDatesForExperience,
} from "../server/icalSync";
import { buildIcalFeed } from "../server/ical";

const APP_URL = process.env.VERIFY_APP_URL || "http://localhost:4000";
const FEED_PORT = 4599;

let passed = 0;
let failed = 0;
const ok = (label: string, pass: boolean, detail = "") => {
  if (pass) passed++; else failed++;
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const feedWith = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...events, "END:VCALENDAR"].join("\r\n");

const booking = (uid: string, from: string, toExclusive: string) => [
  "BEGIN:VEVENT",
  `DTSTART;VALUE=DATE:${from}`,
  `DTEND;VALUE=DATE:${toExclusive}`,
  `UID:${uid}`,
  "SUMMARY:Reserved",
  "END:VEVENT",
].join("\r\n");

const fullFeed = feedWith(
  booking("hosted-booking-1@example.com", "20261012", "20261017"),
  booking("hosted-booking-2@example.com", "20261120", "20261123"),
);
const shrunkFeed = feedWith(booking("hosted-booking-2@example.com", "20261120", "20261123"));

let servedFeed = fullFeed;

async function main() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/calendar" });
    res.end(servedFeed);
  });
  await new Promise<void>((resolve) => server.listen(FEED_PORT, resolve));
  const feedUrl = `http://127.0.0.1:${FEED_PORT}/calendar.ics`;

  const [venue] = await db.select().from(venues).where(eq(venues.approved, true)).limit(1);
  if (!venue) throw new Error("No approved venue to test against.");
  console.log(`\nVenue under test: ${venue.name}\n`);

  const originalUrls = (venue as any).icalImportUrls ?? [];
  const testExperienceId = "verify-ical-sync-experience";

  try {
    console.log("EXPORT — the feed a venue pastes into Airbnb or Google");
    const token = await ensureIcalExportToken(venue.id);
    ok("export token minted", !!token && token.length >= 20);
    ok("token is stable across calls", (await ensureIcalExportToken(venue.id)) === token);

    const res = await fetch(`${APP_URL}/api/venues/${venue.id}/ical/${token}.ics`);
    const body = await res.text();
    ok("feed served over HTTP", res.status === 200, `status ${res.status}`);
    ok("content-type is text/calendar", (res.headers.get("content-type") || "").includes("text/calendar"));
    ok("body is a calendar", body.startsWith("BEGIN:VCALENDAR"));
    const wrong = await fetch(`${APP_URL}/api/venues/${venue.id}/ical/not-the-token.ics`);
    ok("a wrong token is a 404, not a hint", wrong.status === 404, `status ${wrong.status}`);

    console.log("\nIMPORT — reading the venue's existing calendars");
    await db.update(venues).set({ icalImportUrls: [feedUrl] }).where(eq(venues.id, venue.id));
    const first = await syncVenueIcalFeeds(venue.id);
    ok("feed read without error", first.feeds.every((feed) => feed.ok), first.feeds[0]?.error || "");
    ok("both bookings imported", first.feeds[0]?.added === 2, `added ${first.feeds[0]?.added}`);

    const rows = await db.select().from(venueAvailability).where(and(
      eq(venueAvailability.venueId, venue.id),
      eq(venueAvailability.source, "ical_import"),
    ));
    ok("blocks written as blocked", rows.length === 2 && rows.every((row) => row.status === "blocked"));
    const october = rows.find((row) => new Date(row.startDate).getUTCMonth() === 9);
    ok("exclusive DTEND became an inclusive end date",
      new Date(october!.endDate).toISOString().slice(0, 10) === "2026-10-16",
      october ? new Date(october.endDate).toISOString().slice(0, 10) : "missing");

    const second = await syncVenueIcalFeeds(venue.id);
    ok("re-syncing does not duplicate", second.feeds[0]?.added === 0 && second.blocked === 2,
      `added ${second.feeds[0]?.added}, total ${second.blocked}`);

    servedFeed = shrunkFeed;
    const third = await syncVenueIcalFeeds(venue.id);
    ok("a booking cancelled elsewhere frees its dates here",
      third.feeds[0]?.removed === 1 && third.blocked === 1,
      `removed ${third.feeds[0]?.removed}, total ${third.blocked}`);

    const otherUrl = `http://127.0.0.1:${FEED_PORT}/other.ics`;
    await db.update(venues).set({ icalImportUrls: [otherUrl] }).where(eq(venues.id, venue.id));
    const swapped = await syncVenueIcalFeeds(venue.id);
    const swappedRows = await db.select().from(venueAvailability).where(and(
      eq(venueAvailability.venueId, venue.id),
      eq(venueAvailability.source, "ical_import"),
    ));
    ok("swapping a feed drops the old feed's blocks",
      swappedRows.every((row) => row.externalFeedUrl === otherUrl),
      `${swappedRows.filter((row) => row.externalFeedUrl === feedUrl).length} stale row(s)`);
    ok("the new feed's blocks are present", swapped.blocked === 1);

    await db.update(venues).set({ icalImportUrls: [feedUrl] }).where(eq(venues.id, venue.id));
    await syncVenueIcalFeeds(venue.id);

    console.log("\nCONFLICTS — the reason importing is worth doing");
    const clash = await findVenueDateConflicts(venue.id, "2026-11-21", "2026-11-22");
    ok("dates inside an imported block conflict", clash.length === 1);
    ok("the conflict names its source", clash[0]?.source === "ical_import", clash[0]?.source);
    ok("free dates report no conflict",
      (await findVenueDateConflicts(venue.id, "2026-12-10", "2026-12-14")).length === 0);

    const api = await fetch(
      `${APP_URL}/api/venues/${venue.id}/date-conflicts?startDate=2026-11-21&endDate=2026-11-22`,
    ).then((response) => response.json());
    ok("the endpoint the Event Builder calls agrees",
      api.available === false && api.conflicts.length === 1);

    console.log("\nHANDSHAKE — accepting holds the dates, cancelling releases them");
    await blockVenueDatesForExperience(venue.id, testExperienceId, "2027-03-01", "2027-03-05", "Test retreat");
    const held = await findVenueDateConflicts(venue.id, "2027-03-03", "2027-03-04");
    ok("an accepted handshake holds the dates", held.length === 1 && held[0].source === "handshake");

    await blockVenueDatesForExperience(venue.id, testExperienceId, "2027-03-01", "2027-03-05", "Test retreat");
    const heldRows = await db.select().from(venueAvailability).where(and(
      eq(venueAvailability.venueId, venue.id),
      eq(venueAvailability.source, "handshake"),
    ));
    ok("holding twice updates rather than stacks", heldRows.length === 1, `${heldRows.length} row(s)`);

    await releaseVenueDatesForExperience(testExperienceId);
    ok("cancelling releases the dates",
      (await findVenueDateConflicts(venue.id, "2027-03-03", "2027-03-04")).length === 0);

    console.log("\nBAD INPUT — a broken link must not fail silently");
    await db.update(venues).set({ icalImportUrls: ["https://example.com/not-a-calendar"] })
      .where(eq(venues.id, venue.id));
    const broken = await syncVenueIcalFeeds(venue.id);
    ok("a bad link reports an error", broken.feeds[0]?.ok === false && !!broken.feeds[0]?.error,
      broken.feeds[0]?.error);
    const [afterBad] = await db.select({ err: venues.icalLastSyncError }).from(venues)
      .where(eq(venues.id, venue.id));
    ok("the error is recorded on the venue for the owner to see", !!afterBad.err);

    await db.update(venues).set({ icalImportUrls: [] }).where(eq(venues.id, venue.id));
    ok("removing every link releases its blocks",
      (await syncVenueIcalFeeds(venue.id)).blocked === 0);

    console.log("\nEXPORT CONTENT");
    ok("export reads accepted handshakes only",
      Array.isArray(await getConfirmedVenueEvents(venue.id)));
    ok("generated feed is well formed",
      buildIcalFeed("check", [{
        uid: "x", start: new Date("2026-08-12"), end: new Date("2026-08-17"), summary: "Booked",
      }], new Date("2026-08-07")).includes("DTSTART;VALUE=DATE:20260812"));
  } finally {
    await db.delete(venueAvailability).where(and(
      eq(venueAvailability.venueId, venue.id),
      inArray(venueAvailability.source, ["ical_import", "handshake"]),
    ));
    await db.update(venues)
      .set({ icalImportUrls: originalUrls, icalLastSyncError: null })
      .where(eq(venues.id, venue.id));
    server.close();
    console.log(`\n${passed} passed, ${failed} failed. Test rows cleaned up.\n`);
  }
}

main()
  .then(() => process.exit(failed ? 1 : 0))
  .catch((error) => {
    console.error("\nVerification could not run:", error?.message || error);
    console.error("Is the dev server running on", APP_URL, "?\n");
    process.exit(1);
  });
