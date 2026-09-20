/**
 * The Partners model: one event, several two-party deals.
 *
 * The Official Partner Deal used to be a single entry — one deal type, one set
 * of terms, one list of invitees. In practice one event routinely carries
 * several separate barters at once: a run club gets free access for bringing
 * fifteen people, a drinks brand supplies product for exposure, a photographer
 * shoots the day in exchange for a print licence, and an affiliate pushes
 * tickets on commission. None of those could be recorded alongside each other.
 *
 * So a partner entry is a row, not a field, and the four partner types are one
 * coherent set. Affiliate is *not* a special case bolted on beside the others:
 * it is a partner type whose deal happens to be Commission per Ticket, and it
 * is added through the same modal, rendered in the same list, and settled in
 * the same waterfall as everything else.
 *
 * Two rules the rest of the system reads off this file:
 *
 *  1. **Only a Revenue Split / Commission per Ticket deal touches ticket
 *     revenue.** Barter, sponsorship and content-licence partners are settled
 *     outside the waterfall, so they never appear in the Commercial Model's
 *     percentage list and never reduce the organiser's ticket net.
 *
 *  2. **Nothing renders for a partner nobody added.** An event with no partners
 *     shows no partner cards at all — not four greyed-out placeholders implying
 *     something is missing. Simple events must stay simple.
 *
 * Venue is deliberately absent from `PARTNER_TYPES`. Its *deal* is now agreed
 * on the Partners step beside everyone else's, but it is not added through
 * this list: it has its own step, its own operational fields (capacity,
 * address, space type) and its own contract table, and duplicating it here
 * would give an organiser two places to set one thing. Its deal vocabulary
 * lives in `venueDealModels.ts`.
 *
 * Two things are deliberately NOT modelled here. Both are written up in
 * `docs/PARTNER_MODEL_OPEN_QUESTIONS.md`, and neither is an oversight:
 *
 *  - **Three-party chains.** A community's reach often lands the sponsor, and
 *    the money then flows sponsor → organiser → community with the organiser
 *    deciding by judgement how much to pass on. Every deal here has exactly
 *    one counterparty, and a row in the waterfall would promise a payment the
 *    platform does not make.
 *
 *  - **Whether Community and Affiliate are one type.** Both are "someone who
 *    brings people"; the intended difference is the deal's shape rather than
 *    what they do, and a real partner can fit either. Unresolved, so build
 *    against these four.
 */

export type PartnerTypeId =
  | "community"
  | "sponsor_brand"
  | "service_provider"
  | "affiliate";

export type PartnerDealTypeId =
  | "commission_per_ticket"
  | "milestone_barter"
  | "brand_barter"
  | "financial_sponsorship"
  | "content_license";

/** Where a partner entry has got to. Mirrors the venue invite's vocabulary. */
export type PartnerStatus = "draft" | "invited" | "confirmed" | "declined";

export type PartnerTypeOption = {
  id: PartnerTypeId;
  label: string;
  /** One line, shown under the chip in the Add Partner modal. */
  hint: string;
  /** Emoji used on the compact list row, where an icon component is overkill. */
  glyph: string;
  /** Which deals make sense for this type. Others stay selectable but unranked. */
  suggestedDeals: PartnerDealTypeId[];
};

export const PARTNER_TYPES: PartnerTypeOption[] = [
  {
    id: "community",
    label: "Community",
    hint: "A group that brings its own members",
    glyph: "👥",
    suggestedDeals: ["milestone_barter", "commission_per_ticket"],
  },
  {
    id: "sponsor_brand",
    label: "Sponsor / Brand",
    hint: "Supplies product, budget or kit for exposure",
    glyph: "⚡",
    suggestedDeals: ["brand_barter", "financial_sponsorship"],
  },
  {
    id: "service_provider",
    label: "Service Provider",
    hint: "A photographer, teacher, caterer or similar",
    glyph: "🛠️",
    suggestedDeals: ["content_license", "brand_barter", "financial_sponsorship"],
  },
  {
    id: "affiliate",
    label: "Affiliate",
    hint: "Drives ticket sales through their own reach, paid on commission",
    glyph: "📣",
    suggestedDeals: ["commission_per_ticket"],
  },
];

