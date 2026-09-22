/**
 * Where a Participant Referral Perk's reward actually comes from.
 *
 * The perk rewards an individual guest for bringing friends, and until now the
 * only question asked about it was a yes/no: is this the venue's to give? That
 * was too narrow in both directions.
 *
 * Too narrow on *who*: the reward that prompted this was a Service Provider's
 * 1-on-1 session, not anything a venue stocks. A sponsor's product, a
 * community's kit and a photographer's prints are all just as likely. Any
 * partner who has committed a supply of something can be the source, so the
 * selector lists them rather than hard-coding the venue.
 *
 * Too narrow on *how much*: a supply is finite. The recruiting host's Milestone
 * Barter reward already draws on the same committed stock, and nothing here
 * counts what is left. Pointing one supply at both mechanisms would let the
 * platform promise more than the partner agreed to, so the organiser points it
 * once — see `barterAllocation` in `eventPartners.ts`, and the standing
 * write-up of the underlying gap in `docs/PARTNER_MODEL_OPEN_QUESTIONS.md`.
 *
 * The venue stays a source in its own right. Its sign-off travels on the venue
 * contract rather than a partner invite, so it keeps the boolean it has always
 * had and the columns behind it are untouched.
 */

import {
  partnerBarterAllocation,
  partnerHasBarterSupply,
  partnerFundsParticipantPerk,
  partnerTypeLabel,
  type EventPartnerEntry,
  type PartnerTerms,
} from "./eventPartners";

export const PERK_SOURCE_SELF = "self";
export const PERK_SOURCE_VENUE = "venue";

export type PerkRewardSourceKind = "self" | "venue" | "partner";

export type PerkRewardSourceOption = {
  /** `self`, `venue`, or the partner entry's own id. */
  id: string;
  kind: PerkRewardSourceKind;
  label: string;
  hint: string;
  /** What that partner actually committed, where they wrote it down. */
  supply?: string;
  /** Whether participants must wait for them to agree before seeing the perk. */
  requiresApproval: boolean;
};

export type PerkRewardSourceInput = {
  partners?: Array<EventPartnerEntry | { id?: unknown; name?: unknown; partnerType?: unknown; dealType?: unknown; terms?: PartnerTerms | null; status?: unknown }> | null;
  /** The venue on the event, when one is chosen. */
  venueName?: string | null;
};

/** What a barter partner has put up, in their own words where they gave any. */
function supplyLine(partner: { terms?: PartnerTerms | null } | null | undefined): string | undefined {
  const described = String(partner?.terms?.productDescription || "").trim()
    || String(partner?.terms?.milestoneRewardDescription || "").trim()
    || String(partner?.terms?.licenseScope || "").trim();
  if (!described) return undefined;
  return described.length > 120 ? `${described.slice(0, 117)}…` : described;
}

/**
 * Every source the organiser may pick, in the order they should be offered.
 *
 * Funding it yourself comes first: it is the only option that needs nobody's
 * permission, so it is the one that works on an event with no partners at all.
 */
export function listPerkRewardSources(
  input: PerkRewardSourceInput | null | undefined,
): PerkRewardSourceOption[] {
  const options: PerkRewardSourceOption[] = [
    {
      id: PERK_SOURCE_SELF,
      kind: "self",
      label: "You fund it",
      hint: "Comes out of your own margin. Live immediately — nobody else has to agree.",
      requiresApproval: false,
    },
  ];

  const venueName = String(input?.venueName || "").trim();
  if (venueName) {
    options.push({
      id: PERK_SOURCE_VENUE,
      kind: "venue",
      label: venueName,
      hint: "Goes to the venue for sign-off with your deal. Hidden from participants until they accept.",
      requiresApproval: true,
    });
  }

  for (const partner of Array.isArray(input?.partners) ? input!.partners! : []) {
    if (!partnerFundsParticipantPerk(partner as any)) continue;
    const id = String((partner as any)?.id || "").trim();
    if (!id) continue;
    options.push({
      id,
      kind: "partner",
      label: String((partner as any)?.name || partnerTypeLabel((partner as any)?.partnerType)),
      hint: `Drawn from their Barter Deal. Live once ${
        String((partner as any)?.name || "they").trim() || "they"
      } accept.`,
      supply: supplyLine(partner as any),
      requiresApproval: (partner as any)?.status !== "confirmed",
    });
  }

  return options;
}

