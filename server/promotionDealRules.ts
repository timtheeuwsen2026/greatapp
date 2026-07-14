export type PromotionCounterTerms = {
  commissionPct?: number;
  milestoneAttendeeTarget?: number;
  milestoneRewardTickets?: number;
  brandPitch?: string;
  sponsorshipAmount?: number;
  currency?: string;
};

function positiveNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero`);
  return parsed;
}

export function normalizePromotionCounterTerms(
  dealType: string,
  input: Record<string, unknown> | null | undefined,
  experienceCurrency = "EUR",
): PromotionCounterTerms {
  const terms = input || {};
  switch (dealType) {
    case "commission_per_ticket": {
      const commissionPct = positiveNumber(terms.commissionPct, "Commission percentage");
      if (commissionPct > 100) throw new Error("Commission percentage cannot exceed 100");
      return { commissionPct };
    }
    case "milestone_barter":
      return {
        milestoneAttendeeTarget: Math.ceil(positiveNumber(terms.milestoneAttendeeTarget, "Attendee target")),
        milestoneRewardTickets: Math.ceil(positiveNumber(terms.milestoneRewardTickets, "Reward tickets")),
      };
    case "brand_barter": {
      const brandPitch = String(terms.brandPitch || "").trim();
      if (!brandPitch) throw new Error("Describe the products or services in your counter offer");
      return { brandPitch };
    }
    case "financial_sponsorship":
      return {
        sponsorshipAmount: positiveNumber(terms.sponsorshipAmount, "Sponsorship amount"),
        currency: String(experienceCurrency || "EUR").toUpperCase(),
      };
    default:
      throw new Error("Unsupported promotion deal type");
  }
}
