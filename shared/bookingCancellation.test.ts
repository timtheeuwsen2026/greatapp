import { describe, expect, it } from "vitest";
import {
  assessBookingCancellation,
  bookingCancellationGate,
  bookingPaidAmount,
  cancellationRefusalMessage,
  classifyBookingPayment,
  decideIntentCancellation,
  formatCancellationAmount,
  GROUP_CONFIRMED_DURING_CANCEL_MESSAGE,
  isAutomaticallyCaptured,
  isBookingCancelled,
  isBookingInactive,
  isCapturedPaymentRefundable,
  isGroupBalanceHold,
  isLiveStripeIntentId,
  lockedCancellationRefusal,
  unreleasedHoldNotice,
} from "./bookingCancellation";

const NOW = new Date("2026-10-06T12:00:00Z");

const event = (overrides: Record<string, unknown> = {}) => ({
  status: "approved",
  archivedAt: null,
  startDate: new Date("2026-10-20T00:00:00Z"),
  currency: "EUR",
  requireMinimumParticipants: false,
  mvgStatus: "pending",
  ...overrides,
});

const freeRsvp = (overrides: Record<string, unknown> = {}) => ({
  status: "fully_paid",
  cancelledAt: null,
  attendanceStatus: "unknown",
  addonRedeemedAt: null,
  commissionStatus: null,
  stripePaymentIntentId: null,
  balancePaymentIntentId: null,
  depositCapturedAt: null,
  amount: "0.00",
  isDepositOnly: false,
  balancePaid: true,
  balanceAmount: "0.00",
  ...overrides,
});

const paid = (overrides: Record<string, unknown> = {}) =>
  freeRsvp({ stripePaymentIntentId: "pi_live_1", amount: "45.00", ...overrides });

