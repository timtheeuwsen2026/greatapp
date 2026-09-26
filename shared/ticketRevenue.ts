import { getTicketAddons } from "./addonChoices";
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
 *  2. Add-on sales are reported separately from entry. Percentage venue deals
 *     can apply to both; a per-ticket fee must never count a coffee as entry.
 *
 * The Event Builder used to hold private copies of this arithmetic, which is how
 * the two diverged from the ticket-level subtotals shown beside them.
 */

import { safeAdd, safeMultiply } from "./pricingService";
import { type TicketAddonSkuLike } from "./ticketAddons";

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
 * A combi's add-on is deliberately absent from entry revenue. It gets a
 * separate line so per-ticket fees and referral commissions cannot charge it.
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
 * Entry and add-on estimates remain separate so callers can apply each deal
 * to its correct base. Optional add-on inventory caps the estimated sales.
 */
export function summariseTicketRevenue(
  skus: RevenueSkuLike[] | null | undefined,
  maxParticipants: unknown = 0,
): TicketRevenueSummary {
  if (!Array.isArray(skus) || skus.length === 0) return { ...EMPTY };

  return skus.reduce<TicketRevenueSummary>((summary, sku) => {
    const capacity = getSkuCapacity(sku, skus.length, maxParticipants);
    const entryPrice = getSkuEntryPrice(sku);
    const addons = getTicketAddons(sku).map(addon => ({ ...addon,
      capacity: addon.inventory > 0 ? Math.min(capacity, addon.inventory) : capacity }));
    const addonGross = addons.reduce((sum, addon) => safeAdd(sum, safeMultiply(addon.unitPrice, addon.capacity)), 0);
    const addonVenueGross = addons.reduce((sum, addon) => safeAdd(sum, safeMultiply(addon.venueAmount, addon.capacity)), 0);
    const addonCreatorGross = addons.reduce((sum, addon) => safeAdd(sum, safeMultiply(addon.creatorAmount, addon.capacity)), 0);

    return {
      ticketGross: safeAdd(summary.ticketGross, safeMultiply(entryPrice, capacity)),
      paidCapacity: entryPrice > 0 ? summary.paidCapacity + capacity : summary.paidCapacity,
      totalCapacity: summary.totalCapacity + capacity,
      addOnGross: safeAdd(summary.addOnGross, addonGross),
      addOnVenueGross: safeAdd(summary.addOnVenueGross, addonVenueGross),
      addOnCreatorGross: safeAdd(summary.addOnCreatorGross, addonCreatorGross),
      addOnCapacity: summary.addOnCapacity + addons.reduce((sum, addon) => sum + addon.capacity, 0),
      hasFreeTickets: summary.hasFreeTickets || (capacity > 0 && entryPrice <= 0),
    };
  }, { ...EMPTY });
}

/**
 * Has the organiser priced anything at all?
 *
 * Asked before offering a deal that takes a percentage of ticket revenue. On
 * an event whose tickets are all Free RSVP there is no ticket revenue to take
 * a percentage of, so a Revenue Split or a Commission per Ticket is a share of
 * nothing — offered anyway, it reads as income the event will never produce.
 *
 * Deliberately false only once tickets exist: an organiser who has not reached
 * the Pricing step yet has configured nothing, and hiding a deal type from
 * them because of that would punish working in a different order.
 */
export function hasPaidTicketConfigured(skus: RevenueSkuLike[] | null | undefined): boolean {
  if (!Array.isArray(skus) || skus.length === 0) return true;
  return skus.some((sku) => getSkuEntryPrice(sku) > 0);
}
