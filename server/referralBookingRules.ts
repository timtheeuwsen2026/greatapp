export type ReferralBookingIdentity = {
  userId: string;
  experienceId: string;
  status: string | null;
};

const ACTIVE_REFERRAL_BOOKING_STATUSES = new Set([
  "pending",
  "deposit_authorized",
  "deposit_paid",
  "confirmed",
  "fully_paid",
]);

export function isActivePostCheckoutBooking(
  booking: ReferralBookingIdentity | null | undefined,
  userId: string,
  experienceId: string,
): boolean {
  return !!booking
    && booking.userId === userId
    && booking.experienceId === experienceId
    && ACTIVE_REFERRAL_BOOKING_STATUSES.has(String(booking.status));
}