describe("assessBookingCancellation", () => {
  it("lets a free RSVP go with nothing to return", () => {
    expect(assessBookingCancellation({ booking: freeRsvp(), experience: event(), now: NOW })).toEqual({
      allowed: true,
      mode: "free",
      amount: 0,
      currency: "eur",
      blockedReason: null,
      message: null,
    });
  });

  it("releases money that was only ever held on the card", () => {
    const preview = assessBookingCancellation({
      booking: paid({ status: "pending" }),
      experience: event({ requireMinimumParticipants: true }),
      now: NOW,
    });
    expect(preview).toMatchObject({ allowed: true, mode: "money_back", amount: 45, blockedReason: null });
  });

  it("treats an authorised deposit as held", () => {
    const preview = assessBookingCancellation({
      booking: paid({ status: "deposit_authorized", amount: "20.00", isDepositOnly: true, balancePaid: false, balanceAmount: "80.00" }),
      experience: event(),
      now: NOW,
    });
    expect(preview).toMatchObject({ allowed: true, mode: "money_back", amount: 20 });
  });

  it("refunds a captured payment while the minimum group is still forming", () => {
    const preview = assessBookingCancellation({
      booking: paid({ status: "fully_paid" }),
      experience: event({ requireMinimumParticipants: true, mvgStatus: "pending" }),
      now: NOW,
    });
    expect(preview).toMatchObject({ allowed: true, mode: "money_back", amount: 45 });
  });

  it("keeps a payment the group run captured, even once the webhook has rewritten it and the event still reads pending", () => {
    // Only a group-success run stamps depositCapturedAt, and the webhook that
    // follows its capture overwrites confirmed with fully_paid. The stamp is
    // what is left to say the group has claimed this money.
    for (const status of ["pending", "fully_paid"]) {
      const preview = assessBookingCancellation({
        booking: paid({ status, depositCapturedAt: new Date("2026-10-01") }),
        experience: event({ requireMinimumParticipants: true, mvgStatus: "pending" }),
        now: NOW,
      });
      expect(preview).toMatchObject({ allowed: false, mode: null, amount: 0, blockedReason: "paid_final" });
    }
  });

  it("keeps a deposit booking whose balance the group run put on hold, once the webhook has rewritten it", () => {
    // The run claims a deposit booking by authorising its balance, and stamps
    // the claim; the deposit's late confirmation then writes fully_paid.
    const claimed = paid({
      status: "fully_paid",
      stripePaymentIntentId: "pi_deposit",
      balancePaymentIntentId: "pi_balance",
      isDepositOnly: true,
      balancePaid: false,
      amount: "20.00",
      balanceAmount: "80.00",
    });
    const forming = event({ requireMinimumParticipants: true, mvgStatus: "pending" });
    expect(assessBookingCancellation({ booking: { ...claimed, depositCapturedAt: new Date("2026-10-01") }, experience: forming, now: NOW }))
      .toMatchObject({ allowed: false, blockedReason: "paid_final" });
    // Unstamped, the row reads exactly like a deposit on a forming group.
    expect(assessBookingCancellation({ booking: claimed, experience: forming, now: NOW }))
      .toMatchObject({ allowed: true, mode: "money_back", amount: 20 });
  });

  it("keeps a payment the group run has already confirmed, before the event reads met", () => {
    // The success run captures and confirms every booking first and marks the
    // event met last, so a confirmed booking on a still-pending event is money
    // the formed group has already claimed.
    const preview = assessBookingCancellation({
      booking: paid({ status: "confirmed", depositCapturedAt: new Date("2026-10-01") }),
      experience: event({ requireMinimumParticipants: true, mvgStatus: "pending" }),
      now: NOW,
    });
    expect(preview).toMatchObject({ allowed: false, blockedReason: "paid_final" });
  });

  it("keeps a captured payment once the group has formed", () => {
    const preview = assessBookingCancellation({
      booking: paid({ status: "confirmed" }),
      experience: event({ requireMinimumParticipants: true, mvgStatus: "met" }),
      now: NOW,
    });
    expect(preview).toMatchObject({ allowed: false, mode: null, amount: 0, blockedReason: "paid_final" });
    expect(preview.message).toMatch(/final under our Terms/);
  });

  it("keeps a paid ticket on an event with no minimum group", () => {
    const preview = assessBookingCancellation({ booking: paid(), experience: event(), now: NOW });
    expect(preview).toMatchObject({ allowed: false, blockedReason: "paid_final" });
  });

  it("will not hand back a charge it has no PaymentIntent for", () => {
    const preview = assessBookingCancellation({
      booking: freeRsvp({ amount: "30.00" }),
      experience: event({ requireMinimumParticipants: true }),
      now: NOW,
    });
    expect(preview.blockedReason).toBe("paid_final");
  });

  it("refuses a booking that is already cancelled, without a message", () => {
    for (const booking of [freeRsvp({ status: "cancelled" }), freeRsvp({ status: "refunded" }), freeRsvp({ status: "failed" }), freeRsvp({ cancelledAt: new Date() })]) {
      const preview = assessBookingCancellation({ booking, experience: event(), now: NOW });
      expect(preview).toMatchObject({ allowed: false, blockedReason: "inactive", message: null });
    }
  });

  it("refuses an event that has been called off or archived", () => {
    for (const experience of [event({ status: "cancelled" }), event({ archivedAt: new Date() }), null]) {
      const preview = assessBookingCancellation({ booking: freeRsvp(), experience, now: NOW });
      expect(preview.blockedReason).toBe("event_cancelled");
      expect(preview.message).toBeTruthy();
    }
  });

  it("closes at the start of the event, not the end of its last day", () => {
    const experience = event({ startDate: new Date("2026-10-06T00:00:00Z"), endDate: new Date("2026-10-08T00:00:00Z") });
    const preview = assessBookingCancellation({ booking: freeRsvp(), experience, now: NOW });
    expect(preview).toMatchObject({ allowed: false, blockedReason: "started", message: null });
    expect(
      assessBookingCancellation({ booking: freeRsvp(), experience, now: new Date("2026-10-05T23:59:00Z") }).allowed,
    ).toBe(true);
  });

  it("refuses once the attendee has been checked in or redeemed their add-on", () => {
    expect(
      assessBookingCancellation({ booking: freeRsvp({ attendanceStatus: "attended" }), experience: event(), now: NOW }).blockedReason,
    ).toBe("attended");
    expect(
      assessBookingCancellation({ booking: freeRsvp({ addonRedeemedAt: new Date() }), experience: event(), now: NOW }).blockedReason,
    ).toBe("redeemed");
  });

  it("refuses once a commission or the event's payout has been paid", () => {
    expect(
      assessBookingCancellation({ booking: freeRsvp({ commissionStatus: "paid" }), experience: event(), now: NOW }).blockedReason,
    ).toBe("payout");
    expect(
      assessBookingCancellation({ booking: freeRsvp(), experience: event(), now: NOW, payoutLocked: true }).blockedReason,
    ).toBe("payout");
    expect(
      assessBookingCancellation({ booking: freeRsvp({ commissionStatus: "locked" }), experience: event(), now: NOW }).allowed,
    ).toBe(true);
  });

  it("falls back to EUR, as checkout does, for an event with no currency", () => {
    expect(assessBookingCancellation({ booking: freeRsvp(), experience: event({ currency: null }), now: NOW }).currency).toBe("eur");
  });
});

