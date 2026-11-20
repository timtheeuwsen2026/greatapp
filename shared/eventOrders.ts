/**
 * The orders of one event, one row per booking (Tim, points 58.1, 58.2, 66.35).
 *
 * The venue saw only totals ("Coffee × 2, €2.00") and the organiser saw
 * nothing at all. This is the list behind both: who booked, which ticket,
 * which add-ons, what they paid and where the booking stands, plus whether
 * the venue has handed the add-on out. The venue's order sheet reads it now;
 * the organiser's Orders screen (board D2) reads the same rows.
 *
 * A venue gets first name and initial only: it needs to hand a coffee to the
 * right person, not a guest list.
 */

import { venuePricedAddonCents } from "./addonChoices";

export type OrderBookingLike = {
  id: string;
  experienceId?: string | null;
  userId?: string | null;
  status?: string | null;
  cancelledAt?: string | Date | null;
  ticketName?: string | null;
  ticketQuantity?: number | null;
  amount?: string | number | null;
  attendanceStatus?: string | null;
  addonRedeemedAt?: string | Date | null;
  addonItems?: Array<{ name?: string; quantity?: number; total?: number; venueAmount?: number; markup?: number }> | null;
  addonName?: string | null;
  addonQuantity?: number | null;
  addonTotal?: string | number | null;
  createdAt?: string | Date | null;
  bookingDate?: string | Date | null;
};

export type OrderPerson = { firstName?: string | null; lastName?: string | null; email?: string | null };

export type OrderStatus = "paid" | "reserved" | "cancelled" | "refunded";

export type EventOrderAddon = {
  name: string;
  quantity: number;
  /** What the buyer paid for this line. */
  total: number;
  /** Of that, the venue's part. */
  venueAmount: number;
};

export type EventOrderRow = {
  bookingId: string;
  person: string;
  email: string | null;
  ticketName: string;
  tickets: number;
  addons: EventOrderAddon[];
  amount: number;
  status: OrderStatus;
  checkedIn: boolean;
  handedOutAt: string | null;
  bookedAt: string | null;
};

export type EventOrderTotals = {
  orders: number;
  tickets: number;
  amount: number;
  addons: Array<{
    name: string;
    quantity: number;
    handedOut: number;
    /** What the venue is paid for it (paid orders). */
    venueAmount: number;
    /** What buyers paid for it (paid orders). */
    total: number;
    /** What the organiser keeps on top of the venue's price (paid orders). */
    margin: number;
  }>;
};

const PAID = new Set(["confirmed", "fully_paid", "deposit_paid"]);
const HELD = new Set(["pending", "deposit_authorized"]);
const round2 = (value: number) => Math.round(value * 100) / 100;

export function orderStatus(booking: OrderBookingLike): OrderStatus | null {
  const status = String(booking.status || "");
  if (status === "refunded") return "refunded";
  if (booking.cancelledAt || status === "cancelled") return "cancelled";
  if (PAID.has(status)) return "paid";
  if (HELD.has(status)) return "reserved";
  return null; // failed: never an order
}

export function orderAddons(booking: OrderBookingLike): EventOrderAddon[] {
  const items = Array.isArray(booking.addonItems) ? booking.addonItems : [];
  if (items.length) {
    return items
      .map((item) => ({
        name: String(item?.name || "Add-on").trim(),
        quantity: Math.max(0, Number(item?.quantity) || 0),
        total: round2(Number(item?.total) || 0),
        venueAmount: venuePricedAddonCents([item]).venue / 100,
      }))
      .filter((item) => item.quantity > 0);
  }
  const quantity = Math.max(0, Number(booking.addonQuantity) || 0);
  return quantity > 0 && booking.addonName
    ? [{ name: booking.addonName.trim(), quantity, total: round2(Number(booking.addonTotal) || 0), venueAmount: 0 }]
    : [];
}

