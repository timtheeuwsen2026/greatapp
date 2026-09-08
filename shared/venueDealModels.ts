/**
 * The single vocabulary for venue commercial deals.
 *
 * The Event Builder and the Venue Builder used to offer different lists — the
 * venue side spoke in `flat_rental` / `per_head_package` / `whole_venue` /
 * `per_room` while the event side spoke in `upfront_rental` / `per_head` /
 * `fixed_fee`, and both showed the same options to a one-day pop-up and a
 * three-day villa. A creator could ask a retreat for "Access-Only /
 * Pay-at-Counter", and a venue's chosen pricing model never lined up with the
 * deals it was offered.
 *
 * Everything that renders, stores or explains a deal reads from here.
 */

import { summariseTicketRevenue } from "./ticketRevenue";

export const VENUE_DEAL_MODELS = [
  "revenue_share",
  "fixed_fee",
  "per_head",
  "per_room_night",
  "upfront_rental",
  "access_only",
  "venue_sponsored",
  // A venue that will not fund a whole event but will put something in to show
  // it means it: a small one-time fee to the organiser, and a share of ticket
  // revenue back. Its own model rather than sponsorship plus a split, because
  // those two are mutually exclusive by design and this is the one sanctioned
  // case of a venue both paying in and taking a cut.
  "commitment_plus_revenue_share",
  // An escape hatch, not a pricing model: the money is taken at the venue's own
  // register and the platform never sees it. Kept last, and marked untracked
  // everywhere it is offered, so it reads as the exception it is.
  "manual_counter_revenue",
  // Retained so events and venues saved before the V14 sync still render.
  "minimum_spend",
] as const;

export type VenueDealModel = (typeof VENUE_DEAL_MODELS)[number];

/** How the number attached to a deal should be read. */
export type VenueDealValueKind = "percent" | "amount" | "none";

type VenueDealDefinition = {
  model: VenueDealModel;
  /** Label shown in every dropdown. `{cur}` is replaced with the currency symbol. */
  label: string;
  /** One line of plain English for the option's help text. */
  description: string;
  valueKind: VenueDealValueKind;
  /** Key inside venueContracts.terms that carries the number. */
  termsKey: "revenueSharePct" | "fixedFee" | "perHeadAmount" | "perRoomPerNight" | "minimumSpend" | "accessFee" | "counterRevenuePct" | null;
  /**
   * A second number the deal carries, where one number cannot describe it.
   * Only Commitment Fee + Revenue Share needs this: the percentage flows from
   * the organiser to the venue, the fee flows the other way.
   */
  secondaryTermsKey?: "commitmentFee";
  secondaryValueKind?: VenueDealValueKind;
  secondaryValueLabel?: string;
  secondaryDirection?: "creator_pays_venue" | "venue_pays_creator";
  /** Label for the amount input next to the dropdown. */
  valueLabel: string;
  /** Who pays whom. Drives which side gets charged. */
  direction: "attendee_funded" | "creator_pays_venue" | "venue_pays_creator";
  /** Kept for existing records but no longer offered in any dropdown. */
  legacy?: boolean;
  /**
   * The platform cannot see, verify or split this money. Surfaces must present
   * these apart from the trackable deals rather than as a peer of them.
   */
  untracked?: boolean;
};