describe("bookingCancellationGate", () => {
  it("checks the reasons in a fixed order, inactive first", () => {
    const booking = freeRsvp({ status: "cancelled", attendanceStatus: "attended", commissionStatus: "paid" });
    expect(bookingCancellationGate({ booking, experience: event({ status: "cancelled" }), now: NOW })).toBe("inactive");
  });

  it("does not treat an undated event as started", () => {
    expect(bookingCancellationGate({ booking: freeRsvp(), experience: event({ startDate: null }), now: NOW })).toBeNull();
  });
});

describe("classifyBookingPayment", () => {
  it("reads a captured deposit as captured even while the status says pending", () => {
    expect(classifyBookingPayment(paid({ status: "pending", depositCapturedAt: new Date() }))).toBe("captured");
  });

  it("reads a paid balance on top of a held deposit as captured", () => {
    expect(classifyBookingPayment(paid({
      status: "pending",
      isDepositOnly: true,
      balancePaid: true,
      balancePaymentIntentId: "pi_balance",
    }))).toBe("captured");
  });

  it("ignores a saved-card SetupIntent in the balance column", () => {
    expect(classifyBookingPayment(paid({
      status: "deposit_authorized",
      isDepositOnly: true,
      balancePaid: true,
      balancePaymentIntentId: "seti_123",
    }))).toBe("held");
  });
});

describe("bookingPaidAmount", () => {
  it("adds a balance the webhook recorded beside the deposit", () => {
    expect(bookingPaidAmount({ amount: "20.00", isDepositOnly: true, balancePaid: true, balanceAmount: "80.00" })).toBe(100);
  });

  it("does not add a balance that is still owed", () => {
    expect(bookingPaidAmount({ amount: "20.00", isDepositOnly: true, balancePaid: false, balanceAmount: "80.00" })).toBe(20);
  });

  it("reads a balance paid through the confirm endpoint from amount alone", () => {
    expect(bookingPaidAmount({ amount: "100.00", isDepositOnly: false, balancePaid: true, balanceAmount: "0.00" })).toBe(100);
  });
});

describe("decideIntentCancellation", () => {
  it("cancels anything not yet captured", () => {
    for (const status of ["requires_payment_method", "requires_confirmation", "requires_action", "requires_capture"]) {
      expect(decideIntentCancellation(status, false, "manual")).toBe("cancel");
      expect(decideIntentCancellation(status, true, "automatic")).toBe("cancel");
    }
  });

  it("refunds a payment captured on payment only when the captured-refund rule allows it", () => {
    expect(decideIntentCancellation("succeeded", true, "automatic")).toBe("refund");
    expect(decideIntentCancellation("succeeded", true, "automatic_async")).toBe("refund");
    expect(decideIntentCancellation("succeeded", false, "automatic")).toBe("paid_final");
  });

  it("never refunds a hold that was captured, since only a formed group captures one", () => {
    // The event row can still read pending while the group run works through
    // its bookings, so the refund rule may say yes — the capture method wins.
    expect(decideIntentCancellation("succeeded", true, "manual")).toBe("paid_final");
    expect(decideIntentCancellation("succeeded", false, "manual")).toBe("paid_final");
  });

  it("keeps a captured payment whose capture method it cannot read", () => {
    expect(decideIntentCancellation("succeeded", true, undefined)).toBe("paid_final");
    expect(decideIntentCancellation("succeeded", true, null)).toBe("paid_final");
    expect(decideIntentCancellation("succeeded", true, "something_new")).toBe("paid_final");
  });

  it("refuses while a payment is processing or in a state it does not recognise", () => {
    expect(decideIntentCancellation("processing", true, "automatic")).toBe("processing");
    expect(decideIntentCancellation("something_new", true, "automatic")).toBe("processing");
  });

  it("does nothing for an intent that is already cancelled", () => {
    expect(decideIntentCancellation("canceled", true, "manual")).toBe("none");
  });
});