export type PartnerDealOption = {
  id: PartnerDealTypeId;
  label: string;
  description: string;
  /**
   * True when the deal is paid out of ticket revenue, and therefore appears in
   * the Commercial Model's percentage list and the Grand Total waterfall.
   */
  revenueShareEligible: boolean;
  /** Which extra field this deal needs before it can be saved. */
  requires: "percentage" | "attendee_target" | "product" | "amount" | "content_terms";
};

export const PARTNER_DEAL_TYPES: PartnerDealOption[] = [
  {
    id: "commission_per_ticket",
    label: "Commission per Ticket",
    description: "A percentage of ticket revenue for each ticket they bring.",
    revenueShareEligible: true,
    requires: "percentage",
  },
  {
    id: "milestone_barter",
    label: "Milestone Barter (Free Access)",
    description: "Free access once they bring a target number of attendees.",
    revenueShareEligible: false,
    requires: "attendee_target",
  },
  {
    id: "brand_barter",
    label: "Brand Barter (Products for Exposure)",
    description: "They supply product or kit; you give exposure in return.",
    revenueShareEligible: false,
    requires: "product",
  },
  {
    id: "financial_sponsorship",
    label: "Financial Sponsorship",
    description: "A fixed amount they pay towards the event.",
    revenueShareEligible: false,
    requires: "amount",
  },
  {
    id: "content_license",
    label: "Content License",
    description: "Photo or video, licensed on agreed terms rather than bought outright.",
    revenueShareEligible: false,
    requires: "content_terms",
  },
];

/** Content License splits three ways once chosen — how the creator is paid. */
export const CONTENT_LICENSE_SUBTYPES = [
  { id: "barter", label: "Barter", hint: "Product or access in exchange for usage rights" },
  { id: "flat_fee", label: "Flat fee", hint: "A fixed payment for usage rights" },
  { id: "free_attribution", label: "Free with attribution", hint: "Credit only, no payment" },
] as const;

export type ContentLicenseSubtype = (typeof CONTENT_LICENSE_SUBTYPES)[number]["id"];

/**
 * Which deals a given partner type may actually be offered.
 *
 * Financial Sponsorship was selectable on every type, including Community —
 * so a run club bringing thirty runners was offered a deal that reads as the
 * run club paying to attend. Nobody would pick it deliberately, but it sat
 * there in the list implying it was a normal thing to ask of a community.
 * Money paid *to* the organiser is a brand's move, so it is a brand's option.
 *
 * Everything not named here stays available to everyone: the point is to
 * remove one nonsensical combination, not to prescribe what a partner may
 * agree to.
 */
const DEAL_TYPE_RESTRICTIONS: Partial<Record<PartnerDealTypeId, PartnerTypeId[]>> = {
  financial_sponsorship: ["sponsor_brand"],
};

export function dealAvailableForPartnerType(
  dealType: unknown,
  partnerType: unknown,
): boolean {
  const allowed = DEAL_TYPE_RESTRICTIONS[dealType as PartnerDealTypeId];
  if (!allowed) return true;
  return allowed.includes(partnerType as PartnerTypeId);
}

/** The deals this partner type can be offered, in list order. */
export function dealTypesForPartnerType(partnerType: unknown): PartnerDealOption[] {
  return PARTNER_DEAL_TYPES.filter((deal) =>
    dealAvailableForPartnerType(deal.id, partnerType));
}

/** Why a deal is not offered, for the one case where it is worth saying. */
export function dealRestrictionReason(dealType: unknown): string | null {
  if (dealType === "financial_sponsorship") {
    return "Financial Sponsorship is a Sponsor / Brand deal — money paid towards the event, not something to ask of a community or a service provider.";
  }
  return null;
}

/**
 * How a deal settles, which is the only grouping that makes the Commercial
 * Model readable.
 *
 *  - `per_unit` — scales with what the event sells. A percentage or a per-head
 *    amount: nobody knows the figure until the tickets are sold.
 *  - `flat` — one number, agreed now, whichever way it travels.
 *  - `barter` — no money moves at all.
 *
 * Mixing the three in one list is what made the summary unreadable: a "15%"
 * and a "€100" and a "product for exposure" sitting side by side look like
 * three numbers of the same kind, and they are not comparable at all.
 */
