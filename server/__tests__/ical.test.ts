import { describe, it, expect } from "vitest";
import { parseIcalBusyPeriods, buildIcalFeed, rangesOverlap, startOfUtcDay, lastDayTouched } from "../ical";
import { withinImportWindow, IMPORT_HORIZON_MONTHS } from "../icalSync";

/** Wraps VEVENT bodies in a minimal calendar so the parser sees real input. */
function calendar(...events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//EN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("parseIcalBusyPeriods", () => {
  it("reads an Airbnb-style all-day booking", () => {
    const periods = parseIcalBusyPeriods(calendar([
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260812",
      "DTEND;VALUE=DATE:20260817",
      "UID:abc123@airbnb.com",
      "SUMMARY:Reserved",
      "END:VEVENT",
    ].join("\r\n")));

    expect(periods).toHaveLength(1);
    expect(periods[0].uid).toBe("abc123@airbnb.com");
    expect(periods[0].start.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    // DTEND is exclusive — the guest leaves on the 17th.
    expect(periods[0].end.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(periods[0].summary).toBe("Reserved");
  });

  it("reads a Google-style timed event", () => {
    const periods = parseIcalBusyPeriods(calendar([
      "BEGIN:VEVENT",
      "DTSTART:20260901T090000Z",
      "DTEND:20260901T170000Z",
      "UID:google-1",
      "SUMMARY:Private hire",
      "END:VEVENT",
    ].join("\r\n")));

    expect(periods).toHaveLength(1);
    expect(periods[0].start.toISOString()).toBe("2026-09-01T09:00:00.000Z");
    expect(periods[0].end.toISOString()).toBe("2026-09-01T17:00:00.000Z");
  });

  it("skips cancelled and free-time events", () => {
    const periods = parseIcalBusyPeriods(calendar(
      [
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260101",
        "DTEND;VALUE=DATE:20260102",
        "UID:cancelled-1",
        "STATUS:CANCELLED",
        "END:VEVENT",
      ].join("\r\n"),
      [
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260201",
        "DTEND;VALUE=DATE:20260202",
        "UID:free-1",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n"),
      [
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260301",
        "DTEND;VALUE=DATE:20260302",
        "UID:real-1",
        "END:VEVENT",
      ].join("\r\n"),
    ));

    // A cancelled booking and a "free" hold must not block a venue.
    expect(periods.map((period) => period.uid)).toEqual(["real-1"]);
  });

  it("unfolds long wrapped lines", () => {
    const summary = "A".repeat(90);
    const periods = parseIcalBusyPeriods(calendar([
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260401",
      "DTEND;VALUE=DATE:20260402",
      "UID:folded-1",
      `SUMMARY:${summary.slice(0, 60)}`,
      ` ${summary.slice(60)}`,
      "END:VEVENT",
    ].join("\r\n")));

    expect(periods[0].summary).toBe(summary);
  });

  it("treats an all-day event without DTEND as one day", () => {
    const periods = parseIcalBusyPeriods(calendar([
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260501",
      "UID:single-day",
      "END:VEVENT",
    ].join("\r\n")));

    expect(periods[0].end.toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });

  it("returns nothing for junk input", () => {
    expect(parseIcalBusyPeriods("")).toEqual([]);
    expect(parseIcalBusyPeriods("<html>not a calendar</html>")).toEqual([]);
  });
});

describe("buildIcalFeed", () => {
  const stampedAt = new Date("2026-08-07T12:00:00.000Z");

  it("writes an all-day VEVENT a calendar app can read", () => {
    const feed = buildIcalFeed("The Ashram — booked", [{
      uid: "experience-abc@great",
      start: new Date("2026-08-12T00:00:00.000Z"),
      end: new Date("2026-08-17T00:00:00.000Z"),
      summary: "Yoga retreat",
      description: "Confirmed on Great.",
      location: "Mallorca",
    }], stampedAt);

    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).toContain("DTSTART;VALUE=DATE:20260812");
    expect(feed).toContain("DTEND;VALUE=DATE:20260817");
    expect(feed).toContain("UID:experience-abc@great");
    expect(feed).toContain("SUMMARY:Yoga retreat");
    // The whole point: these dates are taken, not tentative.
    expect(feed).toContain("TRANSP:OPAQUE");
    expect(feed.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes commas and semicolons so a title cannot break the file", () => {
    const feed = buildIcalFeed("Test", [{
      uid: "u1",
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-01-02T00:00:00.000Z"),
      summary: "Surf, yoga; and cold plunge",
    }], stampedAt);

    expect(feed).toContain("SUMMARY:Surf\\, yoga\\; and cold plunge");
  });

  it("round-trips through the parser", () => {
    const feed = buildIcalFeed("Round trip", [{
      uid: "round-1",
      start: new Date("2026-06-10T00:00:00.000Z"),
      end: new Date("2026-06-15T00:00:00.000Z"),
      summary: "Booked",
    }], stampedAt);

    const [period] = parseIcalBusyPeriods(feed);
    expect(period.uid).toBe("round-1");
    expect(period.start.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("produces a valid empty calendar when a venue has nothing booked", () => {
    const feed = buildIcalFeed("Empty", [], stampedAt);
    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).not.toContain("BEGIN:VEVENT");
    expect(parseIcalBusyPeriods(feed)).toEqual([]);
  });
});

describe("rangesOverlap", () => {
  it("catches a trip that starts inside an existing block", () => {
    expect(rangesOverlap("2026-08-14", "2026-08-20", "2026-08-12", "2026-08-16")).toBe(true);
  });

  it("catches a block sitting entirely inside a trip", () => {
    expect(rangesOverlap("2026-08-01", "2026-08-31", "2026-08-12", "2026-08-16")).toBe(true);
  });

  it("treats a shared changeover day as a clash", () => {
    // Venues here are taken whole, so one group leaving as another arrives is
    // still a double-booking.
    expect(rangesOverlap("2026-08-16", "2026-08-20", "2026-08-12", "2026-08-16")).toBe(true);
  });

  it("leaves genuinely separate ranges alone", () => {
    expect(rangesOverlap("2026-08-17", "2026-08-20", "2026-08-12", "2026-08-16")).toBe(false);
    expect(rangesOverlap("2026-08-01", "2026-08-05", "2026-08-12", "2026-08-16")).toBe(false);
  });

  it("handles single-day ranges with no end date", () => {
    expect(rangesOverlap("2026-08-13", null, "2026-08-12", "2026-08-16")).toBe(true);
    expect(rangesOverlap("2026-08-20", null, "2026-08-12", "2026-08-16")).toBe(false);
  });

  it("does not claim an overlap it cannot verify", () => {
    expect(rangesOverlap("not a date", null, "2026-08-12", "2026-08-16")).toBe(false);
  });
});

// Reported from production: a venue connected a personal Google Calendar with
// fourteen years of history. The sync imported every event — a 1999 dentist
// appointment among them — writing thousands of rows one statement at a time,
// and taking six minutes. Availability only means anything from today
// forward, so the window is the fix and the batching is the speed.

describe("import window", () => {
  const inWindow = withinImportWindow;

  const now = new Date("2026-08-08T10:00:00.000Z");
  const at = (iso: string) => new Date(iso);

  it("ignores events that finished before today", () => {
    expect(inWindow(at("1999-12-14"), at("1999-12-14"), now)).toBe(false);
    expect(inWindow(at("2012-01-05"), at("2012-01-08"), now)).toBe(false);
  });

  it("keeps an event that is running right now", () => {
    // Started before today but has not finished — the venue is busy.
    expect(inWindow(at("2026-08-01"), at("2026-08-20"), now)).toBe(true);
  });

  it("keeps today itself", () => {
    expect(inWindow(at("2026-08-08"), at("2026-08-08"), now)).toBe(true);
  });

  it("keeps a booking inside the horizon", () => {
    expect(inWindow(at("2027-06-01"), at("2027-06-08"), now)).toBe(true);
  });

  it("ignores an event beyond the horizon", () => {
    expect(inWindow(at("2029-01-01"), at("2029-01-05"), now)).toBe(false);
  });

  it("keeps the whole of a real booking calendar", () => {
    // The shape that matters: a venue's actual bookings all survive.
    const bookings = [
      [at("2026-08-12"), at("2026-08-16")],
      [at("2026-10-01"), at("2026-10-07")],
      [at("2027-03-20"), at("2027-03-27")],
    ];
    expect(bookings.every(([start, end]) => inWindow(start, end, now))).toBe(true);
  });
});

// UAT: a venue blocked 6am–3pm on 3 September in Google Calendar, and the
// platform still called the 3rd free. Blocks were stored with the event's
// clock times, and a creator picking "the 3rd" sends midnight — midnight is
// not inside 6am-to-3pm, so nothing overlapped. Availability is a day-level
// idea and has to be compared as one.

describe("whole-day blocks", () => {
  const dayOf = (start: Date, end: Date) => ({
    startDate: startOfUtcDay(start),
    endDate: lastDayTouched(start, end),
  });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const blocks = (start: Date, end: Date, day: string) => {
    const b = dayOf(start, end);
    return rangesOverlap(day, day, b.startDate, b.endDate);
  };

  it("blocks the day a timed Google event sits on", () => {
    const start = new Date("2026-09-03T06:00:00.000Z");
    const end = new Date("2026-09-03T15:00:00.000Z");
    expect(blocks(start, end, "2026-09-03")).toBe(true);
    expect(blocks(start, end, "2026-09-02")).toBe(false);
    expect(blocks(start, end, "2026-09-04")).toBe(false);
  });

  it("stores a timed event on day boundaries, not clock times", () => {
    const { startDate, endDate } = dayOf(
      new Date("2026-09-03T06:00:00.000Z"),
      new Date("2026-09-03T15:00:00.000Z"),
    );
    expect(startDate.toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-09-03T00:00:00.000Z");
  });

  it("keeps an all-day event's exclusive DTEND off the free day", () => {
    // 3rd to 6th means the 3rd, 4th and 5th. The 6th is still sellable.
    const { startDate, endDate } = dayOf(
      new Date("2026-09-03T00:00:00.000Z"),
      new Date("2026-09-06T00:00:00.000Z"),
    );
    expect(iso(startDate)).toBe("2026-09-03");
    expect(iso(endDate)).toBe("2026-09-05");
  });

  it("covers both days of an overnight timed event", () => {
    const start = new Date("2026-09-03T20:00:00.000Z");
    const end = new Date("2026-09-04T10:00:00.000Z");
    expect(blocks(start, end, "2026-09-03")).toBe(true);
    expect(blocks(start, end, "2026-09-04")).toBe(true);
    expect(blocks(start, end, "2026-09-05")).toBe(false);
  });

  it("treats an event ending exactly at midnight as the day before", () => {
    const start = new Date("2026-09-03T10:00:00.000Z");
    const end = new Date("2026-09-04T00:00:00.000Z");
    expect(blocks(start, end, "2026-09-03")).toBe(true);
    expect(blocks(start, end, "2026-09-04")).toBe(false);
  });

  it("catches a range that merely ends on the blocked day", () => {
    // The old comparison missed this: the query's end was midnight, the
    // block's start was 6am, so nothing overlapped.
    const b = dayOf(new Date("2026-09-03T06:00:00.000Z"), new Date("2026-09-03T15:00:00.000Z"));
    expect(rangesOverlap("2026-09-01", "2026-09-03", b.startDate, b.endDate)).toBe(true);
    expect(rangesOverlap("2026-09-03", "2026-09-06", b.startDate, b.endDate)).toBe(true);
    expect(rangesOverlap("2026-09-04", "2026-09-08", b.startDate, b.endDate)).toBe(false);
  });

  it("ignores the time of day on either side of the comparison", () => {
    // A creator's picker and a venue's calendar need not agree on hours.
    expect(rangesOverlap(
      "2026-09-03T23:30:00.000Z", "2026-09-03T23:30:00.000Z",
      "2026-09-03T00:15:00.000Z", "2026-09-03T00:15:00.000Z",
    )).toBe(true);
  });
});

// A subscribed calendar polls the feed on its own schedule. Stamping "now"
// on every response told it every booking had just been edited, every time.

describe("a feed only changes when the booking does", () => {
  it("uses the booking's own last-changed time", () => {
    const changedAt = new Date("2026-08-01T09:30:00.000Z");
    const feed = buildIcalFeed("Venue", [{
      uid: "experience-1@greatexperiences.ai",
      start: new Date("2026-08-10T00:00:00.000Z"),
      end: new Date("2026-08-11T00:00:00.000Z"),
      summary: "Yoga Training Soft",
      stamp: changedAt,
    }], new Date("2026-08-09T16:00:00.000Z"));

    expect(feed).toContain("DTSTAMP:20260801T093000Z");
    expect(feed).not.toContain("DTSTAMP:20260809T160000Z");
  });

  it("is byte-identical across two fetches when nothing changed", () => {
    const event = {
      uid: "experience-1@greatexperiences.ai",
      start: new Date("2026-08-10T00:00:00.000Z"),
      end: new Date("2026-08-11T00:00:00.000Z"),
      summary: "Yoga Training Soft",
      stamp: new Date("2026-08-01T09:30:00.000Z"),
    };
    const first = buildIcalFeed("Venue", [event], new Date("2026-08-09T16:00:00.000Z"));
    const second = buildIcalFeed("Venue", [event], new Date("2026-08-09T18:45:00.000Z"));
    expect(first).toBe(second);
  });

  it("still stamps something when the booking has no recorded change", () => {
    const feed = buildIcalFeed("Venue", [{
      uid: "u", start: new Date("2026-08-10T00:00:00.000Z"),
      end: new Date("2026-08-11T00:00:00.000Z"), summary: "Booked", stamp: null,
    }], new Date("2026-08-09T16:00:00.000Z"));
    expect(feed).toContain("DTSTAMP:20260809T160000Z");
  });

  it("carries the title through to the subscriber", () => {
    // The reported symptom was an untitled entry. SUMMARY has to survive
    // whatever the trip is called.
    for (const title of ["Yoga Training Soft", "Surf, yoga; and cold plunge", "Café Rëtreat 2026"]) {
      const feed = buildIcalFeed("Venue", [{
        uid: "u", start: new Date("2026-08-10T00:00:00.000Z"),
        end: new Date("2026-08-11T00:00:00.000Z"), summary: title,
      }], new Date("2026-08-09T16:00:00.000Z"));
      expect(parseIcalBusyPeriods(feed)[0].summary).toBe(title);
    }
  });
});
