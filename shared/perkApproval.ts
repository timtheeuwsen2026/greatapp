/**
 * Whether a referral perk may actually be promised to participants yet.
 *
 * An organiser can set a perk that costs the venue something — "bring 3 friends,
 * get a coffee at Bandido" — without Bandido having agreed to it. That commits
 * someone else's product on their behalf, and the first anyone knows of it is a
 * participant arriving at the counter expecting a free coffee.
 *
 * So a perk the organiser marks as venue-backed travels with the venue proposal
 * and is held back until the venue accepts. A perk the organiser funds
 * themselves — cashback out of their own margin — needs nobody's permission and
 * is live immediately.
 *
 * The same reasoning applies past the venue. A reward can equally be a
 * sponsor's product or a service provider's sessions, drawn from that partner's
 * Barter Deal, and committing those without asking is the identical mistake —
 * so a partner-sourced perk waits on that partner's acceptance. Which partners
 * may be named, and why one supply cannot fund two rewards at once, is in
 * `perkRewardSource.ts`.
 */

import {
  partnerFundsParticipantPerk,
  type EventPartnerEntry,
  type PartnerTerms,
} from "./eventPartners";

export type PerkApprovalInput = {
  participantReferralDealType?: string | null;
  participantReferralCommissionPct?: string | number | null;
  participantReferralMilestoneAttendeeTarget?: string | number | null;
  participantReferralMilestoneRewardDescription?: string | null;
  /** The organiser says this reward is the venue's to give. */
  participantReferralVenueBacked?: boolean | null;
  /** Stamped when the venue accepts a contract carrying the perk. */
  participantReferralVenueApprovedAt?: string | Date | null;
  /** The partner whose Barter Deal supplies this reward, when it is not the venue's. */
  participantReferralRewardSourcePartnerId?: string | null;
  /**
   * The event's partner list, needed only to read the named partner's status.
   * Optional so every existing caller — the venue paths, which have no partner
   * list to hand — keeps working untouched.
   */
  partners?: Array<EventPartnerEntry | { id?: unknown; dealType?: unknown; terms?: PartnerTerms | null; status?: unknown }> | null;
};

export type PerkApprovalState =
  /** No perk set, or one too incomplete to promise. */
  | "none"
  /** The organiser funds it. Nothing to wait for. */
  | "self_funded"
  /** The venue's to give, and they have not answered yet. */
  | "awaiting_venue"
  /** The venue agreed to it. */
  | "venue_approved"
  /** A partner's Barter Deal supplies it, and they have not accepted yet. */
  | "awaiting_partner"
  /** The partner accepted, so their supply is committed. */
  | "partner_approved"
  /**
   * A partner was named and is no longer backing it — removed from the event,
   * or their supply re-pointed at the recruiting host. Nothing is funding the
   * perk, so it must not be shown, and the organiser has to choose again.
   */
  | "source_missing";

function isNumericallySet(value: unknown): boolean {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0;
}

/** A perk with its numbers filled in — regardless of who is paying for it. */
export function isPerkConfigured(input: PerkApprovalInput | null | undefined): boolean {
  if (!input) return false;

  if (input.participantReferralDealType === "commission_per_ticket") {
    return isNumericallySet(input.participantReferralCommissionPct);
  }
  if (input.participantReferralDealType === "milestone_barter") {
    return isNumericallySet(input.participantReferralMilestoneAttendeeTarget)
      && Boolean(String(input.participantReferralMilestoneRewardDescription || "").trim());
  }
  return false;
}

