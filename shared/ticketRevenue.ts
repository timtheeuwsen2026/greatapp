/**
 * What an event's tickets are worth, and how many of them a venue deal applies to.
 *
 * Two rules drive everything here, and both came from real proposals going out wrong:
 *
 *  1. **Free tickets are not revenue and are not a chargeable head.** An event
 *     with 32 free RSVPs and 32 paid tickets had its per-ticket venue deduction
 *     applied across all 64, so a €4 deduction quoted €256 against an event that
 *     had only ever sold €160 of tickets. Capacity for a deduction or a per-head
 *     fee therefore counts paid tickets only.
 *
 *  2. **Add-on money is never part of ticket revenue.** An add-on is the venue's
 *     own product resold through the platform at a rate the venue already
 *     discounted for the collaboration — the venue is paid for it directly. Rolling
 *     it into the gross a revenue split is taken from pays the venue for the same
 *     coffee twice. It is reported on its own line instead.
 *
 * The Event Builder used to hold private copies of this arithmetic, which is how
 * the two diverged from the ticket-level subtotals shown beside them.
 */

import { safeAdd, safeMultiply } from "./pricingService";
import { getTicketAddon, type TicketAddonSkuLike } from "./ticketAddons";

export type RevenueSkuLike = TicketAddonSkuLike & {
  pricePerPerson?: number | string | null;
  suggestedPrice?: number | string | null;
  minPrice?: number | string | null;
  ticketCapacity?: number | string | null;
};

/** The builder reads these from text inputs, so strings and blanks are normal. */
export function toTicketNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * What one attendee pays to get in — entry only.
 *
 * A combi's add-on is deliberately absent: entry is what the venue deal is
 * calculated against, and on most run-club events entry is free while the add-on
 * carries all the money.
 */
export function getSkuEntryPrice(sku: RevenueSkuLike | null | undefined): number {
  switch (sku?.pricingMode) {
    case "free_rsvp": return 0;
    // Pay-what-you-want has no fixed price, so an estimate has to assume the
    // amount the buyer is shown by default.
    case "pwyw": return toTicketNumber(sku.suggestedPrice ?? sku.minPrice);
    case "combi": return toTicketNumber(sku.pricePerPerson);
    default: return toTicketNumber(sku?.pricePerPerson);
  }
}

/**
 * A single ticket with no capacity of its own covers the whole event: a creator
 * who sets 20 spots on the Dates step and adds one €1,000 ticket means 20 ×
 * €1,000, not zero. A *second* ticket left blank must not absorb the event total
 * a second time.
 */
export function getSkuCapacity(
  sku: RevenueSkuLike | null | undefined,
  skuCount: number,
  maxParticipants: unknown,
): number {
  const own = toTicketNumber(sku?.ticketCapacity);
  if (own > 0) return own;
  return skuCount === 1 ? toTicketNumber(maxParticipants) : 0;
}

export type TicketRevenueSummary = {
  /** Gross from entry alone, free tickets contributing nothing. */
  ticketGross: number;
  /** Heads a per-ticket or per-head venue deal may charge for — paid tickets only. */
  paidCapacity: number;
  /** Everyone expected, free RSVPs included. Attendance, never money. */
  totalCapacity: number;
  /** Add-on money if every seat took the extra. Reported apart from ticketGross. */
  addOnGross: number;
  /** Of that, the venue's own price for the item. */
  addOnVenueGross: number;
  /** Of that, the organiser's flat margin — their earnings, not the venue's. */
  addOnCreatorGross: number;
  /** Seats offered an add-on at all. */
  addOnCapacity: number;
  /** True once any ticket is free — the case the old maths got wrong. */
  hasFreeTickets: boolean;
};

const EMPTY: TicketRevenueSummary = {
  ticketGross: 0,
  paidCapacity: 0,
  totalCapacity: 0,
  addOnGross: 0,
  addOnVenueGross: 0,
  addOnCreatorGross: 0,
  addOnCapacity: 0,
  hasFreeTickets: false,
};

/**
 * The one place ticket money is added up. Venue deal estimates read `ticketGross`
 * and `paidCapacity` from here; nothing that feeds a venue deal may read
 * `addOnGross`.
 */
export function summariseTicketRevenue(
  skus: RevenueSkuLike[] | null | undefined,
  maxParticipants: unknown = 0,
): TicketRevenueSummary {
  if (!Array.isArray(skus) || skus.length === 0) return { ...EMPTY };

  return skus.reduce<TicketRevenueSummary>((summary, sku) => {
    const capacity = getSkuCapacity(sku, skus.length, maxParticipants);
    const entryPrice = getSkuEntryPrice(sku);
    const addon = getTicketAddon(sku);

    return {
      ticketGross: safeAdd(summary.ticketGross, safeMultiply(entryPrice, capacity)),
      paidCapacity: entryPrice > 0 ? summary.paidCapacity + capacity : summary.paidCapacity,
      totalCapacity: summary.totalCapacity + capacity,
      addOnGross: addon
        ? safeAdd(summary.addOnGross, safeMultiply(addon.unitPrice, capacity))
        : summary.addOnGross,
      addOnVenueGross: addon
        ? safeAdd(summary.addOnVenueGross, safeMultiply(addon.venueAmount, capacity))
        : summary.addOnVenueGross,
      addOnCreatorGross: addon
        ? safeAdd(summary.addOnCreatorGross, safeMultiply(addon.creatorAmount, capacity))
        : summary.addOnCreatorGross,
      addOnCapacity: addon ? summary.addOnCapacity + capacity : summary.addOnCapacity,
      hasFreeTickets: summary.hasFreeTickets || (capacity > 0 && entryPrice <= 0),
    };
  }, { ...EMPTY });
}
