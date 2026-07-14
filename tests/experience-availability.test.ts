import { describe, expect, it } from "vitest";
import { isMvgStillForming } from "../client/src/lib/experienceAvailability";

describe("experience MVG availability display", () => {
  it("hides capacity urgency while the MVG is still forming", () => {
    expect(isMvgStillForming({
      requireMinimumParticipants: true,
      lifecycleStatus: "forming",
      mvgStatus: "pending",
      currentParticipants: 1,
      minimumParticipants: 10,
    })).toBe(true);
  });

  it("shows capacity after the MVG is met", () => {
    expect(isMvgStillForming({
      requireMinimumParticipants: true,
      lifecycleStatus: "confirmed",
      mvgStatus: "met",
      currentParticipants: 10,
      minimumParticipants: 10,
    })).toBe(false);
  });

  it("does not treat a non-MVG event as forming", () => {
    expect(isMvgStillForming({ requireMinimumParticipants: false })).toBe(false);
  });
});
