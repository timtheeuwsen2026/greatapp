import { normalizeTicketQuantity } from "./ticketDeduction";

type Ticket = {
  id?: string | null;
  sourceRoomId?: string | null;
  ticketName?: string | null;
  ticketCapacity?: number | string | null;
};
type Registration = {
  ticketSkuId?: string | null;
  ticketName?: string | null;
  ticketQuantity?: number | string | null;
  status?: string | null;
  cancelledAt?: unknown;
};
type CapacityEvent = { maxParticipants?: number | string | null; ticketSkus?: unknown };

export function ticketId(ticket: Ticket, index: number): string {
  return String(ticket.id || ticket.sourceRoomId || `ticket-${index}`);
}

function capacityNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

/** Ticket capacities define the event total once every ticket has a capacity. */
export function ticketCapacityTotal(tickets: unknown): number | null {
  if (!Array.isArray(tickets) || !tickets.length) return null;
  const capacities = tickets.map((ticket) => capacityNumber(ticket?.ticketCapacity));
  return capacities.every((capacity) => capacity !== null)
    ? capacities.reduce<number>((sum, capacity) => sum + capacity!, 0)
    : null;
}

export function eventCapacity(event: CapacityEvent): number | null {
  return ticketCapacityTotal(event.ticketSkus) ?? capacityNumber(event.maxParticipants);
}

export function withTicketCapacity<T extends CapacityEvent>(event: T): T {
  const total = ticketCapacityTotal(event.ticketSkus);
  return total === null ? event : { ...event, maxParticipants: total };
}

export function isActiveRegistration(booking: Registration): boolean {
  return !booking.cancelledAt && [
    "pending", "deposit_authorized", "deposit_paid", "confirmed", "fully_paid",
  ].includes(booking.status || "");
}

export type TicketRegistrationCount = {
  ticketSkuId: string | null;
  ticketName: string;
  capacity: number | null;
  registered: number;
  remaining: number | null;
};

/** Count people (including group bookings), preserving unassigned legacy seats. */
export function ticketRegistrationCounts(
  ticketSkus: unknown,
  bookings: Registration[],
): TicketRegistrationCount[] {
  const tickets: Ticket[] = Array.isArray(ticketSkus) ? ticketSkus : [];
  const rows: TicketRegistrationCount[] = tickets.map((ticket, index) => ({
    ticketSkuId: ticketId(ticket, index),
    ticketName: ticket.ticketName || `Ticket ${index + 1}`,
    capacity: capacityNumber(ticket.ticketCapacity),
    registered: 0,
    remaining: null,
  }));
  const byId = new Map(rows.map((row) => [row.ticketSkuId, row]));
  const unassigned: TicketRegistrationCount = {
    ticketSkuId: null, ticketName: "Unassigned / previous ticket types",
    capacity: null, registered: 0, remaining: null,
  };
  for (const booking of bookings.filter(isActiveRegistration)) {
    const row = byId.get(booking.ticketSkuId || "") ?? unassigned;
    row.registered += normalizeTicketQuantity(booking.ticketQuantity);
  }
  for (const row of rows) {
    row.remaining = row.capacity === null ? null : Math.max(0, row.capacity - row.registered);
  }
  if (unassigned.registered) rows.push(unassigned);
  return rows;
}

export function availableBookingQuantity(
  event: CapacityEvent,
  bookings: Registration[],
  selectedTicketId: string | null,
): number | null {
  const capacity = eventCapacity(event);
  const registered = bookings.filter(isActiveRegistration)
    .reduce((sum, booking) => sum + normalizeTicketQuantity(booking.ticketQuantity), 0);
  const eventRemaining = capacity === null ? null : Math.max(0, capacity - registered);
  const ticketRemaining = ticketRegistrationCounts(event.ticketSkus, bookings)
    .find((row) => row.ticketSkuId === selectedTicketId)?.remaining ?? null;
  if (eventRemaining === null) return ticketRemaining;
  if (ticketRemaining === null) return eventRemaining;
  return Math.min(eventRemaining, ticketRemaining);
}

export class BookingCapacityError extends Error {
  constructor(public availableTickets: number) {
    super(`Only ${availableTickets} ticket(s) remain`);
    this.name = "BookingCapacityError";
  }
}