describe("isAutomaticallyCaptured", () => {
  it("recognises only Stripe's capture-on-payment methods", () => {
    expect(isAutomaticallyCaptured("automatic")).toBe(true);
    expect(isAutomaticallyCaptured("automatic_async")).toBe(true);
    expect(isAutomaticallyCaptured("manual")).toBe(false);
    expect(isAutomaticallyCaptured(undefined)).toBe(false);
  });
});

describe("isGroupBalanceHold", () => {
  const depositBooking = { stripePaymentIntentId: "pi_deposit", balancePaymentIntentId: "pi_balance" };
  const balance = (overrides: Record<string, unknown> = {}) => ({
    id: "pi_balance",
    status: "requires_capture",
    capture_method: "manual",
    ...overrides,
  });

  it("reads a live manual intent in the balance column as the group run's claim", () => {
    expect(isGroupBalanceHold(depositBooking, balance())).toBe(true);
    // Captured later, or failed to confirm off-session: still the run's.
    expect(isGroupBalanceHold(depositBooking, balance({ status: "succeeded" }))).toBe(true);
    expect(isGroupBalanceHold(depositBooking, balance({ status: "requires_payment_method" }))).toBe(true);
  });

  it("stops counting a hold once it has been canceled", () => {
    expect(isGroupBalanceHold(depositBooking, balance({ status: "canceled" }))).toBe(false);
  });

  it("never mistakes a balance the attendee pays themselves for the run's hold", () => {
    expect(isGroupBalanceHold(depositBooking, balance({ capture_method: "automatic", status: "requires_payment_method" }))).toBe(false);
    expect(isGroupBalanceHold(depositBooking, balance({ capture_method: "automatic_async", status: "succeeded" }))).toBe(false);
  });

  it("only looks at the balance column, never at the booking's own payment", () => {
    // A minimum-group hold on the main intent is the attendee's own payment.
    expect(isGroupBalanceHold(depositBooking, balance({ id: "pi_deposit" }))).toBe(false);
    expect(isGroupBalanceHold({ stripePaymentIntentId: "pi_same", balancePaymentIntentId: "pi_same" }, balance({ id: "pi_same" }))).toBe(false);
    // A saved-card SetupIntent in the balance column is not a payment at all.
    expect(isGroupBalanceHold({ stripePaymentIntentId: "pi_deposit", balancePaymentIntentId: "seti_1" }, balance({ id: "seti_1" }))).toBe(false);
    expect(isGroupBalanceHold({ stripePaymentIntentId: "pi_deposit", balancePaymentIntentId: null }, balance())).toBe(false);
    expect(isGroupBalanceHold(depositBooking, null)).toBe(false);
  });
});

