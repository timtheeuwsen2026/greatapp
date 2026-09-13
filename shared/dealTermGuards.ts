/**
 * The Deal Type Matrix's hard exclusions, and the one recommendation it makes.
 *
 * Everything here answers the same question: can the numbers the organiser has
 * just typed ever produce a sane outcome? Not "is this a good deal" — that is
 * theirs to judge — but "does this arithmetic guarantee a loss no matter how
 * the event goes".
 *
 * Three rules, each from a real trap:
 *
 *  1. **A ticket deduction cannot exceed the ticket price.** €12 off a €10
 *     ticket means every seat sold takes the organiser further into the red.
 *     Turnout cannot rescue it; selling more makes it worse.
 *
 *  2. **A deductive add-on margin cannot exceed the venue's own price.** In
 *     deduction mode the organiser's margin comes *out* of the venue's price
 *     rather than on top of it, so a €4 margin on a €3 coffee pays the venue
 *     −€1 for making it.
 *
 *  3. **Fixed-cost deals want a Minimum Viable Group.** Upfront Rental and
 *     Per Room / Per Night are owed in full whether four people come or forty.
 *     Every other deal scales itself down with turnout; these two do not, and
 *     MVG is the only mechanism the platform has that cancels cleanly before
 *     the money is committed. A recommendation rather than a block — a venue
 *     hire the organiser is happy to underwrite is a legitimate choice.
 *
 * Kept apart from `dealExclusions.ts`, which is about which *promotion* deals
 * may run alongside each other. These are about a single deal's own numbers.
 */

import { normalizeVenueDealModel, type VenueDealModel } from "./venueDealModels";

/** Deals whose cost does not fall when fewer people turn up. */
export const FIXED_COST_VENUE_DEALS: VenueDealModel[] = ["upfront_rental", "per_room_night"];

export type DealTermIssue = {
  /** Stable id, so a caller can anchor a warning to a field without matching copy. */
  key: string;
  /** `block` stops publication. `warn` is advice the organiser may overrule. */
  severity: "block" | "warn";
  /** Which input is at fault, for highlighting. */
  field: string;
  message: string;
};

function finite(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, symbol = "€"): string {
  const formatted = Math.abs(value).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}${symbol}${formatted}`;
}

export type TicketDeductionCheckInput = {
  /** The selected venue deal. Only the per-ticket deals are checked. */
  model: unknown;
  /** The per-ticket amount the venue takes. */
  deductionPerTicket: unknown;
  /**
   * Every priced ticket type on the event. The deduction is charged per seat
   * sold, so the *cheapest* paid ticket is what has to cover it — a deduction
   * that clears the top tier and not the bottom one still loses money on every
   * bottom-tier sale.
   */
  ticketPrices: Array<unknown>;
  currencySymbol?: string;
};

/**
 * Is a per-ticket deduction larger than the ticket it comes out of?
 *
 * Free tickets are excluded from the comparison rather than treated as a €0
 * ceiling: a Free RSVP tier sells nothing, so it has no price for a deduction
 * to exceed. (The deduction charged against free tickets is separately zero —
 * see `calculateTicketDeductionForCount`.)
 */
export function checkTicketDeductionAgainstPrice(
  input: TicketDeductionCheckInput,
): DealTermIssue | null {
  const model = normalizeVenueDealModel(input.model);
  if (model !== "fixed_fee" && model !== "per_head") return null;

  const deduction = finite(input.deductionPerTicket);
  if (deduction <= 0) return null;

  const paidPrices = (input.ticketPrices || [])
    .map(finite)
    .filter((price) => price > 0);
  if (paidPrices.length === 0) return null;

  const cheapest = Math.min(...paidPrices);
  if (deduction <= cheapest + 0.005) return null;

  const symbol = input.currencySymbol || "€";
  const perTicketLoss = deduction - cheapest;
  return {
    key: "deduction_exceeds_ticket_price",
    severity: "block",
    field: "venueTicketDeduction",
    message:
      `The venue's ${money(deduction, symbol)} per ticket is more than your cheapest paid ticket `
      + `(${money(cheapest, symbol)}). Every one of those sold would cost you `
      + `${money(perTicketLoss, symbol)} before the platform fee, however many you sell. `
      + `Lower the deduction or raise that ticket price.`,
  };
}

