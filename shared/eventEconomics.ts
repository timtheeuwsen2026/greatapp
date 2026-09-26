/**
 * What an organiser actually takes home from an event — as line items whose
 * sum *is* the total.
 *
 * The Grand Total Calculator used to build its rows in the markup and its
 * total in a separate expression beside them. The two drifted: an event with
 * ten €10 tickets, a €4-per-ticket venue deduction and a €1 add-on margin
 * showed four rows adding to €55 above a total reading −€30. Nobody can audit
 * a figure that does not equal the numbers printed above it, and an organiser
 * deciding whether to accept a venue's terms is reading exactly that figure.
 *
 * So the total is not computed here at all. `breakdown.net` is the sum of
 * `breakdown.lines`, by construction — a row that is not rendered cannot move
 * the total, and a row that is rendered always does.
 *
 * Venue percentage deals cover paid entry and add-on sales. The percentage
 * replaces the add-on unit cost; it is never charged on top of that cost.
 * Per-ticket deductions still apply only to paid entry. Referral commissions
 * also remain scoped to entry revenue. Percentage deals use gross platform
 * sales as the fee base, matching the existing earnings and payout engine.
 */

import { calculateTicketDeductionForCount } from "./ticketDeduction";
import {
  normalizeVenueDealModel,
  isOffPlatformVenueDeal,
  type VenueDealModel,
} from "./venueDealModels";

/** One row of the calculator. Positive is income, negative is money leaving. */
export type EconomicsLine = {
  /** Stable id, so a test or a caller can assert on a row without matching copy. */
  key: string;
  label: string;
  amount: number;
  /**
   * `gross` – what the event takes.
   * `fee` – the platform's cut.
   * `venue` – money moving between the organiser and the venue.
   * `addon` – the organiser's own margin on extras.
   * `promotion` – cashback or commission paid away.
   */
  kind: "gross" | "fee" | "venue" | "addon" | "promotion";
  /**
   * How this row settles, for the grouping the calculator renders.
   *
   * A percentage that scales with ticket sales and a flat fee agreed in
   * advance are different kinds of number, and listing them as consecutive
   * rows of a single column invites reading them as comparable.
   */
  tier: "per_unit" | "flat" | "addon";
};

export type EventEconomicsInput = {
  /** Gross from paid entry only. Free RSVPs are attendance, never revenue. */
  ticketGross: number;
  /** Paid tickets — the heads a per-ticket or per-head venue deal may charge for. */
  paidTickets: number;
  /** Read from platform settings, never assumed. */
  platformPct: number;
  /** Separate fee on gross add-on sales; omitted for legacy callers. */
  addonPlatformPct?: number;
  /** The selected Venue Commercial Deal, or null when there is no venue deal. */
  venueDealModel: VenueDealModel | string | null;
  /** The deal's headline number: a percentage, a per-ticket amount, a fee. */
  venueDealValue: number;
  /** Multi-day only: rooms multiplied by nights. */
  roomNights?: number;
  /** The one-off fee a venue pays the organiser under Commitment Fee + Rev Split. */
  commitmentFee?: number;
  /** The venue's own price for add-ons across every seat offered one. */
  addOnVenueGross?: number;
  /** The organiser's margin on add-ons across every seat offered one. */
  addOnCreatorGross?: number;
  /** Participant cashback, as a percentage of ticket revenue. */
  promoterCommissionPct?: number;
  /**
   * Partners whose deal is paid out of ticket revenue — Commission per Ticket
   * or Revenue Split — one entry each.
   *
   * The venue used to be the only party that could take a percentage, which
   * broke the case the Partners model exists for: a free outdoor location with
   * no paid venue at all, where a partner community is what actually makes the
   * event happen and deserves the cut. There may be zero of these, one, or
   * several; barter and sponsorship partners are absent by construction,
   * because they settle outside tickets entirely.
   */
  partnerShares?: Array<{ key: string; label: string; pct: number }>;
};