const DEFINITIONS: Record<VenueDealModel, VenueDealDefinition> = {
  revenue_share: {
    model: "revenue_share",
    label: "Revenue Split (%)",
    description: "The venue takes a percentage of ticket sales.",
    valueKind: "percent",
    termsKey: "revenueSharePct",
    valueLabel: "Venue share (%)",
    direction: "attendee_funded",
  },
  fixed_fee: {
    model: "fixed_fee",
    label: "Ticket Deduction / Per-Head Fee ({cur})",
    description: "A flat amount per ticket sold goes to the venue.",
    valueKind: "amount",
    termsKey: "fixedFee",
    valueLabel: "Amount per ticket ({cur})",
    direction: "attendee_funded",
  },
  per_head: {
    model: "per_head",
    label: "Per-Participant Package ({cur})",
    description: "A fixed rate per participant covering bed and food.",
    valueKind: "amount",
    termsKey: "perHeadAmount",
    valueLabel: "Package rate per participant ({cur})",
    direction: "attendee_funded",
  },
  per_room_night: {
    model: "per_room_night",
    label: "Per Room / Per Night ({cur})",
    description: "The venue charges a nightly rate for each room used.",
    valueKind: "amount",
    termsKey: "perRoomPerNight",
    valueLabel: "Rate per room per night ({cur})",
    direction: "creator_pays_venue",
  },
  upfront_rental: {
    model: "upfront_rental",
    label: "Upfront Rental / Flat Fee ({cur})",
    description: "You pay the venue a flat rental fee to hold the space.",
    valueKind: "amount",
    termsKey: "fixedFee",
    valueLabel: "Rental fee you pay the venue ({cur})",
    direction: "creator_pays_venue",
  },
  access_only: {
    model: "access_only",
    label: "Access-Only / Pay-at-Counter",
    description: "No ticket split — the venue keeps what guests spend on site.",
    valueKind: "none",
    termsKey: "accessFee",
    valueLabel: "Access fee ({cur})",
    direction: "attendee_funded",
  },
  venue_sponsored: {
    model: "venue_sponsored",
    label: "Venue Sponsorship ({cur})",
    description: "The venue pays you a flat fee to host the event there.",
    valueKind: "amount",
    termsKey: "fixedFee",
    valueLabel: "Sponsorship the venue pays you ({cur})",
    direction: "venue_pays_creator",
  },
  manual_counter_revenue: {
    model: "manual_counter_revenue",
    label: "Manual agreement (untracked) — % revenue over the counter",
    description:
      "Guests pay the venue directly at the register. The organiser and venue agree the percentage between themselves and settle it themselves — the platform records the figure but cannot see, verify or collect it.",
    valueKind: "percent",
    termsKey: "counterRevenuePct",
    valueLabel: "Agreed share of counter revenue (%)",
    direction: "attendee_funded",
    untracked: true,
  },
  commitment_plus_revenue_share: {
    model: "commitment_plus_revenue_share",
    label: "Commitment Fee + Revenue Split ({cur} + %)",
    description:
      "The venue pays you a small one-off commitment fee upfront, and takes an agreed share of paid ticket revenue afterwards.",
    valueKind: "percent",
    termsKey: "revenueSharePct",
    valueLabel: "Venue share of ticket revenue (%)",
    // The share is the ongoing term, so the deal is read as attendee-funded;
    // the fee is a separate one-off recorded alongside it.
    direction: "attendee_funded",
    secondaryTermsKey: "commitmentFee",
    secondaryValueKind: "amount",
    secondaryValueLabel: "Commitment fee the venue pays you ({cur})",
    secondaryDirection: "venue_pays_creator",
  },
  minimum_spend: {
    model: "minimum_spend",
    label: "Minimum Spend Guarantee ({cur})",
    description: "The group guarantees a minimum spend at the venue.",
    valueKind: "amount",
    termsKey: "minimumSpend",
    valueLabel: "Guaranteed minimum spend ({cur})",
    direction: "attendee_funded",
    legacy: true,
  },
};

// The two lists, in the order they are presented.
const MULTI_DAY_MODELS: VenueDealModel[] = [
  "revenue_share",
  "per_head",
  "upfront_rental",
  "per_room_night",
  "commitment_plus_revenue_share",
  "manual_counter_revenue",
];

const DAY_EVENT_MODELS: VenueDealModel[] = [
  "revenue_share",
  "fixed_fee",
  "upfront_rental",
  "venue_sponsored",
  "commitment_plus_revenue_share",
  "manual_counter_revenue",
];

// Temporarily disabled for every creator/venue dropdown. Keep the definition
// and normalizer so historical contracts still render without data loss.
const HIDDEN_FROM_DEAL_DROPDOWNS = new Set<VenueDealModel>(["access_only"]);

/**
 * Older records used a different key for the same idea. Reading them through
 * this keeps existing events and venue listings rendering correctly.
 */
const LEGACY_ALIASES: Record<string, VenueDealModel> = {
  flat_rental: "upfront_rental",
  whole_venue: "upfront_rental",
  per_head_package: "per_head",
  per_room: "per_room_night",
  per_room_per_night: "per_room_night",
  ticket_deduction: "fixed_fee",
  revenue_split: "revenue_share",
};