export type AddOnMarginCheckInput = {
  /** `deduction` takes the margin out of the venue's price; `additive` adds to it. */
  marginMode: unknown;
  /** The organiser's margin per unit. */
  margin: unknown;
  /** What the venue charges per unit. */
  venuePrice: unknown;
  /** For the message, when an event has more than one add-on. */
  addOnName?: string | null;
  currencySymbol?: string;
};

/**
 * Does a deductive margin eat more than the venue's own price?
 *
 * Only ever checked in deduction mode. In additive mode the margin sits on top
 * of the venue's price and the venue is paid in full by construction, so there
 * is nothing to exceed.
 */
export function checkAddOnMarginAgainstVenuePrice(
  input: AddOnMarginCheckInput,
): DealTermIssue | null {
  if (String(input.marginMode ?? "additive") !== "deduction") return null;

  const margin = finite(input.margin);
  const venuePrice = finite(input.venuePrice);
  if (margin <= 0 || venuePrice <= 0) return null;
  if (margin <= venuePrice + 0.005) return null;

  const symbol = input.currencySymbol || "€";
  const name = String(input.addOnName || "").trim();
  return {
    key: "addon_margin_exceeds_venue_price",
    severity: "block",
    field: "addonMargin",
    message:
      `Your ${money(margin, symbol)} margin${name ? ` on ${name}` : ""} comes out of the venue's `
      + `${money(venuePrice, symbol)}, which would leave them `
      + `${money(venuePrice - margin, symbol)}. Lower the margin, raise the venue's price, or `
      + `switch this add-on to "on top of the venue's price".`,
  };
}

export type MvgRecommendationInput = {
  model: unknown;
  /** Whether the organiser has already switched Minimum Viable Group on. */
  mvgEnabled?: boolean;
  /** What the deal costs regardless of turnout, where it is known. */
  fixedCost?: unknown;
  currencySymbol?: string;
};

/** True for the two deals whose cost does not fall with turnout. */
export function isFixedCostVenueDeal(model: unknown): boolean {
  const normalized = normalizeVenueDealModel(model);
  return !!normalized && FIXED_COST_VENUE_DEALS.includes(normalized);
}

/**
 * The nudge toward MVG on a fixed-cost deal.
 *
 * Returns null once MVG is on, so the warning disappears the moment it is
 * acted on rather than nagging someone who already agreed.
 */
export function checkMvgForFixedCostDeal(
  input: MvgRecommendationInput,
): DealTermIssue | null {
  if (!isFixedCostVenueDeal(input.model)) return null;
  if (input.mvgEnabled === true) return null;

  const normalized = normalizeVenueDealModel(input.model);
  const label = normalized === "upfront_rental" ? "Upfront Rental" : "Per Room / Per Night";
  const cost = finite(input.fixedCost);
  const symbol = input.currencySymbol || "€";

  return {
    key: "fixed_cost_deal_without_mvg",
    severity: "warn",
    field: "requireMinimumParticipants",
    message:
      `${label} is owed in full whether four people come or forty`
      + (cost > 0 ? `, so you are committed to ${money(cost, symbol)} either way` : "")
      + `. Turn on a Minimum Viable Group so the event cancels and refunds cleanly `
      + `if not enough tickets sell, instead of leaving you to cover the difference.`,
  };
}

export type DealTermGuardInput =
  & Omit<TicketDeductionCheckInput, "currencySymbol">
  & Omit<MvgRecommendationInput, "currencySymbol" | "model">
  & {
    currencySymbol?: string;
    /** Every add-on configured on the event's ticket types. */
    addOns?: Array<Omit<AddOnMarginCheckInput, "currencySymbol">>;
  };

/**
 * Every term check on one event, in the order they should be shown.
 *
 * Blocks first: a publication checklist that leads with advice buries the
 * thing that actually stops the publish.
 */
