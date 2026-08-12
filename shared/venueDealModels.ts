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

export const VENUE_DEAL_MODELS = [
  "revenue_share",
  "fixed_fee",
  "per_head",
  "per_room_night",
  "upfront_rental",
  "access_only",
  "venue_sponsored",
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
  termsKey: "revenueSharePct" | "fixedFee" | "perHeadAmount" | "perRoomPerNight" | "minimumSpend" | "accessFee" | null;
  /** Label for the amount input next to the dropdown. */
  valueLabel: string;
  /** Who pays whom. Drives which side gets charged. */
  direction: "attendee_funded" | "creator_pays_venue" | "venue_pays_creator";
  /** Kept for existing records but no longer offered in any dropdown. */
  legacy?: boolean;
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
];

const DAY_EVENT_MODELS: VenueDealModel[] = [
  "revenue_share",
  "fixed_fee",
  "upfront_rental",
  "access_only",
  "venue_sponsored",
];

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
  };
}

export type VenueDealOptionsInput = {
  /** A one-day event or a daytime space gets the day list. */
  isDaytime: boolean;
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

  const options = models.map((model) => render(DEFINITIONS[model], currencySymbol));

  // Keep an already-saved deal visible even if it is no longer offered,
  // otherwise editing an older event silently clears its terms.
  const current = normalizeVenueDealModel(input.currentValue);
  if (current && !options.some((option) => option.value === current)) {
    options.push(render(DEFINITIONS[current], currencySymbol));
  }

  return options;
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
    default:
      return definition.label.replace("{cur}", code);
  }
}