function personName(person: OrderPerson | undefined, viewer: "venue" | "organiser"): string {
  const first = String(person?.firstName || "").trim();
  const last = String(person?.lastName || "").trim();
  if (!first && !last) return "Guest";
  if (viewer === "venue") return [first || last, first && last ? `${last[0].toUpperCase()}.` : ""].filter(Boolean).join(" ");
  return [first, last].filter(Boolean).join(" ");
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildEventOrders(
  bookings: OrderBookingLike[],
  people: Map<string, OrderPerson> | Record<string, OrderPerson>,
  viewer: "venue" | "organiser",
): EventOrderRow[] {
  const lookup = (id?: string | null) => {
    if (!id) return undefined;
    return people instanceof Map ? people.get(id) : people[id];
  };
  const rows: EventOrderRow[] = [];
  for (const booking of bookings) {
    const status = orderStatus(booking);
    if (!status) continue;
    const person = lookup(booking.userId);
    rows.push({
      bookingId: booking.id,
      person: personName(person, viewer),
      email: viewer === "organiser" ? (person?.email || null) : null,
      ticketName: String(booking.ticketName || "").trim() || "Ticket",
      tickets: Math.max(0, Number(booking.ticketQuantity) || 0),
      addons: orderAddons(booking),
      amount: round2(Number(booking.amount) || 0),
      status,
      checkedIn: booking.attendanceStatus === "attended",
      handedOutAt: iso(booking.addonRedeemedAt),
      bookedAt: iso(booking.createdAt ?? booking.bookingDate),
    });
  }
  // Going ahead first, then by booking time; cancelled and refunded at the end.
  const going = (row: EventOrderRow) => (row.status === "paid" || row.status === "reserved" ? 0 : 1);
  return rows.sort((a, b) => going(a) - going(b) || String(a.bookedAt).localeCompare(String(b.bookedAt)));
}

/** Totals over orders that are going ahead. Cancelled and refunded are not counted. */
export function eventOrderTotals(rows: EventOrderRow[]): EventOrderTotals {
  const live = rows.filter((row) => row.status === "paid" || row.status === "reserved");
  const addons = new Map<string, EventOrderTotals["addons"][number]>();
  for (const row of live) {
    for (const addon of row.addons) {
      const entry = addons.get(addon.name) || { name: addon.name, quantity: 0, handedOut: 0, venueAmount: 0, total: 0, margin: 0 };
      entry.quantity += addon.quantity;
      if (row.handedOutAt) entry.handedOut += addon.quantity;
      if (row.status === "paid") {
        entry.venueAmount = round2(entry.venueAmount + addon.venueAmount);
        entry.total = round2(entry.total + addon.total);
        entry.margin = round2(entry.total - entry.venueAmount);
      }
      addons.set(addon.name, entry);
    }
  }
  return {
    orders: live.length,
    tickets: live.reduce((sum, row) => sum + row.tickets, 0),
    amount: round2(live.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amount, 0)),
    addons: Array.from(addons.values()),
  };
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  paid: "Paid",
  reserved: "Reserved",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_LABEL[status];
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The order sheet as CSV, for export (58.2). Amounts as 2.00 in euro. */
export function eventOrdersCsv(rows: EventOrderRow[], viewer: "venue" | "organiser"): string {
  const header = ["Person", ...(viewer === "organiser" ? ["Email"] : []), "Ticket", "Tickets", "Add-ons", "Paid (EUR)", "Status", "Checked in", "Add-on handed out"];
  const lines = rows.map((row) => [
    row.person,
    ...(viewer === "organiser" ? [row.email || ""] : []),
    row.ticketName,
    row.tickets,
    row.addons.map((addon) => `${addon.name} x ${addon.quantity}`).join(", "),
    row.amount.toFixed(2),
    orderStatusLabel(row.status),
    row.checkedIn ? "Yes" : "No",
    row.addons.length ? (row.handedOutAt ? "Yes" : "No") : "",
  ].map(csvCell).join(","));
  return [header.map(csvCell).join(","), ...lines].join("\n");
}

// ─── As partner (Tim, 66.35 with 66.22h and 66.23e) ─────────────────────────
// "The same list also belongs to the partner under 'As partner' (his own
// referred bookings only)". Any account can be a partner on an event, so this
// is built from the bookings that carry the account as their partner (first
// link wins), never from a role.

export type PartnerCommissionState = "coming" | "secured" | "paid" | "not_paid";

const COMMISSION_STATE: Record<string, PartnerCommissionState> = {
  estimated: "coming",
  locked: "secured",
  paid: "paid",
  voided: "not_paid",
};

export const PARTNER_COMMISSION_LABEL: Record<PartnerCommissionState, string> = {
  coming: "Coming",
  secured: "Secured",
  paid: "Paid out",
  not_paid: "Not paid (cancelled)",
};

export type PartnerOrderBookingLike = OrderBookingLike & {
  commissionAmount?: string | number | null;
  commissionStatus?: string | null;
  testPayment?: boolean | null;
};

export type PartnerOrderRow = EventOrderRow & {
  commission: number;
  commissionState: PartnerCommissionState;
};

export type PartnerEventOrders = {
  experienceId: string;
  orders: PartnerOrderRow[];
  totals: { orders: number; tickets: number; coming: number; secured: number; paid: number };
};

export function buildPartnerOrders(
  bookings: PartnerOrderBookingLike[],
  people: Map<string, OrderPerson> | Record<string, OrderPerson>,
): PartnerEventOrders[] {
  const byEvent = new Map<string, PartnerOrderBookingLike[]>();
  for (const booking of bookings) {
    // A test payment is not a sale: no commission, not listed.
    if (booking.testPayment || !booking.experienceId) continue;
    const list = byEvent.get(booking.experienceId) || [];
    list.push(booking);
    byEvent.set(booking.experienceId, list);
  }
  const out: PartnerEventOrders[] = [];
  for (const [experienceId, list] of Array.from(byEvent)) {
    // Buyers named the way a venue sees them: first name and initial.
    const rows = buildEventOrders(list, people, "venue");
    const byId = new Map(list.map((booking) => [booking.id, booking]));
    const orders: PartnerOrderRow[] = rows.map((row) => {
      const booking = byId.get(row.bookingId)!;
      const cancelled = row.status === "cancelled" || row.status === "refunded";
      const state: PartnerCommissionState = cancelled
        ? "not_paid"
        : COMMISSION_STATE[String(booking.commissionStatus || "estimated")] || "coming";
      return { ...row, commission: round2(Number(booking.commissionAmount) || 0), commissionState: state };
    });
    const live = orders.filter((row) => row.status === "paid" || row.status === "reserved");
    const sum = (state: PartnerCommissionState) =>
      round2(orders.filter((row) => row.commissionState === state).reduce((total, row) => total + row.commission, 0));
    out.push({
      experienceId,
      orders,
      totals: {
        orders: live.length,
        tickets: live.reduce((total, row) => total + row.tickets, 0),
        coming: sum("coming"),
        secured: sum("secured"),
        paid: sum("paid"),
      },
    });
  }
  return out;
}
