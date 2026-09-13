type TicketQuantityValue = number | string | null | undefined;

export type BookingTicketQuantityInput = {
  ticketQuantity?: TicketQuantityValue;
};

export function normalizeTicketQuantity(value: TicketQuantityValue): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function sumBookingTicketQuantity(
  bookings: BookingTicketQuantityInput[],
): number {
  return bookings.reduce(
    (total, booking) => total + normalizeTicketQuantity(booking.ticketQuantity),
    0,
  );
}

export function calculateTicketDeductionCents(
  fixedDeductionPerTicket: number | string | null | undefined,
  ticketQuantity: TicketQuantityValue,
): number {
  const parsedDeduction = Number(fixedDeductionPerTicket);
  if (!Number.isFinite(parsedDeduction) || parsedDeduction <= 0) return 0;

  const deductionPerTicketCents = Math.round(parsedDeduction * 100);
  return deductionPerTicketCents * normalizeTicketQuantity(ticketQuantity);
}

export function calculateTicketDeduction(
  fixedDeductionPerTicket: number | string | null | undefined,
  ticketQuantity: TicketQuantityValue,
): number {
  return calculateTicketDeductionCents(
    fixedDeductionPerTicket,
    ticketQuantity,
  ) / 100;
}

/**
 * A per-ticket deduction across a *known* number of tickets.
 *
 * Deliberately not `calculateTicketDeduction`. That one reads a single
 * booking's quantity, where a missing or malformed value means one ticket —
 * a booking row always represents at least one seat. A forecast is the
 * opposite case: the count is the answer to "how many paid tickets are there",
 * and zero is a real answer.
 *
 * Passing a forecast through the booking-shaped helper is what made a Free
 * RSVP event with a €3 ticket deduction show a venue payout of −€3. There are
 * no paid tickets, so there is nothing to deduct against, and the row should
 * read €0. The one-ticket floor turned "none" into "one".
 */
export function calculateTicketDeductionForCount(
  fixedDeductionPerTicket: number | string | null | undefined,
  ticketCount: number | string | null | undefined,
): number {
  const parsedDeduction = Number(fixedDeductionPerTicket);
  if (!Number.isFinite(parsedDeduction) || parsedDeduction <= 0) return 0;

  const parsedCount = Number(ticketCount);
  if (!Number.isFinite(parsedCount) || parsedCount <= 0) return 0;

  const deductionPerTicketCents = Math.round(parsedDeduction * 100);
  return (deductionPerTicketCents * Math.floor(parsedCount)) / 100;
}
