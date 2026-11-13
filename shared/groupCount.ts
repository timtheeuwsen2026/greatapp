import { DEFAULT_TIME_ZONE, formatInZone } from "./eventTime";
// Who counts towards a minimum group.
//
// Every paid booking is now charged at checkout, so a place in the group is a
// booking that is paid (`fully_paid`, `deposit_paid`, `confirmed`) as well as
// one still settling (`pending`, `deposit_authorized`). Counting only
// `confirmed` and `pending`, as the checkout did when cards were held, would
// leave every immediately-charged ticket out of the group.

export const GROUP_COUNTED_STATUSES = ["pending", "deposit_authorized", "deposit_paid", "confirmed", "fully_paid"] as const;
export const PAID_BOOKING_STATUSES = ["deposit_paid", "confirmed", "fully_paid"] as const;

type CountedBooking = { status?: string | null; cancelledAt?: Date | string | null };

export function countsTowardsGroup(booking: CountedBooking): boolean {
  return !booking.cancelledAt && (GROUP_COUNTED_STATUSES as readonly string[]).includes(String(booking.status));
}

export function isPaidBooking(booking: CountedBooking): boolean {
  return !booking.cancelledAt && (PAID_BOOKING_STATUSES as readonly string[]).includes(String(booking.status));
}

/**
 * What a buyer is told about a minimum-group event, at checkout and in the
 * confirmation email. Tim's wording (Nov 2026), now that every ticket is
 * charged at checkout instead of held.
 */
export function groupPaymentPromise(mvgMin: number | null | undefined, deadline: Date | string | null | undefined): string {
  const people = Math.max(1, Number(mvgMin) || 1);
  const parsed = deadline ? new Date(deadline) : null;
  const by = parsed && !Number.isNaN(parsed.getTime())
    ? ` by ${formatInZone(parsed, DEFAULT_TIME_ZONE, { weekday: false })}`
    : "";
  return `You pay now. This event goes ahead once at least ${people} people have booked${by}. If it doesn't, you'll automatically get a full refund.`;
}

