import { describe, expect, it } from "vitest";
import { partnerPersonName, partnerRowForViewer, summarisePartnerPeople, type PartnerBookingRow } from "./partnerPeople";

const row = (overrides: Partial<PartnerBookingRow>): PartnerBookingRow => ({
  id: "b", firstName: "Ana", lastName: "López", ticketQuantity: 1, status: "fully_paid",
  attendanceStatus: "unknown", commissionAmount: "7.00", commissionStatus: "estimated",
  cancelledAt: null, createdAt: "2026-10-20T10:00:00.000Z", ...overrides,
});

describe("names", () => {
  it("gives the organiser the full name", () => {
    expect(partnerPersonName("Ana", "López", "organiser")).toBe("Ana López");
  });

  it("gives the partner a first name and an initial only", () => {
    expect(partnerPersonName("Ana", "López", "partner")).toBe("Ana L.");
    expect(partnerPersonName("Ana", "", "partner")).toBe("Ana");
    expect(partnerPersonName("", "López", "partner")).toBe("L.");
  });

  it("says Guest when there is no name at all", () => {
    expect(partnerPersonName(null, undefined, "organiser")).toBe("Guest");
    expect(partnerPersonName(" ", " ", "partner")).toBe("Guest");
  });
});

describe("who a partner brought", () => {
  it("counts tickets on bookings that are going ahead, and what they earn", () => {
    const { totals, people } = summarisePartnerPeople([
      row({ id: "b1", ticketQuantity: 2, commissionAmount: "14.00" }),
      row({ id: "b2", status: "confirmed", commissionAmount: "7.00" }),
    ], "organiser");
    expect(totals).toEqual({ tickets: 3, checkedIn: 0, dropped: 0, earned: 21, paid: 0 });
    expect(people.map((p) => p.state)).toEqual(["booked", "booked"]);
  });

  it("counts a held card on an event still forming its group as reserved, and going ahead", () => {
    const { totals, people } = summarisePartnerPeople([row({ status: "pending" })], "organiser");
    expect(people[0].state).toBe("reserved");
    expect(totals.tickets).toBe(1);
    expect(totals.earned).toBe(7);
  });

  it("lists cancelled and refunded bookings, but counts and pays nothing for them", () => {
    // Tim: exclude cancelled and refunded bookings from what a partner earns.
    const { totals, people } = summarisePartnerPeople([
      row({ id: "b1", status: "cancelled", commissionStatus: "voided" }),
      row({ id: "b2", status: "refunded", commissionStatus: "estimated", ticketQuantity: 2 }),
      row({ id: "b3", status: "fully_paid", cancelledAt: "2026-10-21T00:00:00.000Z" }),
    ], "organiser");
    expect(people.map((p) => p.state).sort()).toEqual(["cancelled", "cancelled", "refunded"]);
    expect(people.every((p) => p.earned === 0)).toBe(true);
    expect(totals).toEqual({ tickets: 0, checkedIn: 0, dropped: 4, earned: 0, paid: 0 });
  });

  it("leaves a failed payment out entirely", () => {
    expect(summarisePartnerPeople([row({ status: "failed" })], "organiser").people).toEqual([]);
  });

  it("earns nothing on a voided commission, even if the booking stands", () => {
    const { totals } = summarisePartnerPeople([row({ commissionStatus: "voided" })], "organiser");
    expect(totals.earned).toBe(0);
    expect(totals.tickets).toBe(1);
  });

  it("earns nothing on a free ticket", () => {
    // A 100% discount ticket: no commission was ever calculated.
    const { totals } = summarisePartnerPeople([row({ commissionAmount: null, commissionStatus: null })], "organiser");
    expect(totals.earned).toBe(0);
    expect(totals.tickets).toBe(1);
  });

  it("separates what has been paid from what is owed", () => {
    const { totals, people } = summarisePartnerPeople([
      row({ id: "b1", commissionStatus: "paid", commissionAmount: "7.00" }),
      row({ id: "b2", commissionStatus: "locked", commissionAmount: "4.50" }),
    ], "organiser");
    expect(totals.earned).toBe(11.5);
    expect(totals.paid).toBe(7);
    expect(people.find((p) => p.bookingId === "b1")!.paid).toBe(true);
  });

  it("counts check-ins on tickets that are going ahead", () => {
    const { totals, people } = summarisePartnerPeople([
      row({ id: "b1", attendanceStatus: "attended", ticketQuantity: 2 }),
      row({ id: "b2", attendanceStatus: "attended", status: "cancelled" }),
    ], "organiser");
    expect(totals.checkedIn).toBe(2);
    expect(people.find((p) => p.bookingId === "b2")!.checkedIn).toBe(false);
  });

  it("puts the newest booking first", () => {
    const { people } = summarisePartnerPeople([
      row({ id: "old", createdAt: "2026-10-18T10:00:00.000Z" }),
      row({ id: "new", createdAt: "2026-10-21T10:00:00.000Z" }),
    ], "organiser");
    expect(people.map((p) => p.bookingId)).toEqual(["new", "old"]);
  });

  it("shows the partner initials and the organiser full names, from the same bookings", () => {
    const rows = [row({ id: "b1" })];
    expect(summarisePartnerPeople(rows, "organiser").people[0].name).toBe("Ana López");
    expect(summarisePartnerPeople(rows, "partner").people[0].name).toBe("Ana L.");
  });

  it("rounds money to the cent", () => {
    const { totals } = summarisePartnerPeople([
      row({ id: "b1", commissionAmount: "0.1" }), row({ id: "b2", commissionAmount: "0.2" }),
    ], "organiser");
    expect(totals.earned).toBe(0.3);
  });
});

describe("another partner's row, as a partner sees it", () => {
  const other = {
    id: "p2", partnerName: "GoodSoles", partnerEmail: "team@goodsoles.example", partnerUserId: "user-gs",
    refCode: "goodsoles", inviteToken: "secret", shareUrl: "https://x/e?ref=goodsoles",
    terms: { commissionPct: 10, assignedAffiliateId: "user-gs" }, dealType: "commission_per_ticket", joined: 4,
  };

  it("shows who they are and what kind of deal, nothing to reach or impersonate them with", () => {
    const shown = partnerRowForViewer(other, false, false) as any;
    for (const key of ["partnerEmail", "partnerUserId", "refCode", "shareUrl"]) expect(shown).not.toHaveProperty(key);
    expect(shown.inviteToken).toBeUndefined();
    expect(shown.terms).toEqual({ commissionPct: 10 });
    expect(shown).toMatchObject({ partnerName: "GoodSoles", dealType: "commission_per_ticket", joined: 4 });
  });

  it("leaves a partner their own row, apart from the invite token", () => {
    const shown = partnerRowForViewer(other, true, false) as any;
    expect(shown.partnerEmail).toBe("team@goodsoles.example");
    expect(shown.shareUrl).toBe("https://x/e?ref=goodsoles");
    expect(shown.inviteToken).toBeUndefined();
  });

  it("leaves the organiser every row exactly as it is", () => {
    expect(partnerRowForViewer(other, false, true)).toBe(other);
  });
});