export type DealTier = "per_unit" | "flat" | "barter";

export const DEAL_TIERS: Array<{ id: DealTier; label: string; glyph: string }> = [
  { id: "per_unit", label: "Per-unit", glyph: "↕" },
  { id: "flat", label: "Flat", glyph: "€" },
  { id: "barter", label: "Barter", glyph: "◇" },
];

export function dealTierLabel(tier: DealTier): string {
  return DEAL_TIERS.find((entry) => entry.id === tier)?.label || "";
}

export function dealTierGlyph(tier: DealTier): string {
  return DEAL_TIERS.find((entry) => entry.id === tier)?.glyph || "";
}

/** Which tier a partner's deal settles in. */
export function partnerDealTier(
  partner: { dealType?: unknown; terms?: PartnerTerms | null },
): DealTier {
  switch (partner?.dealType) {
    case "commission_per_ticket":
      return "per_unit";
    case "financial_sponsorship":
      return "flat";
    case "content_license":
      return partner?.terms?.licenseSubtype === "flat_fee" ? "flat" : "barter";
    case "milestone_barter":
    case "brand_barter":
    default:
      return "barter";
  }
}

/**
 * What this partner actually brings to the event, in three or four words.
 *
 * The deal terms say what they are paid; this says what they are paid *for*,
 * and without it a list of percentages beside a list of names does not tell an
 * organiser why any of them are on the event. Where the organiser has already
 * described it — a brand barter's product line — that is used verbatim rather
 * than replaced with a generic phrase.
 */
export function partnerBringsLine(
  partner: { partnerType?: unknown; dealType?: unknown; terms?: PartnerTerms | null },
): string {
  const described = String(partner?.terms?.productDescription || "").trim();
  if (partner?.dealType === "brand_barter" && described) {
    return described.length > 80 ? `${described.slice(0, 77)}…` : described;
  }

  switch (partner?.partnerType) {
    case "community":
      return "its members";
    case "sponsor_brand":
      return partner?.dealType === "financial_sponsorship"
        ? "budget for the event"
        : partner?.dealType === "content_license"
          ? "content, for exposure"
          : "products, for exposure";
    case "service_provider":
      return partner?.dealType === "content_license"
        ? "content, licensed to you"
        : "a service for the event";
    case "affiliate":
      return "ticket sales";
    default:
      return "";
  }
}

/** How a partner was found. Drives whether an invite email or a link is sent. */
export type PartnerSourceId = "platform" | "invite_link";

/**
 * The terms a partner entry carries. Only the fields its deal type needs are
 * ever populated — the same shape `promotion_deals.terms` already uses, plus
 * the two fields the content licence and the affiliate pool need.
 */
export type PartnerTerms = {
  /** commission_per_ticket — percentage of ticket revenue. */
  commissionPct?: number;
  /**
   * milestone_barter — a *ratio*, not a threshold.
   *
   * `milestoneRewardTickets` is the reward quantity and
   * `milestoneAttendeeTarget` the number of people it takes to earn it, so the
   * pair reads "1 per 1" or "2 per 10". The old fixed-threshold reading is the
   * first rung of the same ratio, which is why the two column names are kept:
   * the fulfilment engine and `promotion_deals` both already store them, and
   * renaming would have meant a migration for no change in meaning.
   */
  milestoneAttendeeTarget?: number;
  milestoneRewardTickets?: number;
  /**
   * What they actually earn. Free text because the reward is very often not a
   * ticket — "20 T-shirts from Strong X for 20 people" is a real deal that a
   * ticket-only reward could not express at all.
   */
  milestoneRewardDescription?: string;
  /** brand_barter — what the brand supplies and what they get back. */
  productDescription?: string;
  /** financial_sponsorship / content_license flat fee. */
  amount?: number;
  currency?: string;
  /** content_license only. */
  licenseSubtype?: ContentLicenseSubtype;
  licenseScope?: string;
  licenseExpiresDays?: number | null;
  /** affiliate only — surfaced on the Collab board for any qualifying affiliate. */
  showInExperiencePool?: boolean;
  /** affiliate only — the onboarded account this deal is assigned to. */
  assignedAffiliateId?: string | null;
  notes?: string;
};