export function isVenueDealModel(value: unknown): value is VenueDealModel {
  return typeof value === "string" && (VENUE_DEAL_MODELS as readonly string[]).includes(value);
}

/** True only for canonical models that users may select in a new deal. */
export function isVenueDealSelectable(value: unknown): value is VenueDealModel {
  return isVenueDealModel(value) && !HIDDEN_FROM_DEAL_DROPDOWNS.has(value);
}

/**
 * The same check, plus the per-event untracked unlock.
 *
 * Every surface that accepts a newly chosen deal — the builder, a venue's
 * counter-offer, a marketplace bid — has to ask this rather than
 * `isVenueDealSelectable`, or the manual deal is still reachable by posting
 * the value directly.
 */
export function canSelectVenueDeal(value: unknown, allowUntracked = false): value is VenueDealModel {
  if (!isVenueDealSelectable(value)) return false;
  return allowUntracked || DEFINITIONS[value].untracked !== true;
}

/** Shown wherever the manual deal used to sit in a dropdown. */
export const UNTRACKED_DEAL_LOCKED_MESSAGE =
  "Manual agreements settle outside the app, so they are enabled per event by support. "
  + "Contact us if this venue genuinely cannot take payment through the platform.";

/** Maps a stored value — current or legacy — onto a canonical model. */
export function normalizeVenueDealModel(value: unknown): VenueDealModel | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (isVenueDealModel(trimmed)) return trimmed;
  return LEGACY_ALIASES[trimmed] ?? null;
}

export type VenueDealOption = {
  value: VenueDealModel;
  label: string;
  description: string;
  valueKind: VenueDealValueKind;
  valueLabel: string;
  termsKey: VenueDealDefinition["termsKey"];
  direction: VenueDealDefinition["direction"];
  /** Settled off-platform. Render apart from the trackable deals, never beside them. */
  untracked: boolean;
  /** Present only on deals that need a second number, with its own direction. */
  secondaryTermsKey?: VenueDealDefinition["secondaryTermsKey"];
  secondaryValueKind?: VenueDealValueKind;
  secondaryValueLabel?: string;
  secondaryDirection?: VenueDealDefinition["secondaryDirection"];
};

function render(definition: VenueDealDefinition, currencySymbol: string): VenueDealOption {
  return {
    value: definition.model,
    label: definition.label.replace("{cur}", currencySymbol),
    description: definition.description,
    valueKind: definition.valueKind,
    valueLabel: definition.valueLabel.replace("{cur}", currencySymbol),
    termsKey: definition.termsKey,
    direction: definition.direction,
    untracked: definition.untracked === true,
    secondaryTermsKey: definition.secondaryTermsKey,
    secondaryValueKind: definition.secondaryValueKind,
    secondaryValueLabel: definition.secondaryValueLabel?.replace("{cur}", currencySymbol),
    secondaryDirection: definition.secondaryDirection,
  };
}

/** True for deals the platform records but cannot verify or collect. */
export function isUntrackedVenueDeal(model: unknown): boolean {
  const normalized = normalizeVenueDealModel(model);
  return !!normalized && DEFINITIONS[normalized].untracked === true;
}

export type VenueDealOptionsInput = {
  /** A one-day event or a daytime space gets the day list. */
  isDaytime: boolean;
  /**
   * Whether this event may use an untracked deal.
   *
   * Untracked deals settle off-platform — the app records a percentage it can
   * never see, verify or collect. Offered as an ordinary dropdown choice the
   * manual deal became the path of least resistance rather than the exception
   * it was added as, so it is hidden unless an admin has unlocked it for this
   * one event. Defaults to locked: a surface that forgets to ask gets the safe
   * list, not the permissive one.
   */
  allowUntracked?: boolean;
  /**
   * Which dashboard is asking. Both get the same list — a venue answering an
   * offer can only speak in the vocabulary the creator proposed it in, and a
   * venue offering to sponsor an event is a deal it makes about itself.
   */
  surface: "event" | "venue";
  currencySymbol?: string;
  /** A value already saved, so a legacy deal stays selectable while editing. */
  currentValue?: string | null;
};

/**
 * The options a dropdown should show. Both builders call this, which is what
 * keeps their vocabulary identical.
 */
