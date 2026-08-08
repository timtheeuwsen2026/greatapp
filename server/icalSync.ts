/**
 * Keeps a venue's dates in step with the calendars it already runs on.
 *
 * Import: every configured .ics feed is fetched and its busy periods written
 * into venue_availability as blocked. Blocks are keyed by (venue, feed, event
 * uid) so a re-run updates what changed and withdraws what the feed dropped —
 * a booking cancelled on Airbnb frees the date here on the next sync, and a
 * feed that has been removed takes its blocks with it.
 *
 * Export lives in ical.ts; this file is the reading half plus the conflict
 * check that gives the reading a point.
 */

import { randomBytes } from "crypto";
import { and, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { db } from "./db";
import { venueAvailability, venues, experiences, venueContracts } from "../shared/schema";
import { fetchIcalFeed, parseIcalBusyPeriods, rangesOverlap } from "./ical";

export type FeedSyncResult = {
  url: string;
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  /** Events outside the import window — history, or too far ahead to matter. */
  skippedOutsideWindow?: number;
  /** Events dropped at the per-feed ceiling. Surfaced, never silent. */
  truncated?: number;
  error?: string;
};

export type VenueSyncResult = {
  venueId: string;
  feeds: FeedSyncResult[];
  blocked: number;
  error?: string;
};

/** Mints the venue's export token on first use. The URL is the credential. */
export async function ensureIcalExportToken(venueId: string): Promise<string> {
  const [venue] = await db
    .select({ token: venues.icalExportToken })
    .from(venues)
    .where(eq(venues.id, venueId));

  if (venue?.token) return venue.token;

  const token = randomBytes(24).toString("base64url");
  await db.update(venues).set({ icalExportToken: token }).where(eq(venues.id, venueId));
  return token;
}

/**
 * An imported event's end is exclusive (DTEND is the checkout morning), but a
 * venue_availability block reads inclusively — "blocked 12th to 16th". Step
 * back one day so an import does not block a day the feed left free.
 */
function inclusiveEnd(start: Date, exclusiveEnd: Date): Date {
  const stepped = new Date(exclusiveEnd.getTime() - 86400000);
  return stepped.getTime() < start.getTime() ? start : stepped;
}

/**
 * How far ahead a venue's availability is worth knowing about. Nobody holds a
 * venue three years out, and importing that far turns a long-lived calendar
 * into thousands of irrelevant rows.
 */
export const IMPORT_HORIZON_MONTHS = 24;

/**
 * A ceiling on what one feed may write. Reached only by a calendar that is
 * not really a booking calendar; the venue is told rather than left to wonder
 * why later dates are missing.
 */
export const MAX_BLOCKS_PER_FEED = 1000;

/** Rows per INSERT. One statement per event turned a first sync into minutes. */
const INSERT_CHUNK = 200;

/**
 * The window worth importing: from today to the horizon.
 *
 * Someone connecting a personal Google Calendar brings a decade of history
 * with them — a 1999 dentist appointment says nothing about whether the venue
 * is free next August, and importing it cost six minutes and thousands of
 * rows. An event that is running right now still counts, so the test is on
 * the end date, not the start.
 */
export function withinImportWindow(start: Date, end: Date, now: Date): boolean {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const horizon = new Date(today);
  horizon.setUTCMonth(horizon.getUTCMonth() + IMPORT_HORIZON_MONTHS);
  return end.getTime() >= today.getTime() && start.getTime() <= horizon.getTime();
}

/** Pulls one feed into venue_availability. Never throws — the result carries the error. */
async function syncOneFeed(venueId: string, url: string, now = new Date()): Promise<FeedSyncResult> {
  const result: FeedSyncResult = { url, ok: false, added: 0, updated: 0, removed: 0 };

  let periods;
  try {
    periods = parseIcalBusyPeriods(await fetchIcalFeed(url));
  } catch (error: any) {
    result.error = error?.message || "Could not read that calendar.";
    return result;
  }

  const existing = await db
    .select()
    .from(venueAvailability)
    .where(and(
      eq(venueAvailability.venueId, venueId),
      eq(venueAvailability.externalFeedUrl, url),
      isNotNull(venueAvailability.externalUid),
    ));

  const byUid = new Map(existing.map((row) => [row.externalUid as string, row]));
  const seen = new Set<string>();

  // Decide everything in memory first, then write in batches. Deciding and
  // writing in the same loop meant one database round trip per event.
  const toInsert: Array<typeof venueAvailability.$inferInsert> = [];
  const toUpdate: Array<{ id: string; startDate: Date; endDate: Date; notes: string }> = [];

  const relevant = periods
    .map((period) => ({ ...period, end: inclusiveEnd(period.start, period.end) }))
    .filter((period) => withinImportWindow(period.start, period.end, now))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  result.skippedOutsideWindow = periods.length - relevant.length;
  if (relevant.length > MAX_BLOCKS_PER_FEED) {
    result.truncated = relevant.length - MAX_BLOCKS_PER_FEED;
    relevant.length = MAX_BLOCKS_PER_FEED;
  }

  for (const period of relevant) {
    const uid = period.uid.slice(0, 512);
    seen.add(uid);

    const start = period.start;
    const end = period.end;
    const notes = period.summary
      ? `Imported from your calendar — ${period.summary}`
      : "Imported from your calendar";

    const current = byUid.get(uid);
    if (!current) {
      toInsert.push({
        venueId,
        startDate: start,
        endDate: end,
        status: "blocked",
        source: "ical_import",
        notes,
        externalFeedUrl: url,
        externalUid: uid,
      });
      continue;
    }

    const unchanged =
      new Date(current.startDate).getTime() === start.getTime() &&
      new Date(current.endDate).getTime() === end.getTime() &&
      current.notes === notes;

    if (!unchanged) toUpdate.push({ id: current.id, startDate: start, endDate: end, notes });
  }

  for (let index = 0; index < toInsert.length; index += INSERT_CHUNK) {
    const chunk = toInsert.slice(index, index + INSERT_CHUNK);
    // Upsert rather than insert. The hourly job and a venue pressing "Sync
    // now" can land on the same feed at the same time; both would read no
    // existing row and both would try to write one. The unique index would
    // reject the loser and take the whole sync down with it.
    await db
      .insert(venueAvailability)
      .values(chunk)
      .onConflictDoUpdate({
        target: [venueAvailability.venueId, venueAvailability.externalFeedUrl, venueAvailability.externalUid],
        // The unique index is partial, so the predicate has to be repeated
        // here or Postgres cannot work out which index to arbitrate on.
        targetWhere: isNotNull(venueAvailability.externalUid),
        set: {
          startDate: sql`excluded.start_date`,
          endDate: sql`excluded.end_date`,
          notes: sql`excluded.notes`,
          status: sql`excluded.status`,
          updatedAt: new Date(),
        },
      });
    result.added += chunk.length;
  }

  for (const row of toUpdate) {
    await db
      .update(venueAvailability)
      .set({ startDate: row.startDate, endDate: row.endDate, notes: row.notes, status: "blocked", updatedAt: new Date() })
      .where(eq(venueAvailability.id, row.id));
    result.updated += 1;
  }

  // Anything the feed no longer lists has been cancelled at the source. Drop
  // it, or the venue stays blocked on a date it has since freed.
  const stale = existing.filter((row) => !seen.has(row.externalUid as string)).map((row) => row.id);
  if (stale.length) {
    await db.delete(venueAvailability).where(inArray(venueAvailability.id, stale));
    result.removed = stale.length;
  }

  result.ok = true;
  return result;
}

/**
 * One sync per venue at a time.
 *
 * The hourly job and a venue pressing "Sync now" reach the same code. Running
 * both at once still lands correct data — the writes are upserts — but they
 * fetch the same feeds twice and report counts that describe each other's
 * work. Joining the run in progress is both cheaper and more truthful.
 */
const inFlight = new Map<string, Promise<VenueSyncResult>>();

export function syncVenueIcalFeeds(venueId: string): Promise<VenueSyncResult> {
  const running = inFlight.get(venueId);
  if (running) return running;

  const run = syncVenueIcalFeedsUncoordinated(venueId).finally(() => inFlight.delete(venueId));
  inFlight.set(venueId, run);
  return run;
}

/** Syncs every feed configured on a venue and records the outcome on the venue. */
async function syncVenueIcalFeedsUncoordinated(venueId: string): Promise<VenueSyncResult> {
  const [venue] = await db
    .select({ id: venues.id, urls: venues.icalImportUrls })
    .from(venues)
    .where(eq(venues.id, venueId));

  if (!venue) return { venueId, feeds: [], blocked: 0, error: "Venue not found" };

  const urls = Array.isArray(venue.urls) ? venue.urls.filter(Boolean) : [];

  // Blocks whose feed is no longer configured belong to nothing. Clear them so
  // removing a link actually releases its dates.
  const orphanFilter = urls.length
    ? and(
        eq(venueAvailability.venueId, venueId),
        eq(venueAvailability.source, "ical_import"),
        isNotNull(venueAvailability.externalFeedUrl),
        notInArray(venueAvailability.externalFeedUrl, urls),
      )
    : and(
        eq(venueAvailability.venueId, venueId),
        eq(venueAvailability.source, "ical_import"),
      );
  await db.delete(venueAvailability).where(orphanFilter);

  const feeds: FeedSyncResult[] = [];
  for (const url of urls) {
    feeds.push(await syncOneFeed(venueId, url));
  }

  const failures = feeds.filter((feed) => !feed.ok);
  await db
    .update(venues)
    .set({
      icalLastSyncedAt: new Date(),
      icalLastSyncError: failures.length
        ? failures.map((feed) => `${feed.url}: ${feed.error}`).join(" | ").slice(0, 1000)
        : null,
    })
    .where(eq(venues.id, venueId));

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(venueAvailability)
    .where(and(
      eq(venueAvailability.venueId, venueId),
      eq(venueAvailability.source, "ical_import"),
    ));

  return { venueId, feeds, blocked: Number(count) || 0 };
}

/** Syncs every venue that has at least one feed. Used by the scheduler. */
export async function syncAllVenueIcalFeeds(): Promise<{ venues: number; feeds: number; failed: number }> {
  const rows = await db
    .select({ id: venues.id, urls: venues.icalImportUrls })
    .from(venues)
    .where(sql`jsonb_array_length(coalesce(${venues.icalImportUrls}, '[]'::jsonb)) > 0`);

  let feedCount = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await syncVenueIcalFeeds(row.id);
      feedCount += result.feeds.length;
      failed += result.feeds.filter((feed) => !feed.ok).length;
    } catch (error) {
      failed += 1;
      console.error(`[iCal Sync] Venue ${row.id} failed:`, error);
    }
  }

  return { venues: rows.length, feeds: feedCount, failed };
}

