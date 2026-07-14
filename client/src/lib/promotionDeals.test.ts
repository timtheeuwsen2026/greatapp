import { describe, expect, it } from "vitest";
import {
  getParticipantReferralSummary,
  getPromotionOfferSummary,
} from "./promotionDeals";

describe("promotion deal audience rules", () => {
  it("uses B2C cashback terminology for participant commission", () => {
    const summary = getParticipantReferralSummary({
      participantReferralDealType: "commission_per_ticket",
      participantReferralCommissionPct: 10,
      promotionDealType: "financial_sponsorship",
      promotionSponsorshipAmount: 500,
    });

    expect(summary.label).toBe("Cashback");
    expect(summary.headline).toContain("10.0% cashback");
    expect(summary.headline).not.toContain("Sponsorship");
  });

  it("uses Friend Milestone terminology for participant barter", () => {
    const summary = getParticipantReferralSummary(
      {
        participantReferralDealType: "milestone_barter",
        participantReferralMilestoneAttendeeTarget: 3,
        participantReferralMilestoneRewardDescription: "a free drink",
      },
      { referredBookings: 1 },
    );

    expect(summary.label).toBe("Friend Milestone");
    expect(summary.headline).toContain("Bring 3 friend bookings");
    expect(summary.body).toContain("2 more");
  });

  it("keeps financial sponsorship language in the official partner offer", () => {
    const summary = getPromotionOfferSummary({
      promotionDealType: "financial_sponsorship",
      promotionSponsorshipAmount: 500,
      currency: "EUR",
    });

    expect(summary.label).toBe("Financial Sponsorship");
    expect(summary.headline).toContain("€500");
    expect(summary.actionType).toBe("negotiate");
  });

  it("allows commission deals to enter the counter-offer flow", () => {
    const summary = getPromotionOfferSummary({
      promotionDealType: "commission_per_ticket",
      influencerCommissionPct: 15,
    });

    expect(summary.headline).toContain("15.0%");
    expect(summary.actionType).toBe("negotiate");
  });

  it("does not inherit an official commission when no participant perk exists", () => {
    const summary = getParticipantReferralSummary({
      participantReferralDealType: null,
      promotionDealType: "commission_per_ticket",
      influencerCommissionPct: 25,
    });

    expect(summary.dealType).toBeNull();
    expect(summary.label).toBe("Tracked Referral Link");
    expect(summary.headline).not.toContain("25");
  });
});