export function getVenueDealOptions(input: VenueDealOptionsInput): VenueDealOption[] {
  const currencySymbol = input.currencySymbol || "€";
  const models = input.isDaytime ? DAY_EVENT_MODELS : MULTI_DAY_MODELS;
  const allowUntracked = input.allowUntracked === true;
  const isOffered = (model: VenueDealModel) =>
    !HIDDEN_FROM_DEAL_DROPDOWNS.has(model)
    && (allowUntracked || DEFINITIONS[model].untracked !== true);

  const options = models
    .filter(isOffered)
    .map((model) => render(DEFINITIONS[model], currencySymbol));

  // Keep an already-saved legacy deal visible while editing, unless the model
  // has been explicitly disabled platform-wide. Pay-at-Counter must not be
  // reintroduced merely because an older draft already selected it — and nor
  // must a manual deal on an event that has since been locked back down.
  const current = normalizeVenueDealModel(input.currentValue);
  if (
    current
    && isOffered(current)
    && !options.some((option) => option.value === current)
  ) {
    options.push(render(DEFINITIONS[current], currencySymbol));
  }

  return options;
}

/**
 * Validates one newly selected deal. Historical disabled models can still be
 * rendered, but they cannot be used to create a new proposal or counteroffer.
 */
export function getVenueDealSelectionError(
  model: unknown,
  value: unknown,
  allowUntracked = false,
): string | null {
  if (!canSelectVenueDeal(model, allowUntracked)) {
    return isUntrackedVenueDeal(model)
      ? UNTRACKED_DEAL_LOCKED_MESSAGE
      : "Select an available on-platform venue deal";
  }

  const definition = DEFINITIONS[model];
  if (definition.valueKind === "none") return null;

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return definition.valueKind === "percent"
      ? "Enter a percentage greater than zero"
      : "Enter an amount greater than zero";
  }
  if (definition.valueKind === "percent" && amount > 100) {
    return "Revenue share percentage cannot exceed 100";
  }

  return null;
}

type ExperienceVenueDealInput = {
  venueType?: unknown;
  selectedVenueId?: unknown;
  venueTargetDeal?: unknown;
  venueTargetDealValue?: unknown;
  venueCompensationModel?: unknown;
  venueFixedFee?: unknown;
  venuePerHeadAmount?: unknown;
  venuePerRoomPerNight?: unknown;
  venueMinimumSpend?: unknown;
  venueRevenueSharePct?: unknown;
  /** Set by an admin, per event, to permit an untracked manual agreement. */
  manualDealUnlocked?: unknown;
  /** Needed to check the deal is affordable; omit to skip that check. */
  ticketSkus?: unknown;
  maxParticipants?: unknown;
  platformPct?: unknown;
  /** The builder's legacy name for the same figure. */
  platformRevenuePercentage?: unknown;
  currency?: unknown;
  venueCommitmentFee?: unknown;
};

function readExperienceVenueDealValue(input: ExperienceVenueDealInput, model: unknown): unknown {
  switch (model) {
    case "revenue_share":
    // Shares the existing percentage column rather than adding one for a
    // stopgap. Both are a percentage the creator types in, and the model
    // stored alongside it is what decides whether anything is collected.
    case "manual_counter_revenue":
    // Shares the percentage column with Revenue Split; the commitment fee is a
    // separate figure carried alongside it.
    case "commitment_plus_revenue_share": return input.venueRevenueSharePct;
    case "fixed_fee":
    case "upfront_rental":
    case "venue_sponsored": return input.venueFixedFee;
    case "per_head": return input.venuePerHeadAmount;
    case "per_room_night": return input.venuePerRoomPerNight;
    case "minimum_spend": return input.venueMinimumSpend;
    default: return undefined;
  }
}

/**
 * Publication-time guard for the existing venue contexts. This deliberately
 * does not implement the paused Ticket Type matrix; it only guarantees that a
 * venue deal is on-platform, selected, and numerically usable.
 */
/**
 * Is the chosen deal one the event can actually honour?
 *
 * Returns nothing when there is no priced ticket to check against — a free
 * event has no gross for a payout to overdraw, and a creator still filling in
 * the builder should not be blocked by a half-entered number.
 */
