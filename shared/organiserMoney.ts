/**
 * The organiser's numbers, defined once (Tim, 27 Nov, point 5): Overview, the
 * event card, the Orders page, Money and Community all read these rules, so
 * they can never contradict each other.
 *
 * A booking COUNTS when it is paid (deposit paid, confirmed or fully paid),
 * not cancelled or refunded, not disputed, and not a test payment. A test
 * payment is a booking by an account marked as a test account: it is never
 * paid out, so it is never in the money either. Screens that list orders show
 * it with a "Test" label and say it is not counted.
 *
 * The money of an event is in one of two states:
 *  - Confirmed: paid, and the group is reached (no minimum, the minimum is
 *    met, or the event has started and was not cancelled).
 *  - Held until the minimum is reached: paid, waiting for the minimum. If the
 *    minimum is not reached by the deadline, every buyer is refunded.
 * A cancelled event has neither: its bookings are refunded.
 */

import { eventPhase, type EventTimeLike } from "./eventTime";

export const PAID_BOOKING_STATUSES = ["deposit_paid", "confirmed", "fully_paid"] as const;
const PAID = new Set<string>(PAID_BOOKING_STATUSES);

export type CountableBooking = {
  status?: string | null;
  cancelledAt?: unknown;
  testPayment?: boolean | null;
  disputedAt?: unknown;
};

/** True when a booking is a real, paid booking that still stands. */
export function countsAsBooked(booking: CountableBooking | null | undefined): boolean {
  if (!booking) return false;
  if (!PAID.has(String(booking.status ?? ""))) return false;
  if (booking.cancelledAt) return false;
  if (booking.testPayment || booking.disputedAt) return false;
  return true;
}

/** A paid booking left out only because it is a test payment. */
export function isCountedTestBooking(booking: CountableBooking | null | undefined): boolean {
  return !!booking?.testPayment && countsAsBooked({ ...booking, testPayment: false });
}

export type MoneyState = "confirmed" | "held" | "cancelled";

export type MoneyStateEvent = EventTimeLike & {
  status?: string | null;
  requireMinimumParticipants?: boolean | null;
  mvgStatus?: string | null;
};

/** Which state the money of one event is in. */
export function eventMoneyState(event: MoneyStateEvent, now: Date = new Date()): MoneyState {
  if (event.status === "cancelled" || event.mvgStatus === "failed") return "cancelled";
  if (!event.requireMinimumParticipants || event.mvgStatus === "met") return "confirmed";
  // Past the start the deadline has passed: an event that was not cancelled goes ahead.
  const phase = eventPhase(event, now);
  if (phase === "happening" || phase === "ended") return "confirmed";
  return "held";
}

export const MONEY_STATE_LABEL: Record<MoneyState, string> = {
  confirmed: "Confirmed",
  held: "Held until minimum reached",
  cancelled: "Cancelled, refunded",
};

/** One line under each state, the same words on every screen. */
export const MONEY_STATE_HINT: Record<Exclude<MoneyState, "cancelled">, string> = {
  confirmed: "Paid, and the group is reached.",
  held: "Paid, waiting for the minimum. Refunded automatically if it is not reached by the deadline.",
};

export type MoneySplit = {
  /** Paid bookings that count. */
  bookings: number;
  /** Tickets in them (a booking can hold several). */
  tickets: number;
  /** What buyers paid: tickets plus add-ons. */
  revenue: number;
  ticketSales: number;
  addonSales: number;
  platformFee: number;
  venueShare: number;
  partnerCommission: number;
  /** Revenue minus platform fee, venue share and partner commission. */
  yourShare: number;
};

export const EMPTY_SPLIT: MoneySplit = {
  bookings: 0,
  tickets: 0,
  revenue: 0,
  ticketSales: 0,
  addonSales: 0,
  platformFee: 0,
  venueShare: 0,
  partnerCommission: 0,
  yourShare: 0,
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function addSplits(a: MoneySplit, b: MoneySplit): MoneySplit {
  return {
    bookings: a.bookings + b.bookings,
    tickets: a.tickets + b.tickets,
    revenue: round2(a.revenue + b.revenue),
    ticketSales: round2(a.ticketSales + b.ticketSales),
    addonSales: round2(a.addonSales + b.addonSales),
    platformFee: round2(a.platformFee + b.platformFee),
    venueShare: round2(a.venueShare + b.venueShare),
    partnerCommission: round2(a.partnerCommission + b.partnerCommission),
    yourShare: round2(a.yourShare + b.yourShare),
  };
}

export type OrganiserEventMoney = MoneySplit & {
  experienceId: string;
  title: string;
  state: MoneyState;
  /** Upcoming, happening now or ended, from the start and end time. */
  phase: "upcoming" | "happening" | "ended" | null;
  minimum: number | null;
  capacity: number | null;
  /** People coming: tickets in counted bookings, free RSVPs included. */
  people: number;
  /** Add-ons in counted bookings, by name. */
  addons: Array<{ name: string; quantity: number }>;
  /** Paid bookings left out because they are test payments. */
  testBookings: number;
};

export type OrganiserMoney = {
  currency: string;
  confirmed: MoneySplit;
  held: MoneySplit;
  /** Confirmed plus held. */
  all: MoneySplit;
  /** Your share of confirmed plus held: what you expect to be paid. */
  expectedShare: number;
  /** Live events still to come (not cancelled, not ended). */
  upcomingEvents: number;
  /** People booked on those upcoming events. */
  peopleComing: number;
  testBookings: number;
  events: OrganiserEventMoney[];
};