/** One row in the Partners step. Stored as JSON on the draft, as a row once published. */
export type EventPartnerEntry = {
  id: string;
  partnerType: PartnerTypeId;
  /** Display name, whether or not the partner has an account here. */
  name: string;
  /** Set when the partner is an existing account. */
  partnerUserId?: string | null;
  /** Set when they were invited by email rather than picked from the platform. */
  email?: string | null;
  source: PartnerSourceId;
  dealType: PartnerDealTypeId;
  terms: PartnerTerms;
  status: PartnerStatus;
  /** The token behind great.app/invite/<token>, for a partner not yet on Great. */
  inviteToken?: string | null;
  /** The ?ref= code that attributes arrivals to this partner. */
  refCode?: string | null;
};

const PARTNER_TYPE_IDS = new Set<string>(PARTNER_TYPES.map((type) => type.id));
const PARTNER_DEAL_IDS = new Set<string>(PARTNER_DEAL_TYPES.map((deal) => deal.id));
const PARTNER_STATUSES = new Set<string>(["draft", "invited", "confirmed", "declined"]);

export function isPartnerType(value: unknown): value is PartnerTypeId {
  return PARTNER_TYPE_IDS.has(String(value ?? ""));
}

export function isPartnerDealType(value: unknown): value is PartnerDealTypeId {
  return PARTNER_DEAL_IDS.has(String(value ?? ""));
}

export function partnerTypeLabel(value: unknown): string {
  return PARTNER_TYPES.find((type) => type.id === value)?.label || "Partner";
}

export function partnerTypeGlyph(value: unknown): string {
  return PARTNER_TYPES.find((type) => type.id === value)?.glyph || "🤝";
}

export function partnerDealLabel(value: unknown): string {
  return PARTNER_DEAL_TYPES.find((deal) => deal.id === value)?.label || "Deal";
}

/**
 * Does this deal take its money out of ticket revenue?
 *
 * The single question the Pricing step asks of every partner. A `true` here is
 * what puts a partner in the Commercial Model's percentage list and a row in
 * the Grand Total waterfall; a `false` means they are settled outside tickets
 * entirely and must never reduce the ticket net.
 */
export function revenueShareEligible(dealType: unknown): boolean {
  return PARTNER_DEAL_TYPES.find((deal) => deal.id === dealType)?.revenueShareEligible === true;
}

/** Every partner whose deal pulls from tickets, in list order. */
export function revenueSharePartners<T extends { dealType?: unknown }>(partners: T[]): T[] {
  return (Array.isArray(partners) ? partners : []).filter((partner) =>
    revenueShareEligible(partner?.dealType));
}

/** The percentage a partner takes, or 0 for anyone settled outside tickets. */
export function partnerSharePct(partner: { dealType?: unknown; terms?: PartnerTerms | null }): number {
  if (!revenueShareEligible(partner?.dealType)) return 0;
  const pct = Number(partner?.terms?.commissionPct);
  return Number.isFinite(pct) && pct > 0 ? pct : 0;
}

/** Total percentage claimed by partners out of ticket revenue. */
export function totalPartnerSharePct(partners: Array<{ dealType?: unknown; terms?: PartnerTerms | null }>): number {
  return (Array.isArray(partners) ? partners : [])
    .reduce((total, partner) => total + partnerSharePct(partner), 0);
}

/**
 * "1 T-shirt from Strong X per 1 person brought".
 *
 * A ratio rather than a threshold, because a fixed target does not scale: a
 * community that brings sixty people under a "15 attendees → 1 free ticket"
 * deal has earned one ticket and nothing else, which is not what either side
 * agreed. The reward is free text for the same reason — "20 T-shirts from
 * Strong X for 20 people" cannot be written in tickets.
 */
export function describeMilestoneRatio(terms: PartnerTerms | null | undefined): string {
  const per = Math.max(1, Math.floor(Number(terms?.milestoneAttendeeTarget) || 0));
  const quantity = Math.max(1, Math.floor(Number(terms?.milestoneRewardTickets) || 1));
  const reward = String(terms?.milestoneRewardDescription || "").trim();

  if (!Number(terms?.milestoneAttendeeTarget)) {
    return reward ? `${reward}, per person brought` : "Reward per person brought";
  }

  const rewardLabel = reward
    || `free ticket${quantity === 1 ? "" : "s"}`;
  return `${quantity} × ${rewardLabel} per ${per === 1 ? "person" : `${per} people`} brought`;
}

