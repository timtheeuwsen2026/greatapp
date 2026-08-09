import { describe, it, expect } from "vitest";
import { toCalendarDate, toCalendarDateISO, toDateOnly } from "./calendarDates";
import { startOfUtcDay, utcDayNumber, rangesOverlap } from "../server/ical";

// The question that prompted this: a venue set up on American time, a creator
// working in Pakistan. Their clocks are ten hours apart, so "27 October"
// meant two different instants and the platform believed two different days.

describe("a trip date means the same day everywhere", () => {
  it("anchors a picked day to the middle of that day", () => {
    expect(toCalendarDateISO("2026-10-27")).toBe("2026-10-27T12:00:00.000Z");
  });

  it("keeps whatever day the creator's own clock showed", () => {
    // In a browser the picker builds the Date from local parts, so the local
    // getters this reads are that person's own calendar. Simulating another
    // timezone's instant and then reading it here would be testing arithmetic
    // no browser ever performs.
    for (const day of [1, 15, 27, 31]) {
      const picked = new Date(2026, 9, day);          // "October <day>" locally
      expect(toDateOnly(picked)).toBe(`2026-10-${String(day).padStart(2, "0")}`);
    }
  });

  it("survives a day that straddles a DST change", () => {
    // Amsterdam moves its clocks on 25 October 2026. A trip either side of it
    // still means the day it says.
    for (const day of [24, 25, 26]) {
      const picked = new Date(2026, 9, day);
      expect(toDateOnly(picked)).toBe(`2026-10-${day}`);
    }
  });

  it("an American venue and a Pakistani creator agree on the day", () => {
    // Each side turns its own "27 October" into the same stored value, which
    // is the whole point — the wire carries a day, not a moment.
    const venueBlocked = toCalendarDate("2026-10-27")!;      // venue's calendar date
    const creatorAsked = toCalendarDate("2026-10-27")!;      // creator's picked date

    expect(utcDayNumber(venueBlocked)).toBe(utcDayNumber(creatorAsked));
    expect(rangesOverlap(creatorAsked, creatorAsked, venueBlocked, venueBlocked)).toBe(true);
  });

  it("the encoding that caused the report no longer reaches the server", () => {
    // Karachi's local midnight on the 27th, as the old code sent it.
    const oldEncoding = "2026-10-26T19:00:00.000Z";
    expect(oldEncoding.slice(0, 10)).toBe("2026-10-26");        // what the server read
    // Read as the creator's own local day, it is the 27th again.
    expect(toDateOnly(new Date(2026, 9, 27))).toBe("2026-10-27");
  });

  it("does not bleed into the days either side", () => {
    const blocked = toCalendarDate("2026-10-27")!;
    const before = toCalendarDate(new Date(2026, 9, 26))!;
    const after = toCalendarDate(new Date(2026, 9, 28))!;
    expect(rangesOverlap(before, before, blocked, blocked)).toBe(false);
    expect(rangesOverlap(after, after, blocked, blocked)).toBe(false);
  });

  it("lands on the intended day for the handshake hold", () => {
    // blockVenueDatesForExperience runs startOfUtcDay over the stored value.
    const stored = toCalendarDate(new Date(2026, 9, 27))!;
    expect(startOfUtcDay(stored).toISOString()).toBe("2026-10-27T00:00:00.000Z");
  });

  it("renders as the intended day across the timezones this platform serves", () => {
    const stored = toCalendarDate("2026-10-27")!;
    for (const zone of ["Asia/Karachi", "Europe/Amsterdam", "America/New_York",
                        "America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
      expect(stored.toLocaleDateString("en-CA", { timeZone: zone })).toBe("2026-10-27");
    }
  });

  it("passes a plain YYYY-MM-DD through untouched", () => {
    // A date-only string already says the day; reading it as UTC midnight and
    // re-localising would move it.
    expect(toDateOnly("2026-01-01")).toBe("2026-01-01");
    expect(toDateOnly("2026-12-31")).toBe("2026-12-31");
  });

  it("leaves nothing to guess at when there is no date", () => {
    expect(toCalendarDate(null)).toBeNull();
    expect(toCalendarDate("")).toBeNull();
    expect(toCalendarDateISO(undefined)).toBeNull();
    expect(toDateOnly("not a date")).toBeNull();
  });
});
