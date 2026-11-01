/**
 * What has sold for the events at a venue, as the venue needs to see it.
 *
 * Venues were asking the organiser for numbers a minute before the doors
 * opened. Per event this gives the headcount to expect (paid tickets plus free
 * RSVPs and held cards that are still going ahead), how many have checked in,
 * and each add-on the venue has to prepare, with what the venue earns from it.
 * No attendee names: a venue needs quantities, not a guest list.
 */

export type VenueSalesBooking = {
  experienceId: string;
  status: string | null;
  ticketQuantity: number | null;
  attendanceStatus?: string | null;
  cancelledAt?: string | Date | null;
  addonItems?: Array<{ id?: string; name?: string; quantity?: number; venueAmount?: number; total?: number }> | null;
  addonName?: string | null;
  addonQuantity?: number | null;
};

export type VenueSalesEvent = {
  id: string;
  title: string | null;
  slug?: string | null;
  startDate: string | Date | null;
  status: string | null;
  currency?: string | null;
  standingCapacity?: number | null;
  seatedCapacity?: number | null;
  maxParticipants?: number | null;
  venueName?: string | null;
};

export type VenueSalesAddon = { name: string; quantity: number; venueEarned: number };

export type VenueEventSales = {
  experienceId: string;
  slugOrId: string;
  title: string;
  venueName: string | null;
  startDate: string | null;
  /** upcoming, past, or cancelled (the event, not a booking). */
  timing: "upcoming" | "past" | "cancelled";
  currency: string;
  capacity: number | null;
  /** Tickets paid for. */
  booked: number;
  /** Free RSVPs and held cards that are still going ahead. */
  reserved: number;
  /** booked + reserved: who to expect at the door. */
  expected: number;
  checkedIn: number;
  /** Add-ons on bookings that are going ahead, to prepare. */
  addons: VenueSalesAddon[];
  /** What the venue has earned from add-ons on paid bookings. */
  addonEarned: number;
};

const PAID = new Set(["confirmed", "fully_paid", "deposit_paid"]);
const HELD = new Set(["pending", "deposit_authorized"]);

const cents = (value: number) => Math.round(value * 100) / 100;

function bookingAddons(booking: VenueSalesBooking): Array<{ name: string; quantity: number; venueAmount: number }> {
  const items = Array.isArray(booking.addonItems) ? booking.addonItems : [];
  if (items.length > 0) {
    return items.map((item) => ({
      name: (item.name || "Add-on").trim(),
      quantity: Math.max(0, Number(item.quantity) || 0),
      venueAmount: Number(item.venueAmount ?? item.total) || 0,
    }));
  }
  // Older bookings kept one add-on in flat columns.
  const quantity = Math.max(0, Number(booking.addonQuantity) || 0);
  return quantity > 0 && booking.addonName ? [{ name: booking.addonName.trim(), quantity, venueAmount: 0 }] : [];
}

export function summariseVenueSales(
  events: VenueSalesEvent[],
  bookings: VenueSalesBooking[],
  now: Date = new Date(),
): VenueEventSales[] {
  const rows = events.map((event): VenueEventSales => {
    const own = bookings.filter((booking) => booking.experienceId === event.id && !booking.cancelledAt);
    let booked = 0;
    let reserved = 0;
    let checkedIn = 0;
    let addonEarned = 0;
    const addons = new Map<string, VenueSalesAddon>();

    for (const booking of own) {
      const status = booking.status || "";
      const paid = PAID.has(status);
      if (!paid && !HELD.has(status)) continue; // cancelled, refunded, failed
      const tickets = Math.max(0, Number(booking.ticketQuantity) || 0);
      if (paid) booked += tickets;
      else reserved += tickets;
      if (booking.attendanceStatus === "attended") checkedIn += tickets;

      for (const item of bookingAddons(booking)) {
        const entry = addons.get(item.name) || { name: item.name, quantity: 0, venueEarned: 0 };
        entry.quantity += item.quantity;
        if (paid) {
          entry.venueEarned = cents(entry.venueEarned + item.venueAmount);
          addonEarned += item.venueAmount;
        }
        addons.set(item.name, entry);
      }
    }

    const start = event.startDate ? new Date(event.startDate) : null;
    const timing: VenueEventSales["timing"] = event.status === "cancelled"
      ? "cancelled"
      // An event is "past" from the day after it starts, not the minute it starts.
      : start && start.getTime() + 24 * 60 * 60 * 1000 < now.getTime() ? "past" : "upcoming";
    const capacity = Number(event.standingCapacity || event.seatedCapacity || event.maxParticipants) || null;

    return {
      experienceId: event.id,
      slugOrId: event.slug || event.id,
      title: (event.title || "").trim() || "Untitled event",
      venueName: event.venueName ?? null,
      startDate: start && !Number.isNaN(start.getTime()) ? start.toISOString() : null,
      timing,
      currency: (event.currency || "eur").toLowerCase(),
      capacity,
      booked,
      reserved,
      expected: booked + reserved,
      checkedIn,
      addons: Array.from(addons.values()).filter((addon) => addon.quantity > 0).sort((a, b) => b.quantity - a.quantity),
      addonEarned: cents(addonEarned),
    };
  });

  // Next event first, then the most recent past ones, cancelled last.
  const rank = { upcoming: 0, past: 1, cancelled: 2 } as const;
  return rows.sort((a, b) => {
    if (rank[a.timing] !== rank[b.timing]) return rank[a.timing] - rank[b.timing];
    const at = a.startDate ? Date.parse(a.startDate) : 0;
    const bt = b.startDate ? Date.parse(b.startDate) : 0;
    return a.timing === "upcoming" ? at - bt : bt - at;
  });
}
