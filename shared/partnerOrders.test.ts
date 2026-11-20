import { describe, expect, it } from "vitest";
import { buildPartnerOrders } from "./eventOrders";

// "As partner" (Tim, 66.35): the partner's own referred bookings only, with commission.
const people = new Map([
  ["u1", { firstName: "Koper", lastName: "Een" }],
  ["u2", { firstName: "Koper", lastName: "Twee" }],
]);

describe("buildPartnerOrders", () => {
  it("groups the partner's bookings per event with commission and its state", () => {
    const [event] = buildPartnerOrders([
      { id: "b1", experienceId: "e3", userId: "u1", status: "fully_paid", ticketName: "Entry", ticketQuantity: 1, amount: "2.00", commissionAmount: "0.20", commissionStatus: "locked" },
      { id: "b2", experienceId: "e3", userId: "u2", status: "refunded", cancelledAt: "2026-11-10T10:00:00Z", ticketName: "Entry", ticketQuantity: 1, amount: "2.00", commissionAmount: "0.20", commissionStatus: "voided" },
    ], people);

    expect(event.experienceId).toBe("e3");
    expect(event.orders[0]).toMatchObject({ person: "Koper E.", email: null, commission: 0.2, commissionState: "secured" });
    expect(event.orders[1]).toMatchObject({ status: "refunded", commissionState: "not_paid" });
    expect(event.totals).toEqual({ orders: 1, tickets: 1, coming: 0, secured: 0.2, paid: 0 });
  });

  it("leaves out test payments and reads an open commission as Coming", () => {
    const result = buildPartnerOrders([
      { id: "b1", experienceId: "e1", userId: "u1", status: "fully_paid", amount: "2.00", commissionAmount: "0.20", commissionStatus: "estimated" },
      { id: "b2", experienceId: "e1", userId: "u2", status: "fully_paid", amount: "2.00", commissionAmount: "0.20", testPayment: true },
    ], people);
    expect(result).toHaveLength(1);
    expect(result[0].orders).toHaveLength(1);
    expect(result[0].totals.coming).toBe(0.2);
  });

  it("marks a paid commission as Paid out", () => {
    const [event] = buildPartnerOrders([
      { id: "b1", experienceId: "e1", userId: "u1", status: "fully_paid", amount: "2.00", commissionAmount: "0.20", commissionStatus: "paid" },
    ], people);
    expect(event.orders[0].commissionState).toBe("paid");
    expect(event.totals.paid).toBe(0.2);
  });
});
