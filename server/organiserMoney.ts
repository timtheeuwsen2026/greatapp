import { summarizeCreatorEarnings, type EarningsBookingInput } from "./creatorEarnings";
import { orderAddons } from "@shared/eventOrders";
import { eventPhase } from "@shared/eventTime";
import {
  EMPTY_SPLIT,
  addSplits,
  countsAsBooked,
  eventMoneyState,
  isCountedTestBooking,
  type MoneySplit,
  type OrganiserEventMoney,
  type OrganiserMoney,
} from "@shared/organiserMoney";

type EventRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  currency?: string | null;
  startDate?: unknown;
  endDate?: unknown;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  city?: string | null;
  archivedAt?: unknown;
  requireMinimumParticipants?: boolean | null;
  minimumParticipants?: number | null;
  mvgStatus?: string | null;
  maxParticipants?: number | null;
};

type BookingRow = EarningsBookingInput & {
  experienceId?: string | null;
  cancelledAt?: unknown;
  addonName?: string | null;
  addonQuantity?: number | null;
};

const LIVE_STATUSES = new Set(["approved", "published", "live", "confirmed", "active"]);

/**
 * The organiser's numbers for every event, from the same per-booking split as
 * the payout (summarizeCreatorEarnings), with one rule for which bookings
 * count (@shared/organiserMoney). Overview, Money, the Orders page, the event
 * card and Community all read this.
 */
export function summariseOrganiserMoney(
  events: EventRow[],
  bookings: BookingRow[],
  options: { defaultPlatformFeePct: number; now?: Date },
): OrganiserMoney {
  const now = options.now ?? new Date();
  const byEvent = new Map<string, BookingRow[]>();
  for (const booking of bookings) {
    const id = String(booking.experienceId ?? booking.experience?.id ?? "");
    if (!id) continue;
    const list = byEvent.get(id) ?? [];
    list.push(booking);
    byEvent.set(id, list);
  }

  const currencies = new Map<string, number>();
  const rows: OrganiserEventMoney[] = [];
  let confirmed: MoneySplit = { ...EMPTY_SPLIT };
  let held: MoneySplit = { ...EMPTY_SPLIT };
  let upcomingEvents = 0;
  let peopleComing = 0;
  let testBookings = 0;

  for (const event of events) {
    const eventBookings = byEvent.get(event.id) ?? [];
    const counted = eventBookings.filter((booking) => countsAsBooked(booking as any));
    const { summary } = summarizeCreatorEarnings(counted, { defaultPlatformFeePct: options.defaultPlatformFeePct });
    const tickets = counted.reduce((sum, booking) => sum + Math.max(1, Number(booking.ticketQuantity) || 1), 0);
    const split: MoneySplit = {
      bookings: summary.bookingsCount,
      tickets: counted
        .filter((booking) => Number(booking.totalPrice) > 0)
        .reduce((sum, booking) => sum + Math.max(1, Number(booking.ticketQuantity) || 1), 0),
      revenue: summary.totalGross,
      ticketSales: summary.totalTicketSales,
      addonSales: Math.round((summary.totalGross - summary.totalTicketSales) * 100) / 100,
      platformFee: summary.totalPlatformFees,
      venueShare: summary.totalSpaceShare,
      partnerCommission: summary.totalPartnerCommission,
      yourShare: summary.totalEarnings,
    };
    const addons = new Map<string, number>();
    for (const booking of counted) {
      for (const addon of orderAddons(booking as any)) {
        addons.set(addon.name, (addons.get(addon.name) ?? 0) + addon.quantity);
      }
    }
    const state = eventMoneyState(event as any, now);
    const phase = eventPhase(event as any, now);
    const tests = eventBookings.filter((booking) => isCountedTestBooking(booking as any)).length;
    testBookings += tests;

    if (state === "confirmed") confirmed = addSplits(confirmed, split);
    if (state === "held") held = addSplits(held, split);
    if (split.revenue > 0) {
      const currency = String(event.currency || "eur").toLowerCase();
      currencies.set(currency, (currencies.get(currency) ?? 0) + split.revenue);
    }
    const live = state !== "cancelled" && !event.archivedAt && LIVE_STATUSES.has(String(event.status ?? ""));
    if (live && phase !== "ended") {
      upcomingEvents += 1;
      peopleComing += tickets;
    }

    rows.push({
      ...split,
      experienceId: event.id,
      title: event.title ?? "",
      state,
      phase,
      minimum: event.requireMinimumParticipants ? Number(event.minimumParticipants) || null : null,
      capacity: Number(event.maxParticipants) || null,
      people: tickets,
      addons: Array.from(addons.entries()).map(([name, quantity]) => ({ name, quantity })),
      testBookings: tests,
    });
  }

  const all = addSplits(confirmed, held);
  return {
    currency: Array.from(currencies.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "eur",
    confirmed,
    held,
    all,
    expectedShare: all.yourShare,
    upcomingEvents,
    peopleComing,
    testBookings,
    events: rows,
  };
}