function affordabilityErrors(
  input: ExperienceVenueDealInput,
  model: unknown,
  value: unknown,
): string[] {
  if (!Array.isArray(input.ticketSkus) || input.ticketSkus.length === 0) return [];

  const summary = summariseTicketRevenue(input.ticketSkus as any[], input.maxParticipants);
  if (summary.ticketGross <= 0) return [];

  // Two names for the platform's cut are in circulation; a missing one means no
  // platform fee is assumed, which can only ever under-report a breach.
  const platformPct = Number(input.platformPct ?? input.platformRevenuePercentage);
  const check = checkVenuePayoutCap({
    model,
    value: Number(value) || 0,
    ticketGross: summary.ticketGross,
    paidTickets: summary.paidCapacity,
    platformPct: Number.isFinite(platformPct) ? platformPct : 0,
    currencySymbol: currencySymbolFor(input.currency),
  });

  return check.message ? [check.message] : [];
}

export function validateExperienceVenueDeal(input: ExperienceVenueDealInput): string[] {
  const venueType = String(input.venueType || "catalog");
  const allowUntracked = input.manualDealUnlocked === true;

  if (venueType === "open" || venueType === "manual") {
    const error = getVenueDealSelectionError(
      input.venueTargetDeal,
      input.venueTargetDealValue,
      allowUntracked,
    );
    if (error) return [`Target deal: ${error}`];
    return affordabilityErrors(input, input.venueTargetDeal, input.venueTargetDealValue);
  }

  const hasCatalogVenue = venueType === "catalog"
    && typeof input.selectedVenueId === "string"
    && input.selectedVenueId.trim() !== "";
  if (hasCatalogVenue) {
    const dealValue = readExperienceVenueDealValue(input, input.venueCompensationModel);
    const error = getVenueDealSelectionError(
      input.venueCompensationModel,
      dealValue,
      allowUntracked,
    );
    if (error) return [`Venue commercial deal: ${error}`];
    return affordabilityErrors(input, input.venueCompensationModel, dealValue);
  }

  return [];
}

export function getVenueDealDefinition(model: unknown): VenueDealOption | null {
  const normalized = normalizeVenueDealModel(model);
  return normalized ? render(DEFINITIONS[normalized], "€") : null;
}

export function getVenueDealLabel(model: unknown, currencySymbol = "€"): string {
  const normalized = normalizeVenueDealModel(model);
  if (!normalized) return typeof model === "string" && model ? model : "Venue deal";
  return DEFINITIONS[normalized].label.replace("{cur}", currencySymbol);
}

/** Which terms key holds this model's number, if any. */
export function getVenueDealTermsKey(model: unknown): VenueDealDefinition["termsKey"] {
  const normalized = normalizeVenueDealModel(model);
  return normalized ? DEFINITIONS[normalized].termsKey : null;
}

/** True when the model needs an amount or percentage alongside it. */
export function venueDealNeedsValue(model: unknown): boolean {
  const normalized = normalizeVenueDealModel(model);
  return !!normalized && DEFINITIONS[normalized].valueKind !== "none";
}