export function checkDealTerms(input: DealTermGuardInput): DealTermIssue[] {
  const currencySymbol = input.currencySymbol || "€";
  const issues: DealTermIssue[] = [];

  const deduction = checkTicketDeductionAgainstPrice({
    model: input.model,
    deductionPerTicket: input.deductionPerTicket,
    ticketPrices: input.ticketPrices,
    currencySymbol,
  });
  if (deduction) issues.push(deduction);

  for (const addOn of input.addOns || []) {
    const issue = checkAddOnMarginAgainstVenuePrice({ ...addOn, currencySymbol });
    // One message per event is enough; a second identical warning on a second
    // add-on adds nothing but noise.
    if (issue && !issues.some((existing) => existing.key === issue.key)) issues.push(issue);
  }

  const mvg = checkMvgForFixedCostDeal({
    model: input.model,
    mvgEnabled: input.mvgEnabled,
    fixedCost: input.fixedCost,
    currencySymbol,
  });
  if (mvg) issues.push(mvg);

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "block" ? -1 : 1));
}

/** Only the issues that must stop a publish. */
export function blockingDealTermIssues(issues: DealTermIssue[]): DealTermIssue[] {
  return issues.filter((issue) => issue.severity === "block");
}

/**
 * The same checks, taking an experience the way the builder and the server
 * already hold one.
 *
 * Sits beside `validateExperienceVenueDeal` at both call sites rather than
 * inside it: that function is about whether a deal is *selected and usable*,
 * these are about whether its numbers can ever work out. Keeping them apart
 * means a missing deal type and an impossible deduction do not report as one
 * error.
 */
export type ExperienceDealTermsInput = {
  venueType?: unknown;
  venueTargetDeal?: unknown;
  venueTargetDealValue?: unknown;
  venueCompensationModel?: unknown;
  venueFixedFee?: unknown;
  venuePerHeadAmount?: unknown;
  venuePerRoomPerNight?: unknown;
  ticketSkus?: unknown;
  currency?: unknown;
  requireMinimumParticipants?: unknown;
  mvgEnabled?: unknown;
};

function activeDeal(input: ExperienceDealTermsInput): { model: unknown; value: unknown } {
  const venueType = String(input.venueType || "catalog");
  if (venueType === "open" || venueType === "manual") {
    return { model: input.venueTargetDeal, value: input.venueTargetDealValue };
  }
  const model = input.venueCompensationModel;
  const normalized = normalizeVenueDealModel(model);
  const value = normalized === "per_head"
    ? input.venuePerHeadAmount
    : normalized === "per_room_night"
      ? input.venuePerRoomPerNight
      : input.venueFixedFee;
  return { model, value };
}

function symbolFor(currency: unknown): string {
  const code = String(currency || "eur").trim().toLowerCase();
  return ({ usd: "$", eur: "€", gbp: "£" } as Record<string, string>)[code] || "€";
}

export function checkExperienceDealTerms(input: ExperienceDealTermsInput): DealTermIssue[] {
  const skus = Array.isArray(input.ticketSkus) ? (input.ticketSkus as any[]) : [];
  const { model, value } = activeDeal(input);

  return checkDealTerms({
    model,
    deductionPerTicket: value,
    // Free tiers are filtered out inside the check; passing every tier through
    // keeps "cheapest paid ticket" honest when the tiers are mixed.
    ticketPrices: skus.map((sku) =>
      sku?.pricingMode === "free_rsvp"
        ? 0
        : (sku?.pricePerPerson ?? sku?.suggestedPrice ?? sku?.minPrice),
    ),
    addOns: skus
      .filter((sku) => sku?.addonEnabled === true || sku?.pricingMode === "combi")
      .map((sku) => ({
        marginMode: sku?.addonMarginMode,
        margin: sku?.addonMargin,
        venuePrice: sku?.addonVenuePrice,
        addOnName: sku?.addonName,
      })),
    mvgEnabled: input.requireMinimumParticipants === true || input.mvgEnabled === true,
    fixedCost: value,
    currencySymbol: symbolFor(input.currency),
  });
}

/** Publication-blocking messages only, ready to push onto an error list. */
export function validateExperienceDealTerms(input: ExperienceDealTermsInput): string[] {
  return blockingDealTermIssues(checkExperienceDealTerms(input)).map((issue) => issue.message);
}
