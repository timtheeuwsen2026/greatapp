import { describe, expect, it } from "vitest";
import {
  eventEndsAt,
  eventPhase,
  eventStartsAt,
  formatEventStart,
  formatEventWhen,
  formatInZone,
  groupDeadlineAt,
  parseClockTime,
  payoutDueAt,
} from "./eventTime";

// Stored the way the live events are: the day at 07:00 UTC, the times as text.
const test3 = { title: "TEST 3 - Split payout", city: "Barcelona", startDate: "2026-11-10T07:00:00.000Z", endDate: "2026-11-10T07:00:00.000Z", startTime: "00:00", endTime: "01:00" };
const test2 = { title: "TEST 2", city: "Barcelona", startDate: "2026-11-11T07:00:00.000Z", endDate: "2026-11-11T07:00:00.000Z", startTime: "18:00", endTime: "19:00" };
const amsterdam = { title: "Run Club Amsterdam Oud Zuid", city: "Amsterdam", startDate: "2026-11-14T07:00:00.000Z", endDate: "2026-11-14T07:00:00.000Z", startTime: "11:00", endTime: "12:00" };

describe("event start and end in the city's own time (66.21)", () => {
  it("reads TEST 3 as starting at 00:00 in Barcelona, not at noon UTC", () => {
    expect(eventStartsAt(test3)?.toISOString()).toBe("2026-11-09T23:00:00.000Z");
    expect(eventEndsAt(test3)?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("closes sales at the start: TEST 3 at 12:00 on 10 Nov is ended, not upcoming", () => {
    expect(eventPhase(test3, new Date("2026-11-09T22:30:00Z"))).toBe("upcoming");
    expect(eventPhase(test3, new Date("2026-11-09T23:30:00Z"))).toBe("happening");
    expect(eventPhase(test3, new Date("2026-11-10T11:00:00Z"))).toBe("ended");
  });

  it("pays out 24 hours after the real end: TEST 3 at 01:00 on 11 Nov, Barcelona time", () => {
    expect(payoutDueAt(test3)?.toISOString()).toBe("2026-11-11T00:00:00.000Z");
    expect(formatInZone(payoutDueAt(test3), "Europe/Madrid")).toBe("Wed 11 Nov 2026, 01:00");
  });

  it("puts the minimum-group deadline a number of hours before the start", () => {
    expect(groupDeadlineAt(test2, 0)?.toISOString()).toBe("2026-11-11T17:00:00.000Z");
    expect(groupDeadlineAt(test2, 3)?.toISOString()).toBe("2026-11-11T14:00:00.000Z");
    expect(groupDeadlineAt(test2, 48)?.toISOString()).toBe("2026-11-09T17:00:00.000Z");
  });

  it("uses Amsterdam time for an Amsterdam event", () => {
    expect(eventStartsAt(amsterdam)?.toISOString()).toBe("2026-11-14T10:00:00.000Z");
    expect(formatEventStart(amsterdam)).toBe("Sat 14 Nov 2026, 11:00");
  });

  it("follows summer time", () => {
    const summer = { city: "Barcelona", startDate: "2026-07-04T12:00:00.000Z", startTime: "10:00" };
    expect(eventStartsAt(summer)?.toISOString()).toBe("2026-07-04T08:00:00.000Z");
  });

  it("runs an evening past midnight into the next day", () => {
    const late = { city: "Barcelona", startDate: "2026-11-20T12:00:00.000Z", endDate: "2026-11-20T12:00:00.000Z", startTime: "22:00", endTime: "02:00" };
    expect(eventEndsAt(late)?.toISOString()).toBe("2026-11-21T01:00:00.000Z");
  });

  it("treats a day without times as running from its first to its last day", () => {
    const retreat = { city: "Ubud", startDate: "2026-12-01T12:00:00.000Z", endDate: "2026-12-04T12:00:00.000Z" };
    expect(eventStartsAt(retreat)?.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(eventEndsAt(retreat)?.toISOString()).toBe("2026-12-04T22:59:59.999Z");
    expect(formatEventWhen(retreat)).toBe("Tue 1 Dec 2026 – Fri 4 Dec 2026");
  });

  it("writes dates as people in Barcelona read them", () => {
    expect(formatEventWhen(test2)).toBe("Wed 11 Nov 2026, 18:00 – 19:00");
    expect(formatEventStart(test3, { weekday: false, year: false })).toBe("10 Nov, 00:00");
  });

  it("understands the time formats people type", () => {
    expect(parseClockTime("18:00")).toEqual([18, 0]);
    expect(parseClockTime("6:30 PM")).toEqual([18, 30]);
    expect(parseClockTime("12:00 am")).toEqual([0, 0]);
    expect(parseClockTime("")).toBeNull();
    expect(parseClockTime("soon")).toBeNull();
  });
});
