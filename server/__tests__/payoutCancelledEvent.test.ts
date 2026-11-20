import { describe, expect, it } from "vitest";
import { isExperiencePayoutEligible } from "../payoutRules";

// Tim, 66.18b: a cancelled event is never paid out, whatever its minimum group.
describe("payout eligibility of a cancelled event", () => {
  it("never pays out a cancelled event, also one without a minimum group", () => {
    expect(isExperiencePayoutEligible({ status: "cancelled", requireMinimumParticipants: false })).toBe(false);
    expect(isExperiencePayoutEligible({ status: "approved", cancelledAt: new Date(), requireMinimumParticipants: false })).toBe(false);
    expect(isExperiencePayoutEligible({ status: "cancelled", requireMinimumParticipants: true, mvgStatus: "met" })).toBe(false);
  });

  it("still pays out an event that went ahead", () => {
    expect(isExperiencePayoutEligible({ status: "approved", requireMinimumParticipants: false })).toBe(true);
    expect(isExperiencePayoutEligible({ status: "approved", requireMinimumParticipants: true, mvgStatus: "met" })).toBe(true);
    expect(isExperiencePayoutEligible({ status: "approved", requireMinimumParticipants: true, mvgStatus: "pending" })).toBe(false);
  });
});
