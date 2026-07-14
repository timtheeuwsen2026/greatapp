import { describe, expect, it } from "vitest";
import { isExperiencePayoutEligible } from "../payoutRules";

describe("MVG payout eligibility", () => {
  it.each(["pending", "failed", null])(
    "blocks transfers while an MVG event is %s",
    (mvgStatus) => {
      expect(isExperiencePayoutEligible({
        requireMinimumParticipants: true,
        mvgStatus,
      })).toBe(false);
    },
  );

  it("allows transfers only after an MVG event is met", () => {
    expect(isExperiencePayoutEligible({
      mvgEnabled: true,
      mvgStatus: "met",
    })).toBe(true);
  });

  it("does not impose MVG gating on a standard event", () => {
    expect(isExperiencePayoutEligible({
      requireMinimumParticipants: false,
      mvgEnabled: false,
      mvgStatus: "pending",
    })).toBe(true);
  });
});