// ─── Conflict checking ──────────────────────────────────────────────────────

export type VenueDateConflict = {
  startDate: string;
  endDate: string;
  source: string;
};

/**
 * The blocks standing between a venue and a set of dates.
 *
 * This is the whole point of importing: a creator picking dates, and the
 * server accepting a handshake, both ask this before going any further.
 */
export async function findVenueDateConflicts(
  venueId: string,
  startDate: Date | string,
  endDate: Date | string | null | undefined,
): Promise<VenueDateConflict[]> {
  if (!venueId || !startDate) return [];

  const blocks = await db
    .select()
    .from(venueAvailability)
    .where(and(
      eq(venueAvailability.venueId, venueId),
      eq(venueAvailability.status, "blocked"),
    ));

  // Dates and where the block came from, never the note. An imported block
  // carries the event's own title — "Riga", "Marek Tim" — and this answer
  // goes to any creator who asks whether a venue is free. That a venue is
  // busy is the venue's business to share; what it is busy doing is not.
  return blocks
    .filter((block) => rangesOverlap(startDate, endDate, block.startDate, block.endDate))
    .map((block) => ({
      startDate: new Date(block.startDate).toISOString(),
      endDate: new Date(block.endDate).toISOString(),
      source: block.source,
    }));
}

/**
 * Blocks the venue's calendar on an accepted handshake.
 *
 * Two things depend on this. The venue's own availability view has to show the
 * date as taken, and — more importantly — the next creator to ask for those
 * dates must be turned away, which findVenueDateConflicts only knows to do if
 * the block exists.
 *
 * Keyed on the experience so accepting twice updates rather than stacks.
 */
