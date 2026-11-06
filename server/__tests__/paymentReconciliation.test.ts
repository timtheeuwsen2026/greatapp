import { describe, expect, it } from "vitest";
import { decidePaymentReconciliation, type ReconBooking, type ReconIntent } from "../paymentReconciliation";

// Every case here is one the live Stripe export (Jul-Nov 2026) actually showed.

const now = new Date("2026-11-05T12:00:00Z");
const booking = (overrides: Partial<ReconBooking> = {}): ReconBooking => ({
  id: "b1", status: "pending", cancelledAt: null, amount: "5.00", testPayment: false, ...overrides,
});
const intent = (overrides: Partial<ReconIntent> = {}): ReconIntent => ({
  id: "pi_1", status: "succeeded", amountCents: 500, receivedCents: 500, refundedCents: 0, disputed: false,
  createdAt: new Date("2026-11-01T12:00:00Z"), ...overrides,
});
const groupMet = { requireMinimumParticipants: true, mvgStatus: "met" };
const groupForming = { requireMinimumParticipants: true, mvgStatus: "pending" };
const ordinary = { requireMinimumParticipants: false, mvgStatus: null };

describe("Great vs Stripe for one booking", () => {
  it("collects a held card once the group is reached", () => {
    const decision = decidePaymentReconciliation(booking(), intent({ status: "requires_capture", receivedCents: 0 }), groupMet, now);
    expect(decision).toMatchObject({ action: "capture", kind: "uncollected_hold" });
  });

  it("leaves the hold alone while the group is still forming", () => {
    expect(decidePaymentReconciliation(booking(), intent({ status: "requires_capture" }), groupForming, now).action).toBe("none");
  });

  it("only reports a hold on an ordinary event, since nothing says when it was meant to be collected", () => {
    expect(decidePaymentReconciliation(booking(), intent({ status: "requires_capture" }), ordinary, now))
      .toMatchObject({ action: "none", kind: "uncollected_hold" });
  });

  it("releases a hold left on a cancelled booking", () => {
    const decision = decidePaymentReconciliation(
      booking({ status: "cancelled", cancelledAt: "2026-10-30T00:00:00Z" }),
      intent({ status: "requires_capture" }), groupMet, now,
    );
    expect(decision).toMatchObject({ action: "release", kind: "hold_on_cancelled_booking" });
  });

  it("marks a booking refunded when Stripe refunded all of it, which was missing for 19 bookings", () => {
    const decision = decidePaymentReconciliation(booking(), intent({ refundedCents: 500 }), groupMet, now);
    expect(decision).toMatchObject({ action: "mark_refunded", kind: "refund_not_recorded" });
  });

  it("does nothing for a refund Great already knows about", () => {
    expect(decidePaymentReconciliation(booking({ status: "refunded" }), intent({ refundedCents: 500 }), ordinary, now).action).toBe("none");
  });

  it("reports a partial refund without changing the booking", () => {
    expect(decidePaymentReconciliation(booking({ status: "fully_paid" }), intent({ refundedCents: 200 }), ordinary, now))
      .toMatchObject({ action: "none", kind: "partial_refund" });
  });

  it("marks a booking paid when Stripe has the money and Great still says pending", () => {
    expect(decidePaymentReconciliation(booking(), intent(), groupMet, now)).toMatchObject({ action: "mark_paid", kind: "paid_not_recorded" });
  });

  it("asks a person to look at money kept for a cancelled booking", () => {
    expect(decidePaymentReconciliation(booking({ status: "cancelled" }), intent({ receivedCents: 50, amountCents: 50 }), ordinary, now))
      .toMatchObject({ action: "none", kind: "paid_not_recorded" });
  });

  it("reports an amount that differs from what was collected", () => {
    expect(decidePaymentReconciliation(booking({ status: "fully_paid", amount: "7.00" }), intent(), ordinary, now))
      .toMatchObject({ action: "none", kind: "amount_differs" });
  });

  it("is quiet when everything matches", () => {
    expect(decidePaymentReconciliation(booking({ status: "fully_paid" }), intent(), ordinary, now)).toEqual({ action: "none" });
  });

  it("stops counting a booking whose hold expired before it was collected", () => {
    expect(decidePaymentReconciliation(booking(), intent({ status: "canceled", receivedCents: 0 }), groupMet, now))
      .toMatchObject({ action: "mark_failed", kind: "hold_expired" });
  });

  it("gives an unfinished payment a day before calling it failed", () => {
    const fresh = intent({ status: "requires_payment_method", receivedCents: 0, createdAt: new Date("2026-11-05T09:00:00Z") });
    expect(decidePaymentReconciliation(booking(), fresh, ordinary, now).action).toBe("none");
    const stale = intent({ status: "requires_payment_method", receivedCents: 0, createdAt: new Date("2026-11-03T09:00:00Z") });
    expect(decidePaymentReconciliation(booking(), stale, ordinary, now)).toMatchObject({ action: "mark_failed", kind: "payment_not_completed" });
  });

  it("keeps a booking paid with the test key out of the money", () => {
    expect(decidePaymentReconciliation(booking({ status: "fully_paid", amount: "100.00" }), null, ordinary, now))
      .toMatchObject({ action: "mark_test", kind: "test_payment" });
    expect(decidePaymentReconciliation(booking({ status: "fully_paid", testPayment: true }), null, ordinary, now).action).toBe("none");
  });

  it("reports a dispute and leaves the booking for a person", () => {
    expect(decidePaymentReconciliation(booking({ status: "fully_paid" }), intent({ disputed: true }), ordinary, now))
      .toMatchObject({ action: "none", kind: "dispute" });
  });
});

describe("reading a Stripe payment", () => {
  it("takes the refund and dispute from the latest charge", async () => {
    const { intentForReconciliation } = await import("../paymentReconciliation");
    const read = intentForReconciliation({
      id: "pi_9", status: "succeeded", amount: 700, amount_received: 700, created: 1761900000,
      latest_charge: { id: "ch_9", amount_refunded: 700, disputed: false },
    } as any);
    expect(read).toMatchObject({ id: "pi_9", receivedCents: 700, refundedCents: 700, disputed: false });
  });
});