export function getPerkApprovalState(input: PerkApprovalInput | null | undefined): PerkApprovalState {
  if (!isPerkConfigured(input)) return "none";

  // A named partner is asked first. Their acceptance is the partner entry's own
  // status, so there is no second approval column to keep in step with it.
  const partnerId = String(input?.participantReferralRewardSourcePartnerId || "").trim();
  if (partnerId) {
    // No list to check against is not the same as a partner who has gone. A
    // caller that never had the partners to hand gets the cautious answer —
    // the perk stays hidden — without being told to go and pick a new source.
    if (!Array.isArray(input?.partners)) return "awaiting_partner";

    const source = input!.partners!.find(
      (partner) => String((partner as any)?.id || "") === partnerId,
    );
    if (!source || !partnerFundsParticipantPerk(source as any)) return "source_missing";
    return (source as any).status === "confirmed" ? "partner_approved" : "awaiting_partner";
  }

  if (input?.participantReferralVenueBacked !== true) return "self_funded";
  return input?.participantReferralVenueApprovedAt ? "venue_approved" : "awaiting_venue";
}

/**
 * Can this perk be shown to participants?
 *
 * The gate is deliberately on display rather than on saving: an organiser
 * should be able to write the perk down and send it for sign-off in the same
 * pass, rather than having to remember to come back and add it afterwards.
 */
export function canPromisePerk(input: PerkApprovalInput | null | undefined): boolean {
  const state = getPerkApprovalState(input);
  return state === "self_funded"
    || state === "venue_approved"
    || state === "partner_approved";
}

/** What the organiser is told while a perk is held back. */
export function getPerkApprovalMessage(state: PerkApprovalState): string | null {
  switch (state) {
    case "awaiting_venue":
      return "Sent to your venue for sign-off. Participants won't see this perk until they agree — "
        + "it is their product to give, not yours to promise.";
    case "venue_approved":
      return "Your venue agreed to this perk. It is live on the event page.";
    case "awaiting_partner":
      return "Sent to the partner whose Barter Deal supplies it. Participants won't see this perk "
        + "until they accept — it is their product to give, not yours to promise.";
    case "partner_approved":
      return "The partner supplying this reward has accepted. It is live on the event page.";
    case "source_missing":
      return "The partner who was supplying this reward is no longer backing it — removed from the "
        + "event, or their Barter Deal now goes to the host who brings the people. Pick another "
        + "source, or fund it yourself.";
    default:
      return null;
  }
}

/**
 * The perk as it should appear inside a venue proposal's terms, or null when
 * there is nothing for the venue to agree to.
 */
export type ProposedPerkTerms = {
  dealType: string;
  rewardDescription: string;
  attendeeTarget: number | null;
  commissionPct: number | null;
};

export function buildProposedPerkTerms(
  input: PerkApprovalInput | null | undefined,
): ProposedPerkTerms | null {
  if (input?.participantReferralVenueBacked !== true || !isPerkConfigured(input)) return null;

  return {
    dealType: String(input.participantReferralDealType),
    rewardDescription: String(input.participantReferralMilestoneRewardDescription || "").trim(),
    attendeeTarget: isNumericallySet(input.participantReferralMilestoneAttendeeTarget)
      ? Number(input.participantReferralMilestoneAttendeeTarget)
      : null,
    commissionPct: isNumericallySet(input.participantReferralCommissionPct)
      ? Number(input.participantReferralCommissionPct)
      : null,
  };
}

/** One line describing the perk to the venue being asked to fund it. */
export function formatPerkForVenue(perk: ProposedPerkTerms | null | undefined): string | null {
  if (!perk) return null;

  if (perk.dealType === "milestone_barter" && perk.attendeeTarget) {
    return `Participant perk: a guest who brings ${perk.attendeeTarget} `
      + `${perk.attendeeTarget === 1 ? "friend" : "friends"} receives ${perk.rewardDescription}, `
      + "provided by your venue.";
  }
  if (perk.dealType === "commission_per_ticket" && perk.commissionPct) {
    return `Participant perk: ${perk.commissionPct}% cashback on referred bookings`
      + (perk.rewardDescription ? `, funded as ${perk.rewardDescription}.` : ", funded by your venue.");
  }
  return perk.rewardDescription
    ? `Participant perk: ${perk.rewardDescription}, provided by your venue.`
    : null;
}
