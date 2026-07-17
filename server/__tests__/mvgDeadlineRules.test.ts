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

  it("keeps a zero-day deadline active through the end of the start day", () => {
    const deadline = calculateMvgDeadline("2026-07-17T00:00:00.000Z", 0);

    expect(deadline.toISOString()).toBe("2026-07-17T23:59:59.999Z");
    expect(isMvgDeadlineDue({
      requireMinimumParticipants: true,
      mvgStatus: "pending",
      mvgDeadline: deadline,
    }, new Date("2026-07-17T12:00:00.000Z"))).toBe(false);
    expect(isMvgDeadlineDue({
      requireMinimumParticipants: true,
      mvgStatus: "pending",
      mvgDeadline: deadline,
    }, new Date("2026-07-18T00:00:00.000Z"))).toBe(true);
  });

  it("subtracts the configured number of calendar days", () => {
    expect(calculateMvgDeadline("2026-07-20T00:00:00.000Z", 3).toISOString())
      .toBe("2026-07-17T23:59:59.999Z");
  });

  it("does not reprocess resolved MVG events", () => {
    expect(isMvgDeadlineDue({
      requireMinimumParticipants: true,
      mvgStatus: "met",
      mvgDeadline: "2026-07-16T23:59:59.999Z",
    }, new Date("2026-07-17T00:00:00.000Z"))).toBe(false);
  });
});
