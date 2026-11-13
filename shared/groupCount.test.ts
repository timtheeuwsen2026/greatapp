import { describe, expect, it } from "vitest";
import { countsTowardsGroup, isPaidBooking } from "./groupCount";

describe("who counts towards a minimum group", () => {
  it("counts a ticket charged at checkout, not only held or confirmed ones", () => {
    expect(countsTowardsGroup({ status: "fully_paid" })).toBe(true);
    expect(countsTowardsGroup({ status: "deposit_paid" })).toBe(true);
    expect(countsTowardsGroup({ status: "pending" })).toBe(true);
  });

  it("leaves out cancelled, refunded and failed bookings", () => {
    expect(countsTowardsGroup({ status: "fully_paid", cancelledAt: "2026-11-01" })).toBe(false);
    expect(countsTowardsGroup({ status: "refunded" })).toBe(false);
    expect(countsTowardsGroup({ status: "failed" })).toBe(false);
  });

  it("calls a booking paid only once the money is in", () => {
    expect(isPaidBooking({ status: "confirmed" })).toBe(true);
    expect(isPaidBooking({ status: "pending" })).toBe(false);
  });
});

describe("what a buyer is told about a minimum group", () => {
  it("uses Tim's wording with the group size and deadline", async () => {
    const { groupPaymentPromise } = await import("./groupCount");
    expect(groupPaymentPromise(10, "2026-11-20T22:59:00Z")).toBe(
      "You pay now. This event goes ahead once at least 10 people have booked by 20 Nov 2026, 23:59. If it doesn't, you'll automatically get a full refund.",
    );
  });
});
