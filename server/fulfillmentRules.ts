type MilestoneExperience = {
  participantReferralDealType?: string | null;
  participantReferralMilestoneAttendeeTarget?: number | null;
  participantReferralMilestoneRewardDescription?: string | null;
};

type MilestoneDeal = {
  dealType?: string | null;
  status?: string | null;
  terms?: {
    milestoneAttendeeTarget?: number;
    milestoneRewardTickets?: number;
  } | null;
};

export function resolveMilestoneReward(input: {
  referralAudience: string;
  experience: MilestoneExperience;
  deal?: MilestoneDeal | null;
}) {
  if (input.referralAudience === "participant") {
    if (input.experience.participantReferralDealType !== "milestone_barter") return null;
    const target = Number(input.experience.participantReferralMilestoneAttendeeTarget || 0);
    if (!Number.isFinite(target) || target <= 0) return null;
    return {
      target: Math.ceil(target),
      rewardDescription: input.experience.participantReferralMilestoneRewardDescription?.trim()
        || "Friend milestone reward",
    };
  }

  if (input.referralAudience === "official_partner") {
    if (input.deal?.status !== "accepted" || input.deal.dealType !== "milestone_barter") return null;
    const target = Number(input.deal.terms?.milestoneAttendeeTarget || 0);
    const rewardTickets = Number(input.deal.terms?.milestoneRewardTickets || 0);
    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(rewardTickets) || rewardTickets <= 0) {
      return null;
    }
    return {
      target: Math.ceil(target),
      rewardDescription: `${Math.ceil(rewardTickets)} free ticket${Math.ceil(rewardTickets) === 1 ? "" : "s"}`,
    };
  }

  return null;
}

export function isQualifyingReferralBooking(status?: string | null) {
  return ["deposit_authorized", "deposit_paid", "confirmed", "fully_paid"].includes(status || "pending");
}
