import { venuePricedAddonCents } from "@shared/addonChoices";

export type PayoutEligibilityInput = {
  requireMinimumParticipants?: boolean | null;
  mvgEnabled?: boolean | null;
  mvgStatus?: string | null;
};

type MoneyValue = string | number | null | undefined;

export type BookingPayoutGrossInput = {
  amount?: MoneyValue;
  totalPrice?: MoneyValue;
  isDepositOnly?: boolean | null;
  balancePaid?: boolean | null;
};

function positiveMoney(value: MoneyValue): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isExperiencePayoutEligible(experience: PayoutEligibilityInput): boolean {
  const requiresMvg = !!(experience.requireMinimumParticipants || experience.mvgEnabled);
  return !requiresMvg || experience.mvgStatus === "met";
}

export function resolvePayoutGrossCents(
  bookingGrossCents: number,
  presetGrossCents: number,
  additionalGrossCents: number,
): number {
  return Math.max(0, bookingGrossCents > 0 ? bookingGrossCents : presetGrossCents)
    + Math.max(0, additionalGrossCents);
}

export function resolveBookingPayoutGrossCents(booking: BookingPayoutGrossInput): number {
  const collectedAmount = positiveMoney(booking.amount) ?? 0;
  const fullTicketPrice = positiveMoney(booking.totalPrice);

  if (booking.isDepositOnly && booking.balancePaid !== true) {
    return Math.round(collectedAmount * 100);
  }

  return Math.round((fullTicketPrice ?? collectedAmount) * 100);
}

export function sumBookingPayoutGrossCents(bookings: BookingPayoutGrossInput[]): number {
  return bookings.reduce((sum, booking) => sum + resolveBookingPayoutGrossCents(booking), 0);
}

/**
 * Add-on money priced from a venue's own discount, across an event's bookings.
 *
 * `venueCents` is the venue's discounted price for every unit sold, which it is
 * paid whole whatever else the event's deal says; `grossCents` is what those
 * units were sold for, which is therefore not shared out a second time as
 * revenue. Scaled to what has actually been collected, the same way the payout
 * gross is, so a deposit-only booking cannot reserve more than it has paid in.
 */
export function sumVenuePricedAddonCents(
  bookings: Array<BookingPayoutGrossInput & { addonItems?: unknown }>,
): { grossCents: number; venueCents: number } {
  return bookings.reduce((sum, booking) => {
    const priced = venuePricedAddonCents(booking.addonItems);
    if (priced.gross <= 0) return sum;
    const fullCents = Math.round((positiveMoney(booking.totalPrice) ?? positiveMoney(booking.amount) ?? 0) * 100);
    const collectedCents = resolveBookingPayoutGrossCents(booking);
    const scale = fullCents > 0 ? Math.min(1, collectedCents / fullCents) : 0;
    return {
      grossCents: sum.grossCents + Math.round(priced.gross * scale),
      venueCents: sum.venueCents + Math.round(priced.venue * scale),
    };
  }, { grossCents: 0, venueCents: 0 });
}
