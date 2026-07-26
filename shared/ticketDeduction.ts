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