/** Pulls the deal's number out of a stored terms object. */
export function readVenueDealValue(
  model: unknown,
  terms: Record<string, any> | null | undefined,
): number | null {
  const key = getVenueDealTermsKey(model);
  if (!key || !terms) return null;
  const parsed = Number(terms[key]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** One-line human summary, used in emails, dashboards and contract cards. */
/** Who pays whom under this deal. */
export function getVenueDealDirection(model: unknown): VenueDealDefinition["direction"] | null {
  const normalized = normalizeVenueDealModel(model);
  return normalized ? DEFINITIONS[normalized].direction : null;
}

export type VenueEarningsInput = {
  model: unknown;
  /** The number this deal carries: a percentage, a per-ticket amount, a fee. */
  value: number;
  /** Gross ticket revenue taken for the event, in major units. */
  grossRevenue: number;
  /** Confirmed attendees, which for these models is also tickets sold. */
  attendees: number;
  /** Multi-day only: rooms multiplied by nights. */
  roomNights?: number;
  /** The deal's second figure, where it has one — today, the commitment fee. */
  secondaryValue?: number;
};

export type VenueEarnings = {
  /** What the venue is due for this event, through the platform. */
  earned: number;
  /** What the venue owes the creator for this event. */
  owed: number;
  /**
   * True when the money never passes through the platform — an access-only
   * arrangement or a minimum-spend guarantee is settled at the counter, so
   * reporting a number here would be inventing one.
   */
  offPlatform: boolean;
};

/**
 * What a venue actually makes on one event.
 *
 * A venue's dashboard used to show the creator's gross ticket revenue, which
 * is neither theirs nor any of their business — a coffee shop asked to sponsor
 * an event for 50 could see the run club had taken 8 in ticket sales. This is
 * the answer to the only question a venue should be asking of it: what am I
 * owed, and what do I owe?
 */
export function calculateVenueEarnings(input: VenueEarningsInput): VenueEarnings {
  const none: VenueEarnings = { earned: 0, owed: 0, offPlatform: false };
  const normalized = normalizeVenueDealModel(input.model);
  if (!normalized) return none;

  const value = Number.isFinite(input.value) ? input.value : 0;
  const gross = Number.isFinite(input.grossRevenue) ? input.grossRevenue : 0;
  const attendees = Number.isFinite(input.attendees) ? input.attendees : 0;
  const roomNights = Number.isFinite(input.roomNights ?? 0) ? (input.roomNights ?? 0) : 0;

  switch (normalized) {
    case "revenue_share":
      return { ...none, earned: gross * (value / 100) };
    // "A flat amount per ticket sold goes to the venue" — a deduction, not a
    // single fee, which is why it scales with attendance.
    case "fixed_fee":
    case "per_head":
      return { ...none, earned: value * attendees };
    case "per_room_night":
      return { ...none, earned: value * roomNights };
    case "upfront_rental":
      return { ...none, earned: value };
    case "venue_sponsored":
      return { ...none, owed: value };
    case "commitment_plus_revenue_share":
      return {
        ...none,
        earned: gross * (value / 100),
        owed: Number.isFinite(input.secondaryValue ?? 0) ? (input.secondaryValue ?? 0) : 0,
      };
    case "access_only":
    case "minimum_spend":
    case "manual_counter_revenue":
      return { ...none, offPlatform: true };
  }
}

export type VenuePayoutCapInput = {
  model: unknown;
  /** The deal's headline number: a percentage, a per-ticket amount, a fee. */
  value: number;
  /** Gross from paid tickets only — free tickets and add-on money excluded. */
  ticketGross: number;
  /** Paid tickets only. A per-head fee must not be charged for a free RSVP. */
  paidTickets: number;
  /** The platform's cut, read from settings rather than assumed. */
  platformPct: number;
  /** Multi-day only: rooms multiplied by nights. */
  roomNights?: number;
  /**
   * Currency symbol for the message. The publication checklist renders this
   * text verbatim, so an unformatted number there reads as a different figure
   * from the identical one on the Pricing step.
   */
  currencySymbol?: string;
};

export type VenuePayoutCapResult = {
  /** What leaves the creator for the venue under this deal. */
  venueCost: number;
  platformFee: number;
  /** What the creator is left with. Negative means the deal cannot be honoured. */
  creatorNet: number;
  /** Venue payout plus platform fee, as a share of gross. */
  totalTakePct: number;
  exceedsGross: boolean;
  /** Ready to show, or null when the deal is affordable. */
  message: string | null;
};

/**
 * Can the event actually pay for this deal?
 *
 * Two proposals went out that could not be honoured, and nothing warned:
 * a 90% revenue split against a 15% platform fee is 105% of gross, and a €5
 * per-ticket deduction on a €5.50 ticket leaves less than the platform fee.
 * Both showed a silently negative "Estimated Net to You" — −€8.80 and −€10.40 —
 * which reads as a rounding oddity rather than an impossible commitment.
 *
 * Deals the venue funds cannot breach anything, so they always pass. A one-time
 * commitment fee is income and is deliberately not netted off here: the rule is
 * about the ongoing share, so the percentage alone is what gets checked.
 */
export function checkVenuePayoutCap(input: VenuePayoutCapInput): VenuePayoutCapResult {
  const normalized = normalizeVenueDealModel(input.model);
  const gross = Number.isFinite(input.ticketGross) ? Math.max(0, input.ticketGross) : 0;
  const platformPct = Number.isFinite(input.platformPct) ? Math.max(0, input.platformPct) : 0;
  const platformFee = round2(gross * (platformPct / 100));

  const earnings = normalized
    ? calculateVenueEarnings({
        model: normalized,
        value: Number.isFinite(input.value) ? input.value : 0,
        grossRevenue: gross,
        attendees: Number.isFinite(input.paidTickets) ? Math.max(0, input.paidTickets) : 0,
        roomNights: input.roomNights,
      })
    : { earned: 0, owed: 0, offPlatform: false };

  // Money the platform never sees cannot overdraw an event's ticket revenue.
  const venueCost = earnings.offPlatform ? 0 : round2(earnings.earned);
  const creatorNet = round2(gross - platformFee - venueCost);
  const totalTakePct = gross > 0 ? round2(((venueCost + platformFee) / gross) * 100) : 0;
  const exceedsGross = gross > 0 && venueCost + platformFee > gross + 0.005;

  const money = (value: number) => formatMoneyish(value, input.currencySymbol);

  return {
    venueCost,
    platformFee,
    creatorNet,
    totalTakePct,
    exceedsGross,
    message: exceedsGross
      ? `This deal pays out more than the event takes. The venue's ${money(venueCost)} `
        + `plus the ${platformPct}% platform fee (${money(platformFee)}) comes to `
        + `${totalTakePct}% of ${money(gross)} in ticket sales, leaving you `
        // "on ticket sales" is load-bearing: the cap is a ticket-revenue rule,
        // so this figure deliberately excludes a commitment fee or an add-on
        // margin. Without the qualifier it read as a second, contradictory net
        // beside the calculator's.
        + `${money(creatorNet)} on ticket sales. `
        + `Lower the venue's terms or raise your ticket price.`
      : null,
  };
}

/** Minimal symbol lookup for the warning text; the UI has its own formatter. */
function currencySymbolFor(currency: unknown): string {
  const code = String(currency || "").trim().toLowerCase();
  return ({ usd: "$", eur: "€", gbp: "£" } as Record<string, string>)[code] || "";
}

function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/**
 * An amount inside the warning text, with a thousands separator and the
 * currency symbol when the caller supplied one. The checklist prints this
 * message as-is, so it has to be readable on its own.
 */
function formatMoneyish(value: number, currencySymbol?: string): string {
  const negative = value < 0;
  const formatted = Math.abs(value).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const withSymbol = currencySymbol ? `${formatted} ${currencySymbol}` : formatted;
  return negative ? `-${withSymbol}` : withSymbol;
}

export function formatVenueDealSummary(
  model: string | null | undefined,
  terms: Record<string, any> | null | undefined,
  currency?: string | null,
): string {
  const normalized = normalizeVenueDealModel(model);
  if (!normalized) return model || "Venue deal";

  const definition = DEFINITIONS[normalized];
  const code = String(currency || terms?.currency || "eur").toUpperCase();
  const value = readVenueDealValue(normalized, terms);

  if (definition.valueKind === "none") {
    const accessFee = Number(terms?.accessFee || 0);
    return accessFee > 0
      ? `Access-Only / Pay-at-Counter — ${code} ${accessFee} access fee`
      : "Access-Only / Pay-at-Counter";
  }

  const amount = value ?? 0;
  switch (normalized) {
    case "revenue_share":
      return `Revenue Split — ${amount}% of ticket sales`;
    case "fixed_fee":
      return `Ticket Deduction — ${code} ${amount} per ticket`;
    case "per_head":
      return `Per-Participant Package — ${code} ${amount} per participant`;
    case "per_room_night":
      return `Per Room / Per Night — ${code} ${amount} per room per night`;
    case "upfront_rental":
      return `Upfront Rental — creator pays ${code} ${amount}`;
    case "venue_sponsored":
      return `Venue Sponsorship — venue pays ${code} ${amount} to the creator`;
    case "minimum_spend":
      return `Minimum Spend Guarantee — ${code} ${amount}`;
    case "commitment_plus_revenue_share": {
      const fee = Number(terms?.commitmentFee || 0);
      return `Commitment Fee + Revenue Split — venue pays ${code} ${fee} upfront, then takes ${amount}% of paid ticket revenue`;
    }
    case "manual_counter_revenue":
      return `Manual agreement (untracked) — ${amount}% of counter revenue, settled directly between organiser and venue`;
    default:
      return definition.label.replace("{cur}", code);
  }
}
