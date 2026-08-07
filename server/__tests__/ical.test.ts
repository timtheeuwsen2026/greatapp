import { describe, it, expect } from "vitest";
import { parseIcalBusyPeriods, buildIcalFeed, rangesOverlap } from "../ical";

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
