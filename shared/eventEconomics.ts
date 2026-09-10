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
 * Two rules the arithmetic encodes, both from Tim:
 *
 *  1. **Ticket revenue and add-on revenue are two independent calculations
 *     that only meet at the sum.** The Venue Commercial Deal — revenue split,
 *     ticket deduction, rental, sponsorship, commitment fee — governs the
 *     ticket price and nothing else. A €4-per-ticket deduction is never
 *     charged against a coffee. The add-on runs on its own venue-price and
 *     margin mechanic regardless of which deal was picked, so adding an add-on
 *     adds no complexity to the deal-type logic.
 *
 *  2. **The platform fee applies to every pound that reaches the organiser
 *     through the platform**, not to ticket revenue alone: the add-on margin
 *     and the venue's commitment fee or sponsorship are charged the same
 *     percentage, because they move through the same rails. Two things are
 *     deliberately outside it — the venue's own price for an add-on, which is
 *     the venue's money and whose whole purpose is to match the counter price,
 *     and a rental the organiser *pays*, which is a cost rather than income.
 */

import { calculateTicketDeduction } from "./ticketDeduction";
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
};

export type EventEconomicsInput = {
  /** Gross from paid entry only. Free RSVPs are attendance, never revenue. */
  ticketGross: number;
  /** Paid tickets — the heads a per-ticket or per-head venue deal may charge for. */
  paidTickets: number;
  /** Read from platform settings, never assumed. */
  platformPct: number;
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
  /** What the venue is paying the organiser: sponsorship or commitment fee. */
  venueContribution: number;
  /** The venue's own add-on money — paid to it directly, never split. */
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
 * Add-ons are absent from every branch on purpose. That absence is rule 1.
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
    case "fixed_fee":
    case "per_head":
      return calculateTicketDeduction(value, tickets);
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
  const addOnVenueRevenue = Math.max(0, round2(finite(input.addOnVenueGross)));
  const addOnCreatorMargin = Math.max(0, round2(finite(input.addOnCreatorGross)));

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

  // ── The platform's cut, on everything that reached the organiser ─────────
  // Ticket revenue, the organiser's add-on margin and the venue's own
  // contribution all arrive through the platform, so all three are charged.
  // The venue's add-on price is not: it is the venue's money, and taking a cut
  // of it would push the participant's price above the venue's counter price,
  // which is the one thing the add-on mechanic exists to prevent.
  const platformFeeBase = round2(ticketGross + addOnCreatorMargin + venueContribution);
  const platformFee = round2(platformFeeBase * (platformPct / 100));

  const lines: EconomicsLine[] = [];

  if (ticketGross > 0 || (!addOnCreatorMargin && !venueContribution)) {
    lines.push({
      key: "ticket_gross",
      label: "Gross Ticket Revenue",
      amount: ticketGross,
      kind: "gross",
    });
  }

  if (platformFee > 0) {
    lines.push({
      key: "platform_fee",
      label: `Platform Fee (${platformPct}%)`,
      amount: -platformFee,
      kind: "fee",
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
    });
  }

  if (sponsorship > 0) {
    lines.push({
      key: "venue_sponsorship",
      label: "Venue Sponsorship",
      amount: sponsorship,
      kind: "venue",
    });
  }

  if (commitmentFee > 0) {
    lines.push({
      key: "commitment_fee",
      label: "Commitment Fee from Venue",
      amount: commitmentFee,
      kind: "venue",
    });
  }

  if (addOnCreatorMargin > 0) {
    lines.push({
      key: "addon_margin",
      label: "Your Add-on Margin",
      amount: addOnCreatorMargin,
      kind: "addon",
    });
  }

  if (promoterBounty > 0) {
    lines.push({
      key: "promoter_bounty",
      label: `Participant Cashback (${promoterCommissionPct}%)`,
      amount: -promoterBounty,
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
    venueContribution,
    addOnVenueRevenue,
    offPlatform,
  };
}
