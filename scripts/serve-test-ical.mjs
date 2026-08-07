/**
 * Serves a fake Airbnb-style calendar so you can test iCal import without
 * owning an Airbnb or Booking.com listing.
 *
 *   node scripts/serve-test-ical.mjs
 *
 * Then paste the printed URL into a venue's Calendar & Availability step and
 * hit "Save & sync". The dates it blocks are printed too, so you know exactly
 * what should turn red in the builder and what the conflict banner should
 * refuse in the Event Builder.
 *
 * Flags:
 *   --port 4599        which port to serve on
 *   --cancel           drop the first booking, to test that a cancellation
 *                      elsewhere frees the date here on the next sync
 */

import http from "http";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]) || 4599;
const cancelled = args.includes("--cancel");

/** YYYYMMDD, `offset` days from today. */
function stamp(offset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function readable(offset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toDateString();
}

// Two bookings: one soon, one further out. DTEND is exclusive in iCalendar,
// so a booking ending on the 17th is written as the 18th.
const bookings = [
  { uid: "test-booking-1@example.com", from: 30, to: 36, summary: "Reserved" },
  { uid: "test-booking-2@example.com", from: 60, to: 64, summary: "Reserved" },
].slice(cancelled ? 1 : 0);

function buildFeed() {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test Feed//EN", "CALSCALE:GREGORIAN"];
  for (const booking of bookings) {
    lines.push(
      "BEGIN:VEVENT",
      `DTSTART;VALUE=DATE:${stamp(booking.from)}`,
      `DTEND;VALUE=DATE:${stamp(booking.to + 1)}`,
      `UID:${booking.uid}`,
      `SUMMARY:${booking.summary}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

http
  .createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/calendar; charset=utf-8" });
    res.end(buildFeed());
  })
  .listen(port, () => {
    console.log(`\nTest calendar running.\n`);
    console.log(`  Paste this into the venue's Calendar step:\n`);
    console.log(`      http://localhost:${port}/calendar.ics\n`);
    console.log(`  It blocks ${bookings.length} range${bookings.length === 1 ? "" : "s"}:\n`);
    for (const booking of bookings) {
      console.log(`      ${readable(booking.from)}  →  ${readable(booking.to)}`);
    }
    console.log(`\n  Those dates should show as blocked in the venue's Availability,`);
    console.log(`  and the Event Builder should refuse them for this venue.\n`);
    if (!cancelled) {
      console.log(`  Re-run with --cancel to drop the first booking, then hit`);
      console.log(`  "Sync now" — those dates should free up again.\n`);
    }
    console.log(`  Ctrl+C to stop.\n`);
  });