/**
 * A barter partner who could fund the perk but is currently funding the host
 * instead — so the Pricing step can say why they are not in the list, rather
 * than leaving an organiser hunting for a partner they know they added.
 */
export function partnersAllocatedToHost(
  input: PerkRewardSourceInput | null | undefined,
): Array<{ id: string; name: string }> {
  return (Array.isArray(input?.partners) ? input!.partners! : [])
    .filter((partner) => partnerHasBarterSupply(partner as any)
      && (partner as any)?.status !== "declined"
      && partnerBarterAllocation(partner as any) === "host")
    .map((partner) => ({
      id: String((partner as any)?.id || ""),
      name: String((partner as any)?.name || "This partner"),
    }))
    .filter((entry) => Boolean(entry.id));
}

/** One line explaining the either/or, for wherever the choice is made. */
export const BARTER_ALLOCATION_EXPLANATION =
  "A Barter Deal's supply funds one reward or the other, not both — there is no stock count "
  + "behind it, so splitting it would let the event promise more than the partner committed.";

export type StoredPerkSource = {
  participantReferralVenueBacked?: boolean | null;
  participantReferralRewardSourcePartnerId?: string | null;
};

/**
 * Which option is selected, read off the two stored fields.
 *
 * The partner id wins when both are set. That combination should not occur —
 * choosing a partner clears the venue flag — but a draft written by an older
 * build can carry the flag alone, and reading it as the venue is correct.
 */
export function resolvePerkRewardSourceId(
  input: StoredPerkSource | null | undefined,
): string {
  const partnerId = String(input?.participantReferralRewardSourcePartnerId || "").trim();
  if (partnerId) return partnerId;
  return input?.participantReferralVenueBacked === true ? PERK_SOURCE_VENUE : PERK_SOURCE_SELF;
}

/** The two stored fields, written from a chosen option. Mutually exclusive by construction. */
export function perkRewardSourceFields(sourceId: unknown): {
  participantReferralVenueBacked: boolean;
  participantReferralRewardSourcePartnerId: string | null;
} {
  const id = String(sourceId || "").trim();
  if (!id || id === PERK_SOURCE_SELF) {
    return {
      participantReferralVenueBacked: false,
      participantReferralRewardSourcePartnerId: null,
    };
  }
  if (id === PERK_SOURCE_VENUE) {
    return {
      participantReferralVenueBacked: true,
      participantReferralRewardSourcePartnerId: null,
    };
  }
  return {
    participantReferralVenueBacked: false,
    participantReferralRewardSourcePartnerId: id,
  };
}

/**
 * The partner named as the perk's source, if they are still on the event and
 * still pointed at participants.
 *
 * Returns null when the organiser has since removed them, or re-pointed their
 * supply at the recruiting host. Neither is an error — it means the perk has no
 * backer any more, which is exactly what the approval state should then say.
 */
export function resolvePerkSourcePartner(
  input: (StoredPerkSource & PerkRewardSourceInput) | null | undefined,
): EventPartnerEntry | null {
  const partnerId = String(input?.participantReferralRewardSourcePartnerId || "").trim();
  if (!partnerId) return null;

  const match = (Array.isArray(input?.partners) ? input!.partners! : [])
    .find((partner) => String((partner as any)?.id || "") === partnerId);
  if (!match) return null;

  return partnerFundsParticipantPerk(match as any) ? (match as EventPartnerEntry) : null;
}
