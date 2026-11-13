import { describe, expect, it } from "vitest";
import { summariseVenueSales, type VenueSalesBooking, type VenueSalesEvent } from "./venueSales";

const now = new Date("2026-10-30T12:00:00Z");
const event = (overrides: Partial<VenueSalesEvent> = {}): VenueSalesEvent => ({
  id: "e1", title: "Good Soles X Bandido", slug: "bandido-5k", startDate: "2026-11-01T07:00:00Z",
  status: "published", currency: "eur", standingCapacity: 50, ...overrides,
});
const booking = (overrides: Partial<VenueSalesBooking> = {}): VenueSalesBooking => ({
  experienceId: "e1", status: "fully_paid", ticketQuantity: 1, attendanceStatus: "unknown", cancelledAt: null, addonItems: [], ...overrides,
});

describe("sales at a venue", () => {
  it("expects paid tickets plus RSVPs and held cards, out of the capacity", () => {
    const [sales] = summariseVenueSales([event()], [
      booking({ ticketQuantity: 2 }),
      booking({ status: "pending" }),
      booking({ status: "deposit_authorized" }),
    ], now);
    expect(sales).toMatchObject({ booked: 2, reserved: 2, expected: 4, capacity: 50 });
  });

  it("does not count cancelled, refunded or failed bookings", () => {
    const [sales] = summariseVenueSales([event()], [
      booking({ status: "cancelled" }), booking({ status: "refunded" }), booking({ status: "failed" }),
      booking({ status: "fully_paid", cancelledAt: "2026-10-29T00:00:00Z" }),
    ], now);
    expect(sales.expected).toBe(0);
  });

  it("counts check-ins", () => {
    const [sales] = summariseVenueSales([event()], [booking({ ticketQuantity: 3, attendanceStatus: "attended" }), booking()], now);
    expect(sales.checkedIn).toBe(3);
  });

  it("adds up the add-ons to prepare, and what the venue earns on paid ones", () => {
    const drink = { id: "a1", name: "1 drink (wine, beer, soda)", quantity: 1, venueAmount: 2, total: 3 };
    const [sales] = summariseVenueSales([event()], [
      booking({ addonItems: [drink] }),
      booking({ addonItems: [{ ...drink, quantity: 2, total: 6 }] }), // venueAmount is per unit
      booking({ status: "pending", addonItems: [drink] }),
    ], now);
    expect(sales.addons).toEqual([{ name: "1 drink (wine, beer, soda)", quantity: 4, venueEarned: 6 }]);
    expect(sales.addonEarned).toBe(6);
  });

  it("reads the older single add-on columns too", () => {
    const [sales] = summariseVenueSales([event()], [booking({ addonItems: [], addonName: "Coffee", addonQuantity: 2 })], now);
    expect(sales.addons).toEqual([{ name: "Coffee", quantity: 2, venueEarned: 0 }]);
  });

  it("puts the next event first, then recent past ones, cancelled last", () => {
    const sales = summariseVenueSales([
      event({ id: "past", startDate: "2026-10-11T07:00:00Z" }),
      event({ id: "later", startDate: "2026-11-15T07:00:00Z" }),
      event({ id: "gone", status: "cancelled", startDate: "2026-10-28T07:00:00Z" }),
      event({ id: "next", startDate: "2026-11-01T07:00:00Z" }),
    ], [], now);
    expect(sales.map((row) => [row.experienceId, row.timing])).toEqual([
      ["next", "upcoming"], ["later", "upcoming"], ["past", "past"], ["gone", "cancelled"],
    ]);
  });

  it("is upcoming until its start time, happening until its end, then past (66.21)", () => {
    const evening = event({ startDate: "2026-10-30T12:00:00Z", startTime: "19:00", endTime: "21:00", city: "Barcelona" } as any);
    const at = (iso: string) => summariseVenueSales([evening], [], new Date(iso))[0];
    expect(at("2026-10-30T18:59:00+01:00").timing).toBe("upcoming");
    expect(at("2026-10-30T19:30:00+01:00").timing).toBe("happening");
    expect(at("2026-10-30T21:01:00+01:00").timing).toBe("past");
    expect(at("2026-10-30T18:59:00+01:00").when).toBe("Fri 30 Oct 2026, 19:00 – 21:00");
  });
});
