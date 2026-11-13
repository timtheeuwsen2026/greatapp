import { describe, expect, it } from "vitest";
import {
  calculateMvgDeadline,
  isMvgDeadlineDue,
  normalizeMvgDeadlineDays,
} from "../mvgDeadlineRules";

describe("MVG deadline rules", () => {
  it("preserves a zero-day deadline", () => {
    expect(normalizeMvgDeadlineDays(0)).toBe(0);
  });

  // 66.21: the deadline counts back from the start time, in Barcelona time.
  const test2 = { city: "Barcelona", startDate: "2026-11-11T07:00:00.000Z", startTime: "18:00" };

  it("puts a zero deadline at the start time, when sales close", () => {
    const deadline = calculateMvgDeadline(test2, 0);

    expect(deadline.toISOString()).toBe("2026-11-11T17:00:00.000Z");
    expect(isMvgDeadlineDue({
      requireMinimumParticipants: true,
      mvgStatus: "pending",
      mvgDeadline: deadline,
    }, new Date("2026-11-11T16:59:00.000Z"))).toBe(false);
    expect(isMvgDeadlineDue({
      requireMinimumParticipants: true,
      mvgStatus: "pending",
      mvgDeadline: deadline,
    }, new Date("2026-11-11T17:00:00.000Z"))).toBe(true);
  });

  it("counts days as 24 hours before the start", () => {
    expect(calculateMvgDeadline(test2, 2).toISOString()).toBe("2026-11-09T17:00:00.000Z");
  });

  it("takes hours over days, so a test event can close a few hours ahead", () => {
    expect(calculateMvgDeadline(test2, 7, 3).toISOString()).toBe("2026-11-11T14:00:00.000Z");
  });

  it("counts from the start of the day when an event has no start time", () => {
    expect(calculateMvgDeadline("2026-07-20T12:00:00.000Z", 3).toISOString()).toBe("2026-07-16T22:00:00.000Z");
  });

  it("does not reprocess resolved MVG events", () => {
    expect(isMvgDeadlineDue({
      requireMinimumParticipants: true,
      mvgStatus: "met",
      mvgDeadline: "2026-07-16T23:59:59.999Z",
    }, new Date("2026-07-17T00:00:00.000Z"))).toBe(false);
  });
});