/**
 * What the ratio comes to at a given headcount — the preview line under the
 * two fields, and the figure the organiser is actually agreeing to.
 */
export function milestoneRewardAt(
  terms: PartnerTerms | null | undefined,
  peopleBrought: number,
): number {
  const per = Math.max(1, Math.floor(Number(terms?.milestoneAttendeeTarget) || 0));
  const quantity = Math.max(1, Math.floor(Number(terms?.milestoneRewardTickets) || 1));
  const heads = Math.max(0, Math.floor(Number(peopleBrought) || 0));
  return Math.floor(heads / per) * quantity;
}

/**
 * The key term, in one line, for the partner list row and the Split Deal
 * Preview. Deliberately terse — the row already carries the deal's name.
 */
export function partnerTermSummary(
  partner: { dealType?: unknown; terms?: PartnerTerms | null },
  currencySymbol = "€",
): string {
  const terms = partner?.terms || {};
  switch (partner?.dealType) {
    case "commission_per_ticket":
      return `${Number(terms.commissionPct || 0)}% of ticket revenue`;
    case "milestone_barter":
      return describeMilestoneRatio(terms);
    case "brand_barter":
      return terms.productDescription?.trim() || "Product for exposure";
    case "financial_sponsorship":
      return `${currencySymbol}${Number(terms.amount || 0).toFixed(2)} towards the event`;
    case "content_license": {
      const subtype = CONTENT_LICENSE_SUBTYPES.find((entry) => entry.id === terms.licenseSubtype);
      return subtype ? `${subtype.label} · content rights` : "Content rights";
    }
    default:
      return "";
  }
}

/**
 * What still has to be filled in before this entry can be saved.
 *
 * Returned as sentences rather than a boolean so the modal can say which field
 * it is waiting on. An entry that names no partner is the one case that is
 * always wrong, whatever the deal.
 */
export function validatePartnerEntry(entry: Partial<EventPartnerEntry>): string[] {
  const problems: string[] = [];
  if (!isPartnerType(entry.partnerType)) problems.push("Choose a partner type");
  if (!String(entry.name || "").trim()) problems.push("Name the partner");
  if (!isPartnerDealType(entry.dealType)) problems.push("Choose a deal type");
  // A restricted combination is blocked at the point of saving rather than
  // stripped on read: an entry saved before the restriction existed still has
  // to render on the event it belongs to, it just cannot be re-agreed.
  else if (!dealAvailableForPartnerType(entry.dealType, entry.partnerType)) {
    problems.push(
      `${partnerDealLabel(entry.dealType)} is not available for a ${partnerTypeLabel(entry.partnerType)} partner`,
    );
  }

  const terms = entry.terms || {};
  switch (entry.dealType) {
    case "commission_per_ticket":
      if (!(Number(terms.commissionPct) > 0)) problems.push("Enter a commission percentage above zero");
      break;
    case "milestone_barter":
      if (!(Number(terms.milestoneAttendeeTarget) > 0)) problems.push("Enter how many people they have to bring");
      if (!(Number(terms.milestoneRewardTickets) > 0)) problems.push("Enter the reward quantity");
      break;
    case "brand_barter":
      if (!String(terms.productDescription || "").trim()) problems.push("Describe what the brand supplies");
      break;
    case "financial_sponsorship":
      if (!(Number(terms.amount) > 0)) problems.push("Enter the sponsorship amount");
      break;
    case "content_license":
      if (!terms.licenseSubtype) problems.push("Choose how the content is licensed");
      if (terms.licenseSubtype === "flat_fee" && !(Number(terms.amount) > 0)) {
        problems.push("Enter the flat fee for the licence");
      }
      break;
    default:
      break;
  }
  return problems;
}

function clampPct(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed * 100) / 100));
}

function cleanText(value: unknown, max = 2000): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

