import { describe, expect, it } from "vitest";
import { normalizePromotionCounterTerms } from "../promotionDealRules";

describe("promotion counter terms", () => {
  it("accepts commission percentage counters", () => {
    expect(normalizePromotionCounterTerms("commission_per_ticket", { commissionPct: 20 }))
      .toEqual({ commissionPct: 20 });
  });

  it("accepts milestone counters", () => {
    expect(normalizePromotionCounterTerms("milestone_barter", {
      milestoneAttendeeTarget: 6,
      milestoneRewardTickets: 2,
    })).toEqual({ milestoneAttendeeTarget: 6, milestoneRewardTickets: 2 });
  });

  it("keeps sponsorship currency tied to the experience", () => {
    expect(normalizePromotionCounterTerms(
      "financial_sponsorship",
      { sponsorshipAmount: 450, currency: "USD" },
      "gbp",
    )).toEqual({ sponsorshipAmount: 450, currency: "GBP" });
  });

  it("rejects invalid commission counters", () => {
    expect(() => normalizePromotionCounterTerms("commission_per_ticket", { commissionPct: 0 }))
      .toThrow("greater than zero");
  });
});
