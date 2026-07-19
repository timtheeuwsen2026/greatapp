import { describe, expect, it } from "vitest";
import { isQualifyingReferralBooking, resolveMilestoneReward } from "../fulfillmentRules";

describe("perk fulfillment rules", () => {
  it("resolves participant friend milestones", () => {
    expect(resolveMilestoneReward({
      referralAudience: "participant",
      experience: {
        participantReferralDealType: "milestone_barter",
        participantReferralMilestoneAttendeeTarget: 3,
        participantReferralMilestoneRewardDescription: "a free drink",
      },
    })).toEqual({ target: 3, rewardDescription: "a free drink" });
  });

  it("uses only accepted official partner milestone terms", () => {
    expect(resolveMilestoneReward({
      referralAudience: "official_partner",
      experience: {},
      deal: {
        dealType: "milestone_barter",
        status: "accepted",
        terms: { milestoneAttendeeTarget: 5, milestoneRewardTickets: 2 },
      },
    })).toEqual({ target: 5, rewardDescription: "2 free tickets" });
  });

  it("counts active reservations and excludes reversed bookings", () => {
    expect(isQualifyingReferralBooking("confirmed")).toBe(true);
    expect(isQualifyingReferralBooking("deposit_authorized")).toBe(true);
    expect(isQualifyingReferralBooking("fully_paid")).toBe(true);
    expect(isQualifyingReferralBooking("pending")).toBe(true);
    expect(isQualifyingReferralBooking("refunded")).toBe(false);
    expect(isQualifyingReferralBooking("cancelled")).toBe(false);
  });
});