/**
 * Accept a partner entry from anywhere — a form, a draft row saved months ago,
 * a hand-written payload — and return something the rest of the system can rely
 * on, or null when it is not a partner entry at all.
 *
 * Unknown deal types are dropped rather than coerced: a partner silently
 * re-typed into Commission per Ticket would start taking a cut of tickets
 * nobody agreed to.
 */
export function sanitisePartnerEntry(input: any, index = 0): EventPartnerEntry | null {
  if (!input || typeof input !== "object") return null;
  if (!isPartnerType(input.partnerType) || !isPartnerDealType(input.dealType)) return null;

  const name = cleanText(input.name, 200);
  if (!name) return null;

  const rawTerms = input.terms && typeof input.terms === "object" ? input.terms : {};
  const terms: PartnerTerms = {};

  switch (input.dealType as PartnerDealTypeId) {
    case "commission_per_ticket":
      terms.commissionPct = clampPct(rawTerms.commissionPct);
      terms.showInExperiencePool = rawTerms.showInExperiencePool === true;
      terms.assignedAffiliateId = cleanText(rawTerms.assignedAffiliateId, 64) ?? null;
      break;
    case "milestone_barter":
      terms.milestoneAttendeeTarget = Math.max(0, Math.floor(Number(rawTerms.milestoneAttendeeTarget) || 0));
      terms.milestoneRewardTickets = Math.max(1, Math.floor(Number(rawTerms.milestoneRewardTickets) || 1));
      terms.milestoneRewardDescription = cleanText(rawTerms.milestoneRewardDescription, 300);
      break;
    case "brand_barter":
      terms.productDescription = cleanText(rawTerms.productDescription);
      break;
    case "financial_sponsorship":
      terms.amount = Math.max(0, Number(rawTerms.amount) || 0);
      terms.currency = cleanText(rawTerms.currency, 8);
      break;
    case "content_license":
      terms.licenseSubtype = CONTENT_LICENSE_SUBTYPES
        .some((entry) => entry.id === rawTerms.licenseSubtype)
        ? (rawTerms.licenseSubtype as ContentLicenseSubtype)
        : undefined;
      terms.licenseScope = cleanText(rawTerms.licenseScope, 120);
      terms.licenseExpiresDays = Number.isFinite(Number(rawTerms.licenseExpiresDays))
        ? Math.max(0, Math.floor(Number(rawTerms.licenseExpiresDays)))
        : null;
      if (rawTerms.licenseSubtype === "flat_fee") {
        terms.amount = Math.max(0, Number(rawTerms.amount) || 0);
        terms.currency = cleanText(rawTerms.currency, 8);
      }
      break;
    default:
      break;
  }

  const notes = cleanText(rawTerms.notes, 1000);
  if (notes) terms.notes = notes;

  const status = PARTNER_STATUSES.has(String(input.status))
    ? (input.status as PartnerStatus)
    : "draft";

  return {
    id: cleanText(input.id, 64) || `partner-${index}-${Math.random().toString(36).slice(2, 10)}`,
    partnerType: input.partnerType,
    name,
    partnerUserId: cleanText(input.partnerUserId, 64) ?? null,
    email: cleanText(input.email, 254)?.toLowerCase() ?? null,
    source: input.source === "invite_link" ? "invite_link" : "platform",
    dealType: input.dealType,
    terms,
    status,
    inviteToken: cleanText(input.inviteToken, 64) ?? null,
    refCode: cleanText(input.refCode, 64) ?? null,
  };
}

/** The whole list, cleaned. Anything unrecognisable is dropped, never guessed at. */
export function sanitisePartnerEntries(input: unknown): EventPartnerEntry[] {
  const list = Array.isArray(input) ? input : [];
  return list
    .map((entry, index) => sanitisePartnerEntry(entry, index))
    .filter(Boolean) as EventPartnerEntry[];
}

/**
 * Is there a Brand Barter partner whose product could double as the
 * Participant Referral Perk? Returns the first one, so the Partners step can
 * offer "use Beach Bar's product as the perk" instead of asking the organiser
 * to invent a reward they may not have.
 */
export function brandBarterPerkSource(
  partners: EventPartnerEntry[],
): EventPartnerEntry | null {
  return (Array.isArray(partners) ? partners : [])
    .find((partner) => partner.dealType === "brand_barter"
      && !!partner.terms?.productDescription?.trim()) || null;
}

