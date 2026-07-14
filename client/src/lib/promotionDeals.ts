// Terms shape stored on a promotion_deals row (Digital Handshake direct offers + marketplace bids).
export type PromotionDealTerms = {
  commissionPct?: number;
  milestoneAttendeeTarget?: number;
  milestoneRewardTickets?: number;
  brandPitch?: string;
  sponsorshipAmount?: number;
  currency?: string;
};

export function formatPromotionDealTerms(dealType: string, terms: PromotionDealTerms): string {
  switch (dealType) {
    case "commission_per_ticket":
      return `${terms.commissionPct ?? 0}% commission per ticket`;
    case "milestone_barter":
      return `Bring ${terms.milestoneAttendeeTarget ?? 0} attendees → ${terms.milestoneRewardTickets ?? 0} free ticket(s)`;
    case "brand_barter":
      return terms.brandPitch || "Products/services for exposure";
    case "financial_sponsorship":
      return `${(terms.currency || "EUR").toUpperCase()} ${terms.sponsorshipAmount ?? 0} sponsorship`;
    default:
      return "Custom deal terms";
  }
}

type PromotionOfferInput = {
  participantReferralDealType?: string | null;
  participantReferralCommissionPct?: string | number | null;
  participantReferralMilestoneAttendeeTarget?: string | number | null;
  participantReferralMilestoneRewardDescription?: string | null;
  promotionDealType?: string | null;
  influencerCommissionPct?: string | number | null;
  promotionMilestoneAttendeeTarget?: string | number | null;
  promotionMilestoneRewardTickets?: string | number | null;
  promotionBrandPitch?: string | null;
  promotionSponsorshipAmount?: string | number | null;
  currency?: string | null;
};

type PromotionOfferSummary = {
  dealType: string | null;
  label: string;
  headline: string;
  body: string;
  detail?: string;
  promoterCompatible: boolean;
  // Configured partner deals negotiate; only a generic unconfigured link remains instant.
  actionType: "instant" | "negotiate";
};

function numberOrZero(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "EUR").toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getPromotionDealType(offer: PromotionOfferInput): string | null {
  return offer.promotionDealType
    ?? (numberOrZero(offer.influencerCommissionPct) > 0 ? "commission_per_ticket" : null);
}

export function isPromoterCompatiblePromotion(offer: PromotionOfferInput): boolean {
  const dealType = getPromotionDealType(offer);
  return dealType === "commission_per_ticket" || dealType === "milestone_barter";
}

export function getPromotionOfferSummary(
  offer: PromotionOfferInput,
  options?: { referredBookings?: number },
): PromotionOfferSummary {
  const dealType = getPromotionDealType(offer);
  const referredBookings = options?.referredBookings ?? 0;

  switch (dealType) {
    case "commission_per_ticket": {
      const pct = numberOrZero(offer.influencerCommissionPct);
      return {
        dealType,
        label: "Commission per Ticket",
        headline: `Earn ${pct.toFixed(1)}% on each ticket sold`,
        body: "Bookings from your tracked link generate trip credit for this experience.",
        promoterCompatible: true,
        actionType: "negotiate",
      };
    }
    case "milestone_barter": {
      const attendeeTarget = Math.max(1, Math.round(numberOrZero(offer.promotionMilestoneAttendeeTarget) || 1));
      const rewardTickets = Math.max(1, Math.round(numberOrZero(offer.promotionMilestoneRewardTickets) || 1));
      const remaining = Math.max(attendeeTarget - referredBookings, 0);
      return {
        dealType,
        label: "Milestone Barter",
        headline: `Bring ${attendeeTarget} attendee${attendeeTarget === 1 ? "" : "s"} to unlock ${rewardTickets} free ticket${rewardTickets === 1 ? "" : "s"}`,
        body: remaining > 0
          ? `${referredBookings}/${attendeeTarget} bookings tracked so far. ${remaining} more to unlock the reward.`
          : `Reward unlocked. ${referredBookings}/${attendeeTarget} tracked bookings reached the milestone.`,
        promoterCompatible: true,
        actionType: "negotiate",
      };
    }
    case "brand_barter":
      return {
        dealType,
        label: "Brand Barter",
        headline: "Products/services for exposure",
        body: offer.promotionBrandPitch?.trim()
          || "This creator is looking for products or services in exchange for exposure.",
        detail: "Accept these terms as-is, or counter with what you can offer.",
        promoterCompatible: true,
        actionType: "negotiate",
      };
    case "financial_sponsorship": {
      const amount = numberOrZero(offer.promotionSponsorshipAmount);
      return {
        dealType,
        label: "Financial Sponsorship",
        headline: `Sponsorship ask: ${formatCurrency(amount, offer.currency || "EUR")}`,
        body: "This offer is structured as a direct sponsorship payment for exposure.",
        detail: "Accept this amount as-is, or counter with your own offer.",
        promoterCompatible: true,
        actionType: "negotiate",
      };
    }
    default:
      return {
        dealType: null,
        label: "Tracked Referral Link",
        headline: "Share the experience and track clicks and bookings",
        body: "This trip uses a general referral link without a creator-set promoter deal.",
        promoterCompatible: true,
        actionType: "instant",
      };
  }
}

export function getParticipantReferralSummary(
  offer: PromotionOfferInput,
  options?: { referredBookings?: number },
): PromotionOfferSummary {
  const dealType = offer.participantReferralDealType ?? null;
  const referredBookings = options?.referredBookings ?? 0;

  switch (dealType) {
    case "commission_per_ticket": {
      const pct = numberOrZero(offer.participantReferralCommissionPct);
      return {
        dealType,
        label: "Cashback",
        headline: `Earn ${pct.toFixed(1)}% cashback when friends book`,
        body: "Friend bookings from your tracked link generate cashback for this experience.",
        promoterCompatible: true,
        actionType: "instant",
      };
    }
    case "milestone_barter": {
      const attendeeTarget = Math.max(1, Math.round(numberOrZero(
        offer.participantReferralMilestoneAttendeeTarget,
      ) || 1));
      const reward = offer.participantReferralMilestoneRewardDescription?.trim()
        || "Friend milestone reward";
      const remaining = Math.max(attendeeTarget - referredBookings, 0);
      return {
        dealType,
        label: "Friend Milestone",
        headline: `Bring ${attendeeTarget} friend booking${attendeeTarget === 1 ? "" : "s"} to unlock ${reward}`,
        body: remaining > 0
          ? `${referredBookings}/${attendeeTarget} friend bookings tracked so far. ${remaining} more to unlock the reward.`
          : `Reward unlocked. ${referredBookings}/${attendeeTarget} tracked friend bookings reached the milestone.`,
        promoterCompatible: true,
        actionType: "instant",
      };
    }
    default:
      return {
        dealType: null,
        label: "Tracked Referral Link",
        headline: "Share the experience and track friend bookings",
        body: "Your referral link tracks clicks, bookings, and impact for this experience.",
        promoterCompatible: true,
        actionType: "instant",
      };
  }
}
