import { describe, expect, it, vi } from "vitest";

// The scheduler pulls in the database and the mailer at import time; the
// question under test is purely "when did this event finish?".
vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../notifications", () => ({ notificationService: {} }));
vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));

const { resolveEventEndsAt } = await import("../event-reminder-scheduler");

// "Two hours after the event ends" only works if we know when it ended.
// Reading the date alone would email a Sunday morning run club at 2am; reading
// it as the start would email them mid-run.
describe("resolveEventEndsAt", () => {
  it("uses the finishing time on a day event", () => {
    const ends = resolveEventEndsAt({
      startDate: "2026-08-23T00:00:00.000Z",
      endDate: "2026-08-23T00:00:00.000Z",
      endTime: "11:30",
    });
    expect(ends?.getHours()).toBe(11);
    expect(ends?.getMinutes()).toBe(30);
  });

  it("runs a trip to the end of its last day when there is no time", () => {
    const ends = resolveEventEndsAt({
      startDate: "2026-08-20T00:00:00.000Z",
      endDate: "2026-08-24T00:00:00.000Z",
    });
    expect(ends?.getHours()).toBe(23);
    expect(ends?.getMinutes()).toBe(59);
    expect(ends?.getDate()).toBe(24);
  });

  it("falls back to the start date when no end date was set", () => {
    const ends = resolveEventEndsAt({ startDate: "2026-08-23T00:00:00.000Z", endTime: "18:00" });
    expect(ends?.getHours()).toBe(18);
  });

  it("ignores a malformed time rather than inventing one", () => {
    for (const endTime of ["", "soon", "99:99", "25:00", "11:70"]) {
      const ends = resolveEventEndsAt({ endDate: "2026-08-23T00:00:00.000Z", endTime });
      expect(ends?.getHours(), `endTime=${endTime}`).toBe(23);
    }
  });

  it("returns null when there is no date at all", () => {
    expect(resolveEventEndsAt({})).toBeNull();
    expect(resolveEventEndsAt({ endDate: "not a date" })).toBeNull();
    expect(resolveEventEndsAt(null)).toBeNull();
  });
});