/**
 * A URL-safe, unguessable token. Used for both the invite link and the ?ref=
 * attribution code — the same mechanism the Collab Idea post and the
 * Participant Referral Perk already use, reused rather than rebuilt.
 */
export function generatePartnerToken(length = 24): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined;

  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let index = 0; index < length; index += 1) {
      token += alphabet[bytes[index] % alphabet.length];
    }
    return token;
  }

  for (let index = 0; index < length; index += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
}

/**
 * A handle a partner can recognise in a link — "goodsoles", not "a7f3c9".
 * Falls back to a token when the name has nothing usable in it.
 */
export function refCodeFromName(name: string, salt = ""): string {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  if (!slug) return generatePartnerToken(10);
  return salt ? `${slug}${salt}` : slug;
}

/**
 * The single-deal fields, derived from the partner list.
 *
 * `promotionDealType`, `influencerCommissionPct`, `promoterEnabled` and the
 * rest predate the Partners model, and the payout engine, the Experience Pool
 * and the promotion-deal handshake all still read them. Deriving them from the
 * list — rather than asking an organiser to keep two places in step — is what
 * lets the list be the only thing anyone edits.
 *
 * Extracted out of the Partners step because it decides what partners are
 * actually paid: a percentage read off the wrong entry is money going to the
 * wrong party, and that is not something to leave inside a render effect with
 * no test around it.
 *
 * The affiliate is preferred over merely the first entry, because the affiliate
 * is the one whose deal moves money through the ticket rails. An event with a
 * community on barter and an affiliate on commission must report the
 * commission, not the barter.
 */
export type LegacyPromotionFields = {
  promotionDealType: PartnerDealTypeId | null;
  influencerPromotionEnabled: boolean;
  influencerCommissionPct: number;
  promotionMilestoneAttendeeTarget: number | null;
  promotionMilestoneRewardTickets: number;
  promotionBrandPitch: string;
  promotionSponsorshipAmount: number | null;
  promotionSelectedPartnerIds: string[];
  promotionExternalInvites: Array<{ id: string; email: string; name: string; website: string }>;
  /**
   * Null when no affiliate is on the event at all — the caller leaves the
   * event's pool visibility exactly as the organiser last set it, rather than
   * silently switching it off.
   */
  promoterEnabled: boolean | null;
};

export function deriveLegacyPromotionFields(partners: EventPartnerEntry[]): LegacyPromotionFields {
  const list = Array.isArray(partners) ? partners : [];
  const affiliate = list.find((partner) => partner.dealType === "commission_per_ticket");
  const first = affiliate || list[0] || null;
  const milestone = list.find((partner) => partner.dealType === "milestone_barter");
  const brand = list.find((partner) => partner.dealType === "brand_barter");
  const sponsorship = list.find((partner) => partner.dealType === "financial_sponsorship");

  return {
    // `content_license` has no legacy equivalent and nothing in the old engine
    // settles one, so an event whose only partner holds a content deal reports
    // no legacy deal type rather than a wrong one.
    promotionDealType: first && first.dealType !== "content_license" ? first.dealType : null,
    influencerPromotionEnabled: !!affiliate,
    influencerCommissionPct: affiliate ? Number(affiliate.terms?.commissionPct || 0) : 0,
    promotionMilestoneAttendeeTarget: milestone?.terms?.milestoneAttendeeTarget ?? null,
    promotionMilestoneRewardTickets: milestone?.terms?.milestoneRewardTickets ?? 1,
    promotionBrandPitch: brand?.terms?.productDescription || "",
    promotionSponsorshipAmount: sponsorship?.terms?.amount ?? null,
    promotionSelectedPartnerIds: list
      .map((partner) => partner.partnerUserId)
      .filter(Boolean) as string[],
    // A partner invited by link with no email has nothing to send, so it is
    // left out rather than emailed to an empty address.
    promotionExternalInvites: list
      .filter((partner) => partner.source === "invite_link" && partner.email)
      .map((partner) => ({
        id: partner.id,
        email: partner.email as string,
        name: partner.name,
        website: "",
      })),
    promoterEnabled: affiliate ? affiliate.terms?.showInExperiencePool === true : null,
  };
}
