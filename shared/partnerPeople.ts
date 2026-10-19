/**
 * Who a partner brought to an event, and what it earned them.
 *
 * The same bookings are shown to two people: the organiser, who needs to know
 * exactly who came through which community, and the community itself, which
 * should see that its people arrived and what it is owed — but not the full
 * names and contact details of strangers' customers. One rule for both, so the
 * two views can never disagree on a count.
 *
 * Earnings are paid after the event, on bookings that went through. Cancelled
 * and refunded bookings are listed (so nobody wonders where a person went) but
 * earn nothing and count for nothing.
 */

export type PartnerBookingRow = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  ticketQuantity?: number | null;
  status?: string | null;
  attendanceStatus?: string | null;
  commissionAmount?: string | number | null;
  commissionStatus?: string | null;
  cancelledAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type PartnerViewer = "organiser" | "partner";

export type PartnerPersonState = "booked" | "reserved" | "cancelled" | "refunded";

export type PartnerPerson = {
  bookingId: string;
  name: string;
  tickets: number;
  state: PartnerPersonState;
  checkedIn: boolean;
  /** What this booking earns the partner, or 0 when it earns nothing. */
  earned: number;
  paid: boolean;
  bookedAt: string | null;
};

export type PartnerPeopleSummary = {
  people: PartnerPerson[];
  totals: {
    /** Tickets on bookings that are still going ahead. */
    tickets: number;
    /** Of those, tickets whose holder has checked in. */
    checkedIn: number;
    /** Tickets on cancelled or refunded bookings — shown, not counted. */
    dropped: number;
    /** What the partner is owed in total, including anything already paid. */
    earned: number;
    /** What has already been transferred. */
    paid: number;
  };
};

/** Paid, or held and still going ahead. */
const BOOKED = new Set(["confirmed", "fully_paid", "deposit_paid"]);
/** Card held while a minimum group forms; counts as going ahead until it fails. */
const RESERVED = new Set(["pending", "deposit_authorized"]);
const EARNING_COMMISSION = new Set(["estimated", "locked", "paid"]);

function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * "Ana López" for the organiser; "Ana L." for the partner. Someone who bought a
 * ticket through a run club's link is the organiser's customer, and the club
 * needs to recognise its member, not be handed their full name.
 */
export function partnerPersonName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  viewer: PartnerViewer,
): string {
  const first = String(firstName ?? "").trim();
  const last = String(lastName ?? "").trim();
  if (!first && !last) return "Guest";
  if (viewer === "organiser") return [first, last].filter(Boolean).join(" ");
  if (!first) return `${last.charAt(0).toUpperCase()}.`;
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

function stateOf(row: PartnerBookingRow): PartnerPersonState | null {
  const status = String(row.status ?? "");
  if (status === "refunded") return "refunded";
  if (status === "cancelled" || row.cancelledAt) return "cancelled";
  if (BOOKED.has(status)) return "booked";
  if (RESERVED.has(status)) return "reserved";
  // A failed payment never became a booking anyone should see.
  return null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function summarisePartnerPeople(rows: PartnerBookingRow[], viewer: PartnerViewer): PartnerPeopleSummary {
  const people: PartnerPerson[] = [];
  const totals = { tickets: 0, checkedIn: 0, dropped: 0, earned: 0, paid: 0 };

  for (const row of rows) {
    const state = stateOf(row);
    if (!state) continue;
    const tickets = Math.max(1, Number(row.ticketQuantity) || 1);
    const going = state === "booked" || state === "reserved";
    const checkedIn = going && row.attendanceStatus === "attended";
    const earns = going && EARNING_COMMISSION.has(String(row.commissionStatus ?? ""));
    const earned = earns ? money(row.commissionAmount) : 0;
    const paid = earns && row.commissionStatus === "paid";

    people.push({
      bookingId: row.id,
      name: partnerPersonName(row.firstName, row.lastName, viewer),
      tickets,
      state,
      checkedIn,
      earned,
      paid,
      bookedAt: iso(row.createdAt),
    });

    if (going) {
      totals.tickets += tickets;
      if (checkedIn) totals.checkedIn += tickets;
    } else {
      totals.dropped += tickets;
    }
    totals.earned += earned;
    if (paid) totals.paid += earned;
  }

  // Newest first: the question is usually "did my post just work?".
  people.sort((a, b) => String(b.bookedAt ?? "").localeCompare(String(a.bookedAt ?? "")));
  totals.earned = round2(totals.earned);
  totals.paid = round2(totals.paid);
  return { people, totals };
}

/**
 * One partner's row from the event's partner list, as another partner on the
 * same event may see it: who they are and what kind of deal, not their email,
 * account, referral code or invite.
 */
export function partnerRowForViewer<T extends Record<string, any>>(row: T, viewerOwnsRow: boolean, viewerIsOrganiser: boolean): T {
  if (viewerIsOrganiser) return row;
  const copy: Record<string, any> = { ...row, inviteToken: undefined };
  if (!viewerOwnsRow) {
    delete copy.partnerEmail;
    delete copy.email;
    delete copy.partnerUserId;
    delete copy.refCode;
    delete copy.shareUrl;
    if (copy.terms && typeof copy.terms === "object") {
      const { assignedAffiliateId: _hidden, ...terms } = copy.terms;
      copy.terms = terms;
    }
  }
  return copy as T;
}