export async function blockVenueDatesForExperience(
  venueId: string,
  experienceId: string,
  startDate: Date | string,
  endDate: Date | string | null | undefined,
  title?: string | null,
): Promise<void> {
  if (!venueId || !experienceId || !startDate) return;

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

  const uid = `experience-${experienceId}`;
  const notes = title ? `Booked on Great. — ${title}` : "Booked on Great.";

  const [existing] = await db
    .select()
    .from(venueAvailability)
    .where(and(
      eq(venueAvailability.venueId, venueId),
      eq(venueAvailability.externalUid, uid),
    ));

  if (existing) {
    await db
      .update(venueAvailability)
      .set({ startDate: start, endDate: end, status: "blocked", notes, updatedAt: new Date() })
      .where(eq(venueAvailability.id, existing.id));
    return;
  }

  await db.insert(venueAvailability).values({
    venueId,
    startDate: start,
    endDate: end,
    status: "blocked",
    source: "handshake",
    notes,
    externalUid: uid,
  });
}

/** Releases the dates an experience held — used when a deal falls through. */
export async function releaseVenueDatesForExperience(experienceId: string): Promise<void> {
  if (!experienceId) return;
  await db
    .delete(venueAvailability)
    .where(and(
      eq(venueAvailability.source, "handshake"),
      eq(venueAvailability.externalUid, `experience-${experienceId}`),
    ));
}

/**
 * The events this venue has actually agreed to host, for its outbound feed. A
 * venue publishes this URL into Airbnb or Google so a deal agreed here blocks
 * the date everywhere else too.
 *
 * The signal is an accepted Digital Handshake, not a published event: a
 * creator listing a trip at a venue that has not agreed yet is a request, and
 * blocking the venue's real calendar on it would cost them a booking they
 * never turned down. Cancelled events drop out on the next fetch.
 */
export async function getConfirmedVenueEvents(venueId: string) {
  return db
    .select({
      id: experiences.id,
      title: experiences.title,
      startDate: experiences.startDate,
      endDate: experiences.endDate,
      status: experiences.status,
      location: experiences.location,
      maxParticipants: experiences.maxParticipants,
    })
    .from(venueContracts)
    .innerJoin(experiences, eq(venueContracts.experienceId, experiences.id))
    .where(and(
      eq(venueContracts.venueId, venueId),
      eq(venueContracts.status, "accepted"),
      ne(experiences.status, "cancelled"),
      isNotNull(experiences.startDate),
    ));
}