export type EventEconomics = {
  /** Every row to render, in order. Their amounts sum to `net`. */
  lines: EconomicsLine[];
  /** The sum of `lines`. Never computed any other way. */
  net: number;
  /** The platform's total cut, and what it was charged on. */
  platformFee: number;
  platformFeeBase: number;
  /** What the venue is owed for the tickets, under the selected deal. */
  venueTicketCost: number;
  /** What every ticket-revenue partner is owed, added together. */
  partnerTicketCost: number;
  /** What the venue is paying the organiser: sponsorship or commitment fee. */
  venueContribution: number;
  /** The venue's add-on proceeds, under the selected percentage or unit cost. */
  addOnVenueRevenue: number;
  /** True when the deal's money is settled at the venue's counter. */
  offPlatform: boolean;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * What the venue is owed out of ticket revenue under this deal, as a positive
 * cost. Deals the venue *funds* return zero here and surface as a contribution
 * instead — a payout row reading "+€50" for money the venue is paying reads as
 * the venue being paid.
 *
 * The add-on part of a percentage deal is calculated separately below.
 */
export function venueTicketCostFor(input: {
  model: VenueDealModel | string | null;
  value: number;
  ticketGross: number;
  paidTickets: number;
  roomNights?: number;
}): number {
  const model = normalizeVenueDealModel(input.model);
  if (!model || isOffPlatformVenueDeal(model)) return 0;

  const value = Math.max(0, finite(input.value));
  const gross = Math.max(0, finite(input.ticketGross));
  const tickets = Math.max(0, finite(input.paidTickets));
  const roomNights = Math.max(0, finite(input.roomNights));

  switch (model) {
    case "revenue_share":
    case "commitment_plus_revenue_share":
      return round2(gross * (value / 100));
    // "A flat amount per ticket sold, multiplied by tickets sold" — a
    // deduction rather than a single fee, which is why it scales with heads.
    //
    // Counted, never floored at one. A Free RSVP event sells no paid tickets,
    // so a €3 deduction has nothing to deduct against and the venue is owed
    // €0 — not €3, which is what the booking-shaped helper returned when it
    // read zero tickets as "at least one".
    case "fixed_fee":
    case "per_head":
      return calculateTicketDeductionForCount(value, tickets);
    case "per_room_night":
      return round2(value * roomNights);
    case "upfront_rental":
      return round2(value);
    default:
      return 0;
  }
}

/**
 * The whole picture: ticket revenue under the venue deal, add-on revenue under
 * its own mechanic, the platform's cut of everything that reached the
 * organiser, and the rows that explain all three.
 */
export function calculateEventEconomics(input: EventEconomicsInput): EventEconomics {
  const model = normalizeVenueDealModel(input.venueDealModel);
  const offPlatform = model ? isOffPlatformVenueDeal(model) : false;

  const ticketGross = Math.max(0, round2(finite(input.ticketGross)));
  const platformPct = Math.max(0, finite(input.platformPct));
  const addOnUnitCosts = Math.max(0, round2(finite(input.addOnVenueGross)));
  const addOnCreatorMargin = round2(finite(input.addOnCreatorGross));
  const addOnGross = Math.max(0, round2(addOnUnitCosts + addOnCreatorMargin));
  const sharesAddOnSales = model === "revenue_share" || model === "commitment_plus_revenue_share";
  // A percentage deal replaces the unit-cost arrangement. Charging both would
  // pay the venue twice for the same product.
  const addOnVenueRevenue = sharesAddOnSales
    ? round2(addOnGross * Math.max(0, finite(input.venueDealValue)) / 100)
    : addOnUnitCosts;

  // ── Path 1: ticket revenue, distributed per the Venue Commercial Deal ────
  const venueTicketCost = venueTicketCostFor({
    model,
    value: input.venueDealValue,
    ticketGross,
    paidTickets: input.paidTickets,
    roomNights: input.roomNights,
  });

  // Money travelling the other way: the venue paying the organiser. A
  // sponsorship and a commitment fee are the same movement under two names,
  // and both are income the platform's fee applies to.
  const sponsorship = model === "venue_sponsored"
    ? Math.max(0, round2(finite(input.venueDealValue)))
    : 0;
  const commitmentFee = model === "commitment_plus_revenue_share"
    ? Math.max(0, round2(finite(input.commitmentFee)))
    : 0;
  const venueContribution = round2(sponsorship + commitmentFee);

  const promoterCommissionPct = Math.max(0, finite(input.promoterCommissionPct));
  const promoterBounty = round2(ticketGross * (promoterCommissionPct / 100));

  // Partner cuts of ticket revenue, one row each. Only partners whose deal
  // actually pulls from tickets reach this — the caller filters on
  // `revenueShareEligible`, so a barter partner can never appear here and can
  // never reduce the organiser's ticket net.
  const partnerRows = (Array.isArray(input.partnerShares) ? input.partnerShares : [])
    .map((share) => ({
      key: String(share?.key || "partner"),
      label: String(share?.label || "Partner"),
      pct: Math.max(0, finite(share?.pct)),
    }))
    .filter((share) => share.pct > 0)
    .map((share) => ({ ...share, amount: round2(ticketGross * (share.pct / 100)) }))
    .filter((share) => share.amount > 0);
  const partnerTicketCost = round2(partnerRows.reduce((total, share) => total + share.amount, 0));

  // Percentage deals use the full sale, as the payment engine does. Other
  // add-on arrangements keep their existing unit-cost/margin calculation.
  const separateAddonFee = input.addonPlatformPct !== undefined;
  const addonFeeBase = separateAddonFee || sharesAddOnSales ? addOnGross : addOnCreatorMargin;
  const platformFeeBase = Math.max(0, round2(ticketGross + addonFeeBase + venueContribution));
  const ticketPlatformFee = round2((ticketGross + venueContribution) * platformPct / 100);
  const addonPlatformPct = separateAddonFee ? Math.max(0, finite(input.addonPlatformPct)) : platformPct;
  const addonPlatformFee = round2(Math.max(0, addonFeeBase) * addonPlatformPct / 100);
  const platformFee = separateAddonFee
    ? round2(ticketPlatformFee + addonPlatformFee)
    : round2(platformFeeBase * platformPct / 100);

  const lines: EconomicsLine[] = [];

  if (ticketGross > 0 || !venueContribution) {
    lines.push({
      key: "ticket_gross",
      label: "Gross Ticket Revenue",
      amount: ticketGross,
      kind: "gross",
      tier: "per_unit",
    });
  }

  if ((separateAddonFee ? ticketPlatformFee : platformFee) > 0) {
    lines.push({
      key: "platform_fee",
      label: `${separateAddonFee ? "Platform Fee on Tickets" : "Platform Fee"} (${platformPct}%)`,
      amount: -(separateAddonFee ? ticketPlatformFee : platformFee),
      kind: "fee",
      tier: "per_unit",
    });
  }

  if (venueTicketCost > 0 && !offPlatform) {
    lines.push({
      key: "venue_payout",
      label: model === "commitment_plus_revenue_share"
        ? `Venue Revenue Share (${Math.max(0, finite(input.venueDealValue))}%)`
        : "Venue Payout",
      amount: -venueTicketCost,
      kind: "venue",
      // A rental is agreed up front; a share moves with the tickets.
      tier: model === "upfront_rental" ? "flat" : "per_unit",
    });
  }

  if (sponsorship > 0) {
    lines.push({
      key: "venue_sponsorship",
      label: "Venue Sponsorship",
      amount: sponsorship,
      kind: "venue",
      tier: "flat",
    });
  }

  if (commitmentFee > 0) {
    lines.push({
      key: "commitment_fee",
      label: "Commitment Fee from Venue",
      amount: commitmentFee,
      kind: "venue",
      tier: "flat",
    });
  }

  if (addOnGross > 0) {
    lines.push({
      key: "addon_gross",
      label: "Gross Add-on Revenue",
      amount: addOnGross,
      kind: "gross",
      tier: "addon",
    });
  }
  if (separateAddonFee && addOnGross > 0) {
    lines.push({ key: "addon_platform_fee", label: `Platform Fee on Add-ons (${addonPlatformPct}%)`,
      amount: -addonPlatformFee, kind: "fee", tier: "addon" });
  }
  if (addOnVenueRevenue > 0) {
    lines.push({
      key: "addon_venue_payout",
      label: sharesAddOnSales
        ? `Venue Share of Add-ons (${Math.max(0, finite(input.venueDealValue))}%)`
        : "Venue Add-on Cost",
      amount: -addOnVenueRevenue,
      kind: "venue",
      tier: "addon",
    });
  }

  for (const share of partnerRows) {
    lines.push({
      key: `partner_share_${share.key}`,
      label: `${share.label} (${share.pct}%)`,
      amount: -share.amount,
      kind: "promotion",
      tier: "per_unit",
    });
  }

  if (promoterBounty > 0) {
    lines.push({
      key: "promoter_bounty",
      label: `Participant Cashback (${promoterCommissionPct}%)`,
      amount: -promoterBounty,
      tier: "per_unit",
      kind: "promotion",
    });
  }

  // The total, and the only definition of it: what the rows above add up to.
  const net = round2(lines.reduce((total, line) => total + line.amount, 0));

  return {
    lines,
    net,
    platformFee,
    platformFeeBase,
    venueTicketCost: offPlatform ? 0 : venueTicketCost,
    partnerTicketCost,
    venueContribution,
    addOnVenueRevenue,
    offPlatform,
  };
}

/**
 * The same event at a different turnout.
 *
 * Everything that scales with heads is scaled; everything agreed in advance —
 * a rental, a commitment fee, a room-night bill on rooms you hold whether they
 * fill or not — is left exactly as it is. That division is the whole point:
 * it is what makes a break-even number mean something.
 */
export function economicsAtAttendance(
  input: EventEconomicsInput,
  /** Heads the figures in `input` describe. Usually full capacity. */
  atCapacity: number,
  /** Heads to re-state them at. */
  heads: number,
): EventEconomics {
  const capacity = Math.max(1, finite(atCapacity));
  const scale = Math.max(0, finite(heads)) / capacity;

  return calculateEventEconomics({
    ...input,
    ticketGross: round2(finite(input.ticketGross) * scale),
    paidTickets: Math.round(finite(input.paidTickets) * scale),
    addOnVenueGross: round2(finite(input.addOnVenueGross) * scale),
    addOnCreatorGross: round2(finite(input.addOnCreatorGross) * scale),
  });
}

/**
 * How many people have to come before the organiser stops losing money.
 *
 * Found by asking the calculator itself rather than by solving an equation
 * beside it. Every deal type bends the curve differently — a rental is flat, a
 * per-ticket deduction is linear, a commitment fee is a lump the other way —
 * and a closed-form answer would have to know about all of them and would go
 * out of date the first time a deal type was added. Walking the same function
 * the rows are drawn from cannot disagree with them.
 *
 * Returns null when the event never breaks even within its own capacity, and 0
 * when it is already above water with nobody there at all (a venue
 * sponsorship, typically).
 */
export function findBreakEvenAttendance(
  input: EventEconomicsInput,
  atCapacity: number,
): number | null {
  const capacity = Math.max(1, Math.round(finite(atCapacity)));
  if (economicsAtAttendance(input, capacity, 0).net >= 0) return 0;

  for (let heads = 1; heads <= capacity; heads += 1) {
    if (economicsAtAttendance(input, capacity, heads).net >= 0) return heads;
  }
  return null;
}

/**
 * What this event would net with every ticket free, at a given turnout.
 *
 * The comparison an organiser actually wants and could never get: a free RSVP
 * with a paid add-on still owes the venue its agreed share of add-on sales.
 * Only entry revenue is removed, so both figures describe the same event
 * under different entry-price policies.
 */
export function economicsAsFreeRsvp(
  input: EventEconomicsInput,
  atCapacity: number,
  heads: number,
): EventEconomics {
  return economicsAtAttendance(
    { ...input, ticketGross: 0, paidTickets: 0 },
    atCapacity,
    heads,
  );
}
