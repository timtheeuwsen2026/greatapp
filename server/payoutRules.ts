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