describe("helpers", () => {
  it("knows which intents exist on Stripe", () => {
    expect(isLiveStripeIntentId("pi_123")).toBe(true);
    expect(isLiveStripeIntentId("pi_sandbox_123")).toBe(false);
    expect(isLiveStripeIntentId("seti_123")).toBe(false);
    expect(isLiveStripeIntentId(null)).toBe(false);
  });

  it("refunds captured money only for a forming minimum group", () => {
    const forming = { requireMinimumParticipants: true, mvgStatus: "pending" };
    expect(isCapturedPaymentRefundable(forming, { status: "fully_paid" })).toBe(true);
    expect(isCapturedPaymentRefundable(forming, { status: "pending" })).toBe(true);
    expect(isCapturedPaymentRefundable({ requireMinimumParticipants: true, mvgStatus: "met" }, { status: "fully_paid" })).toBe(false);
    expect(isCapturedPaymentRefundable({ requireMinimumParticipants: false, mvgStatus: "pending" }, { status: "fully_paid" })).toBe(false);
    expect(isCapturedPaymentRefundable(null, { status: "fully_paid" })).toBe(false);
  });

  it("never refunds a booking the group run has already confirmed", () => {
    expect(isCapturedPaymentRefundable({ requireMinimumParticipants: true, mvgStatus: "pending" }, { status: "confirmed" })).toBe(false);
  });

  it("never refunds a booking the group run has stamped as captured, whatever its status says now", () => {
    const forming = { requireMinimumParticipants: true, mvgStatus: "pending" };
    expect(isCapturedPaymentRefundable(forming, { status: "fully_paid", depositCapturedAt: "2026-10-01T00:00:00Z" })).toBe(false);
    expect(isCapturedPaymentRefundable(forming, { status: "fully_paid", depositCapturedAt: null })).toBe(true);
  });

  it("words the race and the stuck hold for the attendee", () => {
    expect(GROUP_CONFIRMED_DURING_CANCEL_MESSAGE).toMatch(/confirmed while you were cancelling/);
    expect(unreleasedHoldNotice("EUR 80.00")).toBe(
      "A hold of EUR 80.00 on your card couldn't be released right away; it will drop off automatically within about 7 days.",
    );
  });

  it("treats cancelled, refunded, failed and timestamped bookings as inactive", () => {
    expect(isBookingInactive({ status: "fully_paid", cancelledAt: null })).toBe(false);
    expect(isBookingInactive({ status: "failed", cancelledAt: null })).toBe(true);
    expect(isBookingInactive({ status: "confirmed", cancelledAt: "2026-10-01T00:00:00Z" })).toBe(true);
  });

  it("counts only a real cancellation as cancelled, not a failed payment", () => {
    expect(isBookingCancelled({ status: "cancelled", cancelledAt: null })).toBe(true);
    expect(isBookingCancelled({ status: "pending", cancelledAt: "2026-10-01T00:00:00Z" })).toBe(true);
    expect(isBookingCancelled({ status: "failed", cancelledAt: null })).toBe(false);
    expect(isBookingCancelled({ status: "deposit_paid", cancelledAt: null })).toBe(false);
  });

  it("has words for every refusal the endpoint can send", () => {
    for (const reason of ["inactive", "event_cancelled", "started", "attended", "redeemed", "payout", "paid_final"] as const) {
      expect(cancellationRefusalMessage(reason)).toEqual(expect.any(String));
    }
  });

  it("formats an amount the way the transactional emails do", () => {
    expect(formatCancellationAmount(12.5, "eur")).toBe("EUR 12.50");
  });
});

describe("lockedCancellationRefusal", () => {
  const forming = event({ requireMinimumParticipants: true, mvgStatus: "pending" });

  it("lets a refund through while the group is still forming", () => {
    expect(lockedCancellationRefusal({ booking: paid({ status: "fully_paid" }), experience: forming, refundPlanned: true })).toBeNull();
  });

  it("refuses a planned refund once the group has formed", () => {
    expect(lockedCancellationRefusal({
      booking: paid({ status: "fully_paid" }),
      experience: event({ requireMinimumParticipants: true, mvgStatus: "met" }),
      refundPlanned: true,
    })).toBe("paid_final");
  });

  it("refuses a planned refund on a booking the group run has confirmed", () => {
    expect(lockedCancellationRefusal({ booking: paid({ status: "confirmed" }), experience: forming, refundPlanned: true })).toBe("paid_final");
  });

  it("refuses a planned refund on a booking the group run has stamped as captured", () => {
    expect(lockedCancellationRefusal({
      booking: paid({ status: "fully_paid", depositCapturedAt: new Date("2026-10-01") }),
      experience: forming,
      refundPlanned: true,
    })).toBe("paid_final");
  });

  it("does not hold a released hold or a free place to the group's promise", () => {
    const formed = event({ requireMinimumParticipants: true, mvgStatus: "met" });
    expect(lockedCancellationRefusal({ booking: paid({ status: "pending" }), experience: formed, refundPlanned: false })).toBeNull();
    expect(lockedCancellationRefusal({ booking: freeRsvp(), experience: event(), refundPlanned: false })).toBeNull();
  });

  it("refuses when the event was called off or archived meanwhile", () => {
    for (const experience of [event({ status: "cancelled" }), event({ archivedAt: new Date() }), undefined]) {
      expect(lockedCancellationRefusal({ booking: freeRsvp(), experience, refundPlanned: false })).toBe("event_cancelled");
    }
  });

  it("refuses a booking that is gone or already inactive", () => {
    expect(lockedCancellationRefusal({ booking: undefined, experience: event(), refundPlanned: false })).toBe("inactive");
    expect(lockedCancellationRefusal({ booking: freeRsvp({ status: "cancelled" }), experience: event(), refundPlanned: false })).toBe("inactive");
  });
});
