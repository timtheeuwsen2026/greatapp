import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeFunction, routeResponse } from "../../tests/routeHarness";
import * as policy from "@shared/bookingCancellation";
import { isExperiencePayoutEligible, sumBookingPayoutGrossCents } from "../payoutRules";

/**
 * An attendee cancelling their own booking.
 *
 * The handler runs as written in routes.ts, against an in-memory booking row,
 * so every test can check not only the response but what was left behind: a
 * refusal must leave the booking exactly as it was, and a Stripe failure must
 * put it back.
 */

const FUTURE = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

let row: any;
let experience: any;
let payoutLocked: boolean;
let stripe: any;
let storage: any;
let settleCancelledBooking: ReturnType<typeof vi.fn>;
let clock: number;

function seed(booking: Record<string, unknown>, event: Record<string, unknown> = {}) {
  row = {
    id: "booking-1",
    userId: "attendee",
    experienceId: "event-1",
    status: "fully_paid",
    cancelledAt: null,
    attendanceStatus: "unknown",
    addonRedeemedAt: null,
    commissionStatus: null,
    stripePaymentIntentId: null,
    balancePaymentIntentId: null,
    depositCapturedAt: null,
    depositStatus: null,
    amount: "0.00",
    totalPrice: "0.00",
    isDepositOnly: false,
    balancePaid: true,
    balanceAmount: "0.00",
    ticketQuantity: 1,
    ...booking,
  };
  experience = {
    id: "event-1",
    title: "Sunrise Swim",
    status: "approved",
    archivedAt: null,
    startDate: FUTURE,
    endDate: FUTURE,
    currency: "eur",
    requireMinimumParticipants: false,
    mvgStatus: "pending",
    creatorId: "organiser",
    ...event,
  };
}

function intent(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "pi_live_1",
    status,
    // A hold is a manual-capture intent, as checkout makes it on a
    // minimum-group event. Anything else defaults to captured on payment, the
    // way a deposit taken upfront is; a test about a captured hold says so.
    capture_method: status === "requires_capture" ? "manual" : "automatic",
    amount: 4500,
    amount_capturable: status === "requires_capture" ? 4500 : 0,
    amount_received: status === "succeeded" ? 4500 : 0,
    currency: "eur",
    ...overrides,
  };
}

beforeEach(() => {
  payoutLocked = false;
  clock = Date.UTC(2026, 9, 6, 12);
  stripe = {
    paymentIntents: {
      retrieve: vi.fn(async (id: string) => intent("requires_capture", { id })),
      cancel: vi.fn(async (id: string) => ({ id, status: "canceled" })),
    },
    refunds: {
      create: vi.fn(async (params: any) => ({ id: "re_1", amount: 4500, payment_intent: params.payment_intent })),
    },
  };
  storage = {
    getBooking: vi.fn(async (id: string) => (row && row.id === id ? { ...row } : undefined)),
    getExperience: vi.fn(async () => ({ ...experience })),
    getPayoutLockedExperienceIds: vi.fn(async (ids: string[]) => new Set(payoutLocked ? ids : [])),
    // The same re-check the real one makes under its lock, against the rows
    // as they stand now rather than as the endpoint first read them.
    cancelActiveBooking: vi.fn(async (_id: string, _experienceId: string, options: any = {}) => {
      const refused = policy.lockedCancellationRefusal({
        booking: row,
        experience,
        refundPlanned: !!options.refundPlanned,
        holdReleasePlanned: !!options.holdReleasePlanned,
      });
      if (refused) return { booking: null, refused };
      // Each attempt gets its own moment, as two real requests would.
      clock += 1000;
      row = { ...row, status: "cancelled", cancelledAt: new Date(clock) };
      return { booking: { ...row }, refused: null };
    }),
    revertBookingCancellation: vi.fn(async (_id: string, previous: any) => {
      if (row.status !== "cancelled") return undefined;
      row = { ...row, status: previous.status, cancelledAt: previous.cancelledAt };
      return { ...row };
    }),
    restoreGroupCapturedBooking: vi.fn(async () => {
      if (row.status !== "cancelled") return undefined;
      row = { ...row, status: "confirmed", depositStatus: "captured", depositCapturedAt: new Date(clock), cancelledAt: null };
      return { ...row };
    }),
    updateBooking: vi.fn(async (_id: string, updates: any) => {
      row = { ...row, ...updates };
      return { ...row };
    }),
  };
  settleCancelledBooking = vi.fn(async () => {});
});

function cancelRoute(userId = "attendee") {
  const returnCancelledBookingPayment = routeFunction("returnCancelledBookingPayment", { stripe });
  return routeFunction("/api/bookings/:id/cancel", {
    storage,
    stripe,
    resolveCurrentUserId: () => userId,
    returnCancelledBookingPayment,
    settleCancelledBooking,
    ...policy,
  }, "post");
}

async function cancel(userId = "attendee", id = "booking-1") {
  const res = routeResponse();
  await cancelRoute(userId)({ params: { id } }, res);
  return res;
}

describe("POST /api/bookings/:id/cancel", () => {
  it("returns 404 for a booking that does not exist", async () => {
    seed({});
    const res = await cancel("attendee", "missing");
    expect(res.statusCode).toBe(404);
  });

  it("refuses anyone but the booking's owner", async () => {
    seed({});
    const res = await cancel("someone-else");
    expect(res.statusCode).toBe(403);
    expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
    expect(row.status).toBe("fully_paid");
  });

  it("cancels a free RSVP without calling Stripe", async () => {
    seed({});
    const res = await cancel();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ outcome: "cancelled", amountReturned: 0, currency: "eur", notice: null });
    expect(res.body.booking.status).toBe("cancelled");
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    // Nothing moved, so nothing is recorded as returned.
    expect(storage.updateBooking).not.toHaveBeenCalled();
    expect(settleCancelledBooking).toHaveBeenCalledWith(expect.objectContaining({ outcome: "cancelled", amountReturned: 0 }));
  });

  it("releases a card hold and says so", async () => {
    seed(
      { status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00", totalPrice: "45.00" },
      { requireMinimumParticipants: true },
    );
    const res = await cancel();
    expect(res.statusCode).toBe(200);
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(
      "pi_live_1",
      { cancellation_reason: "requested_by_customer" },
      { idempotencyKey: `booking-cancel:booking-1:pi_live_1:cancel:${row.cancelledAt.getTime()}` },
    );
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ outcome: "hold_released", amountReturned: 45, notice: null });
    expect(row).toMatchObject({ status: "cancelled", depositStatus: "refunded" });
  });

  it("treats a hold Stripe already cancelled as released", async () => {
    seed({ status: "deposit_authorized", stripePaymentIntentId: "pi_live_1", amount: "45.00" });
    stripe.paymentIntents.cancel.mockRejectedValueOnce(Object.assign(
      new Error("You cannot cancel this PaymentIntent because it has a status of canceled."),
      { code: "payment_intent_unexpected_state" },
    ));
    const res = await cancel();
    expect(res.statusCode).toBe(200);
    expect(res.body.outcome).toBe("hold_released");
    expect(row.status).toBe("cancelled");
  });

  it("refunds a captured payment while the minimum group is still forming", async () => {
    seed(
      { status: "fully_paid", stripePaymentIntentId: "pi_live_1", amount: "45.00" },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(intent("succeeded"));
    const res = await cancel();
    expect(res.statusCode).toBe(200);
    expect(storage.cancelActiveBooking).toHaveBeenCalledWith("booking-1", "event-1", { refundPlanned: true, holdReleasePlanned: false });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: "pi_live_1",
        reason: "requested_by_customer",
        metadata: { bookingId: "booking-1", source: "attendee_cancel" },
      },
      { idempotencyKey: `booking-cancel:booking-1:pi_live_1:refund:${row.cancelledAt.getTime()}` },
    );
    expect(res.body).toMatchObject({ outcome: "refunded", amountReturned: 45, currency: "eur" });
    expect(row).toMatchObject({ status: "cancelled", depositStatus: "refunded" });
  });

  it("decides from the live payment, not the stored status", async () => {
    // Stored as pending — which the preview reads as a hold — but Stripe has
    // already taken the money on an event with no minimum group.
    seed({ status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(intent("succeeded"));
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("paid_final");
    expect(row.status).toBe("pending");
  });

  it("keeps a paid ticket on an event without a minimum group, untouched", async () => {
    seed({ status: "fully_paid", stripePaymentIntentId: "pi_live_1", amount: "45.00" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(intent("succeeded"));
    const before = { ...row };
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "paid_final", message: expect.stringMatching(/final under our Terms/) });
    expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(row).toEqual(before);
  });

  it("keeps a payment the group run has already confirmed, even before the event reads met", async () => {
    seed(
      { status: "confirmed", stripePaymentIntentId: "pi_live_1", amount: "45.00", depositCapturedAt: new Date() },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(intent("succeeded"));
    const before = { ...row };
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("paid_final");
    expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(row).toEqual(before);
  });

  it("keeps a hold the group run captured, even once the webhook has rewritten it and the event still reads pending", async () => {
    // confirmMVGEvent captures the hold and confirms the booking; the
    // payment webhook then overwrites confirmed with fully_paid, and the event
    // is marked met only after every booking. Nothing in the rows says the
    // group has claimed this money — the manual capture does.
    seed(
      { status: "fully_paid", stripePaymentIntentId: "pi_live_1", amount: "45.00", totalPrice: "45.00" },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(intent("succeeded", { capture_method: "manual" }));
    const before = { ...row };
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "paid_final", message: expect.stringMatching(/final under our Terms/) });
    expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(settleCancelledBooking).not.toHaveBeenCalled();
    expect(row).toEqual(before);
  });

  it("refunds a deposit taken upfront while the group is still forming", async () => {
    seed(
      {
        status: "pending",
        stripePaymentIntentId: "pi_deposit",
        isDepositOnly: true,
        balancePaid: false,
        amount: "20.00",
        totalPrice: "100.00",
        balanceAmount: "80.00",
      },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(
      intent("succeeded", { id: "pi_deposit", amount: 2000, amount_received: 2000, capture_method: "automatic" }),
    );
    stripe.refunds.create.mockResolvedValueOnce({ id: "re_deposit", amount: 2000, status: "succeeded" });
    const res = await cancel();
    expect(res.statusCode).toBe(200);
    expect(storage.cancelActiveBooking).toHaveBeenCalledWith("booking-1", "event-1", { refundPlanned: true, holdReleasePlanned: false });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_deposit" }),
      expect.anything(),
    );
    expect(res.body).toMatchObject({ outcome: "refunded", amountReturned: 20, currency: "eur", notice: null });
    expect(row).toMatchObject({ status: "cancelled", depositStatus: "refunded" });
  });

  it("refuses the refund when the group run stamps the booking captured while Stripe is being asked", async () => {
    seed(
      { status: "pending", stripePaymentIntentId: "pi_deposit", isDepositOnly: true, balancePaid: false, amount: "20.00", balanceAmount: "80.00" },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    // The run's own write lands between the endpoint's read and its lock, and
    // the webhook has already rewritten the status — only the stamp is left.
    let stamped: any;
    stripe.paymentIntents.retrieve.mockImplementationOnce(async () => {
      row = { ...row, status: "fully_paid", depositCapturedAt: new Date() };
      stamped = { ...row };
      return intent("succeeded", { id: "pi_deposit", amount: 2000, amount_received: 2000 });
    });
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("paid_final");
    expect(storage.cancelActiveBooking).toHaveBeenCalledWith("booking-1", "event-1", { refundPlanned: true, holdReleasePlanned: false });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(row).toEqual(stamped);
  });

  it("agrees with the bookings list on a hold the group run captured, once the webhook has rewritten it and the event still reads pending", async () => {
    // As confirmMVGEvent's capture branch leaves it now: captured, confirmed
    // and stamped — then rewritten as fully_paid by the payment webhook, on
    // an event the run has not yet marked met.
    seed(
      {
        status: "fully_paid",
        stripePaymentIntentId: "pi_live_1",
        amount: "45.00",
        totalPrice: "45.00",
        depositStatus: "captured",
        depositCapturedAt: new Date(),
      },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(intent("succeeded", { capture_method: "manual" }));
    const preview = policy.assessBookingCancellation({ booking: row, experience, now: new Date() });
    const before = { ...row };

    const res = await cancel();

    expect(preview).toMatchObject({ allowed: false, mode: null, blockedReason: "paid_final" });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ code: preview.blockedReason, message: policy.cancellationRefusalMessage("paid_final") });
    expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
    expect(row).toEqual(before);
    // Without the stamp the list offered a refund the endpoint then refused.
    expect(policy.assessBookingCancellation({ booking: { ...row, depositCapturedAt: null }, experience, now: new Date() }))
      .toMatchObject({ allowed: true, mode: "money_back" });
  });

  describe("a deposit booking the group run has claimed by putting its balance on hold", () => {
    // confirmMVGEvent on an event whose deposit is taken upfront: the deposit
    // was captured at checkout, the run authorises the balance off-session —
    // a manual intent — and confirms the booking. The deposit's own
    // confirmation then lands late and rewrites confirmed as fully_paid, and
    // the event still reads pending: briefly while the run finishes, or for
    // good if completeMVGSuccess stopped part-way.
    const claimed = (overrides: Record<string, unknown> = {}) => seed(
      {
        status: "fully_paid",
        stripePaymentIntentId: "pi_deposit",
        balancePaymentIntentId: "pi_balance",
        isDepositOnly: true,
        balancePaid: false,
        amount: "20.00",
        totalPrice: "100.00",
        balanceAmount: "80.00",
        ...overrides,
      },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    const intents = (balanceStatus: string) => stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => (id === "pi_deposit"
      ? intent("succeeded", { id, amount: 2000, amount_received: 2000, capture_method: "automatic" })
      : intent(balanceStatus, {
        id,
        amount: 8000,
        amount_capturable: balanceStatus === "requires_capture" ? 8000 : 0,
        capture_method: "manual",
      })));

    it("refuses the whole cancel from the live hold alone, even on a row the run never stamped", async () => {
      // A booking claimed before the run stamped its claims: only Stripe
      // still knows the group took it.
      claimed();
      intents("requires_capture");
      const before = { ...row };

      const res = await cancel();

      expect(res.statusCode).toBe(409);
      expect(res.body).toMatchObject({ code: "paid_final", message: expect.stringMatching(/final under our Terms/) });
      expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
      expect(stripe.refunds.create).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(settleCancelledBooking).not.toHaveBeenCalled();
      expect(row).toEqual(before);
    });

    it("still refuses on the capture stamp once the hold has lapsed and says nothing any more", async () => {
      claimed({ depositStatus: "captured", depositCapturedAt: new Date() });
      intents("canceled");
      const before = { ...row };

      const res = await cancel();

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe("paid_final");
      expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
      expect(stripe.refunds.create).not.toHaveBeenCalled();
      expect(row).toEqual(before);
    });

    it("gives the bookings list the same answer as the endpoint", async () => {
      claimed({ depositStatus: "captured", depositCapturedAt: new Date() });
      intents("requires_capture");
      const preview = policy.assessBookingCancellation({ booking: row, experience, now: new Date() });

      const res = await cancel();

      expect(preview).toMatchObject({ allowed: false, blockedReason: "paid_final" });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe(preview.blockedReason);
    });

    it("does not mistake a balance the attendee is paying themselves for the group's hold", async () => {
      // pay-balance/create-intent makes an intent captured on payment. Left
      // unpaid, it holds nothing and is simply stopped.
      claimed({ status: "pending" });
      stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => (id === "pi_deposit"
        ? intent("succeeded", { id, amount: 2000, amount_received: 2000, capture_method: "automatic" })
        : intent("requires_payment_method", { id, amount: 8000, capture_method: "automatic" })));
      stripe.refunds.create.mockResolvedValueOnce({ id: "re_deposit", amount: 2000, status: "succeeded" });

      const res = await cancel();

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ outcome: "refunded", amountReturned: 20, notice: null });
      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_balance", expect.anything(), expect.anything());
      expect(row).toMatchObject({ status: "cancelled", depositStatus: "refunded" });
    });
  });

  it("refuses the refund when the group forms while Stripe is being asked", async () => {
    seed(
      { status: "fully_paid", stripePaymentIntentId: "pi_live_1", amount: "45.00" },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    // The success run finishes between the endpoint's first read and its
    // write: the event is met by the time the booking would be cancelled.
    stripe.paymentIntents.retrieve.mockImplementationOnce(async () => {
      experience = { ...experience, mvgStatus: "met" };
      return intent("succeeded");
    });
    const before = { ...row };
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: "paid_final", message: expect.stringMatching(/final under our Terms/) });
    expect(storage.cancelActiveBooking).toHaveBeenCalledWith("booking-1", "event-1", { refundPlanned: true, holdReleasePlanned: false });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(row).toEqual(before);
    expect(settleCancelledBooking).not.toHaveBeenCalled();
  });

  it("refuses when the event is called off while Stripe is being asked", async () => {
    seed(
      { status: "fully_paid", stripePaymentIntentId: "pi_live_1", amount: "45.00" },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockImplementationOnce(async () => {
      experience = { ...experience, status: "cancelled" };
      return intent("succeeded");
    });
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("event_cancelled");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(row.status).toBe("fully_paid");
  });

  it("refuses to release a hold the group run captured and stamped between the Stripe read and the lock", async () => {
    seed({ status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00" }, { requireMinimumParticipants: true });
    // The run captures the hold and stamps the booking right after our read
    // saw it still on hold; the webhook then rewrites the status.
    let stamped: any;
    stripe.paymentIntents.retrieve.mockImplementationOnce(async () => {
      const read = intent("requires_capture");
      row = { ...row, status: "fully_paid", depositStatus: "captured", depositCapturedAt: new Date() };
      stamped = { ...row };
      return read;
    });
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("paid_final");
    expect(storage.cancelActiveBooking).toHaveBeenCalledWith("booking-1", "event-1", { refundPlanned: false, holdReleasePlanned: true });
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(row).toEqual(stamped);
  });

  it("still cancels a free RSVP the scheduler stamped when the group confirmed", async () => {
    // processMVGSuccess runs markDepositAsCaptured on every eligible booking,
    // free places included, so a stamp alone must not lock a free RSVP in.
    seed(
      { status: "confirmed", depositStatus: "captured", depositCapturedAt: new Date() },
      { requireMinimumParticipants: true, mvgStatus: "met" },
    );
    const res = await cancel();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ outcome: "cancelled", amountReturned: 0 });
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(row.status).toBe("cancelled");
  });

  it("still releases a hold when the group forms meanwhile, since nothing was taken", async () => {
    seed({ status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00" }, { requireMinimumParticipants: true });
    stripe.paymentIntents.retrieve.mockImplementationOnce(async () => {
      experience = { ...experience, mvgStatus: "met" };
      return intent("requires_capture");
    });
    const res = await cancel();
    expect(res.statusCode).toBe(200);
    expect(storage.cancelActiveBooking).toHaveBeenCalledWith("booking-1", "event-1", { refundPlanned: false, holdReleasePlanned: true });
    expect(res.body.outcome).toBe("hold_released");
  });

  it("refuses while the payment is still processing", async () => {
    seed({ status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00" }, { requireMinimumParticipants: true });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(intent("processing"));
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ code: "processing", message: policy.PAYMENT_PROCESSING_MESSAGE });
    expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
    expect(row.status).toBe("pending");
  });

  it("puts the booking back and reports 502 when Stripe refuses the refund", async () => {
    seed(
      { status: "fully_paid", stripePaymentIntentId: "pi_live_1", amount: "45.00" },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(intent("succeeded"));
    stripe.refunds.create.mockRejectedValueOnce(Object.assign(new Error("Insufficient funds"), { code: "balance_insufficient" }));
    const res = await cancel();
    expect(res.statusCode).toBe(502);
    expect(res.body.message).not.toMatch(/refunded/i);
    expect(storage.revertBookingCancellation).toHaveBeenCalledWith("booking-1", { status: "fully_paid", cancelledAt: null });
    expect(row).toMatchObject({ status: "fully_paid", cancelledAt: null, depositStatus: null });
    expect(settleCancelledBooking).not.toHaveBeenCalled();
  });

  it("treats a refund Stripe hands back as failed or canceled as a failure, and puts the booking back", async () => {
    for (const status of ["failed", "canceled"]) {
      seed(
        { status: "fully_paid", stripePaymentIntentId: "pi_live_1", amount: "45.00" },
        { requireMinimumParticipants: true, mvgStatus: "pending" },
      );
      stripe.paymentIntents.retrieve.mockResolvedValueOnce(intent("succeeded"));
      stripe.refunds.create.mockResolvedValueOnce({ id: "re_bad", amount: 4500, status });
      const res = await cancel();
      expect(res.statusCode).toBe(502);
      expect(res.body.code).toBeUndefined();
      expect(row).toMatchObject({ status: "fully_paid", cancelledAt: null, depositStatus: null });
    }
    expect(settleCancelledBooking).not.toHaveBeenCalled();
  });

  it("keys a retry after a failure afresh, so Stripe does not replay the old error", async () => {
    seed(
      { status: "fully_paid", stripePaymentIntentId: "pi_live_1", amount: "45.00" },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockResolvedValue(intent("succeeded"));
    stripe.refunds.create.mockRejectedValueOnce(Object.assign(new Error("Connection reset"), { type: "StripeConnectionError" }));
    expect((await cancel()).statusCode).toBe(502);
    expect(row.status).toBe("fully_paid");

    const retry = await cancel();
    expect(retry.statusCode).toBe(200);
    const [first, second] = stripe.refunds.create.mock.calls.map((call: any[]) => call[1].idempotencyKey);
    expect(first).toMatch(/^booking-cancel:booking-1:pi_live_1:refund:\d+$/);
    expect(second).toBe(`booking-cancel:booking-1:pi_live_1:refund:${row.cancelledAt.getTime()}`);
    expect(second).not.toBe(first);
  });

  it("keeps the booking cancelled and says what is still owed when Stripe fails part-way", async () => {
    seed(
      {
        status: "fully_paid",
        stripePaymentIntentId: "pi_deposit",
        balancePaymentIntentId: "pi_balance",
        isDepositOnly: true,
        balancePaid: true,
        amount: "20.00",
        balanceAmount: "80.00",
      },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => (id === "pi_deposit"
      ? intent("succeeded", { id, amount: 2000, amount_received: 2000 })
      : intent("succeeded", { id, amount: 8000, amount_received: 8000 })));
    stripe.refunds.create
      .mockResolvedValueOnce({ id: "re_deposit", amount: 2000, status: "succeeded" })
      .mockRejectedValueOnce(Object.assign(new Error("Insufficient funds"), { code: "balance_insufficient" }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await cancel();

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({
      code: "partial_return",
      outcome: "refunded",
      amountReturned: 20,
      amountOutstanding: 80,
      currency: "eur",
      notice: null,
    });
    expect(res.body.message).toMatch(/cancelled and EUR 20\.00 has been returned/);
    expect(res.body.message).toMatch(/remaining EUR 80\.00/);
    // Not put back: some of the money has already gone, and a live booking
    // would be flipped to refunded by the webhook with nothing left to retry.
    expect(storage.revertBookingCancellation).not.toHaveBeenCalled();
    expect(row.status).toBe("cancelled");
    expect(row.cancelledAt).toBeInstanceOf(Date);
    // Not every intent that held money was returned, so the deposit is not
    // recorded as refunded: EUR 80.00 is still with the platform.
    expect(row.depositStatus).toBeNull();
    expect(storage.updateBooking).not.toHaveBeenCalled();
    expect(settleCancelledBooking).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "refunded",
      amountReturned: 20,
      amountOutstanding: 80,
      currency: "eur",
    }));
    const critical = errors.mock.calls.map((call) => String(call[0])).find((line) => line.includes("CRITICAL"));
    expect(critical).toContain("booking-1");
    expect(critical).toContain("pi_deposit");
    expect(critical).toContain("pi_balance");
    errors.mockRestore();
  });

  describe("when Stripe fails part-way, after some money has gone back", () => {
    const twoIntents = (status = "pending", overrides: Record<string, unknown> = {}) => seed(
      {
        status,
        stripePaymentIntentId: "pi_deposit",
        balancePaymentIntentId: "pi_balance",
        isDepositOnly: true,
        balancePaid: false,
        amount: "20.00",
        balanceAmount: "80.00",
        ...overrides,
      },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    const twoHolds = () => stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => intent("requires_capture", {
      id,
      amount: id === "pi_deposit" ? 2000 : 8000,
      amount_capturable: id === "pi_deposit" ? 2000 : 8000,
    }));
    let errors: ReturnType<typeof vi.spyOn>;
    let warnings: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      errors = vi.spyOn(console, "error").mockImplementation(() => {});
      warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      errors.mockRestore();
      warnings.mockRestore();
    });
    const logged = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((call: any[]) => call.map(String).join(" "));

    it("never gets as far as releasing anything when the balance is a hold the group run made", async () => {
      // Two holds would once have been released one by one. A balance on hold
      // is only ever the group run's claim, so the whole cancel is final.
      twoIntents();
      twoHolds();
      const before = { ...row };

      const res = await cancel();

      expect(res.statusCode).toBe(409);
      expect(res.body).toMatchObject({ code: "paid_final", message: expect.stringMatching(/final under our Terms/) });
      expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(row).toEqual(before);
    });

    // A deposit held on the card at checkout, and a balance the attendee paid
    // themselves — captured on payment. A balance on hold is never in these:
    // only the group run puts a balance on hold, and that claims the booking.
    const heldDepositPaidBalance = () => {
      twoIntents("pending", { balancePaid: true });
      stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => (id === "pi_balance"
        ? intent("succeeded", { id, amount: 8000, amount_received: 8000 })
        : intent("requires_capture", { id, amount: 2000, amount_capturable: 2000 })));
      stripe.refunds.create.mockResolvedValueOnce({ id: "re_balance", amount: 8000, status: "succeeded" });
    };

    it("answers with the real outcome and a notice when a hold will not release, since a hold is not money owed", async () => {
      heldDepositPaidBalance();
      stripe.paymentIntents.cancel
        .mockRejectedValueOnce(Object.assign(new Error("Rate limited"), { type: "StripeRateLimitError" }));

      const res = await cancel();

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        outcome: "refunded",
        amountReturned: 80,
        currency: "eur",
        notice: "A hold of EUR 20.00 on your card couldn't be released right away; it will drop off automatically within about 7 days.",
      });
      expect(res.body.code).toBeUndefined();
      expect(res.body.amountOutstanding).toBeUndefined();
      expect(row.status).toBe("cancelled");
      expect(storage.revertBookingCancellation).not.toHaveBeenCalled();
      // A hold is still out, so the deposit is not recorded as returned.
      expect(row.depositStatus).toBeNull();
      expect(settleCancelledBooking).toHaveBeenCalledWith(expect.objectContaining({
        outcome: "refunded",
        amountReturned: 80,
        notice: res.body.notice,
      }));
      expect(settleCancelledBooking.mock.calls[0][0].amountOutstanding).toBeUndefined();
      expect(logged(warnings).some((line) => line.includes("booking-1") && line.includes("pi_deposit") && line.includes("EUR 20.00"))).toBe(true);
      expect(logged(errors).some((line) => line.includes("CRITICAL"))).toBe(false);
    });

    it("still releases the holds after a refund, and says which hold is left", async () => {
      heldDepositPaidBalance();
      stripe.paymentIntents.cancel.mockRejectedValueOnce(Object.assign(new Error("Connection reset"), { type: "StripeConnectionError" }));

      const res = await cancel();

      expect(res.statusCode).toBe(200);
      // The refund goes first, and the hold is still attempted after it.
      expect(stripe.refunds.create.mock.invocationCallOrder[0])
        .toBeLessThan(stripe.paymentIntents.cancel.mock.invocationCallOrder[0]);
      expect(res.body).toMatchObject({ outcome: "refunded", amountReturned: 80, notice: expect.stringMatching(/hold of EUR 20\.00/) });
      expect(row).toMatchObject({ status: "cancelled", depositStatus: null });
    });

    it("flags a hold it could neither release nor read again, since the group run may have captured it", async () => {
      heldDepositPaidBalance();
      const reads: Record<string, number> = {};
      stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => {
        reads[id] = (reads[id] || 0) + 1;
        if (id === "pi_deposit" && reads[id] > 1) throw Object.assign(new Error("Request timed out"), { type: "StripeConnectionError" });
        return id === "pi_balance"
          ? intent("succeeded", { id, amount: 8000, amount_received: 8000 })
          : intent("requires_capture", { id, amount: 2000, amount_capturable: 2000 });
      });
      stripe.paymentIntents.cancel.mockRejectedValueOnce(Object.assign(new Error("Request timed out"), { type: "StripeConnectionError" }));

      const res = await cancel();

      // The attendee is told what is known; the hold is checked by a person.
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ outcome: "refunded", amountReturned: 80, notice: expect.stringMatching(/hold of EUR 20\.00/) });
      const critical = logged(errors).find((line) => line.includes("CRITICAL"));
      expect(critical).toContain("booking-1");
      expect(critical).toContain("pi_deposit");
      expect(critical).toMatch(/by hand/);
    });

    it("answers normally when the intent that failed held nothing", async () => {
      // A balance payment the attendee started but never paid: cancelling it
      // only stops it completing later, so its failure costs them nothing.
      twoIntents();
      stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => (id === "pi_deposit"
        ? intent("succeeded", { id, amount: 2000, amount_received: 2000 })
        : intent("requires_payment_method", { id, amount: 8000 })));
      stripe.refunds.create.mockResolvedValueOnce({ id: "re_deposit", amount: 2000, status: "succeeded" });
      stripe.paymentIntents.cancel.mockRejectedValueOnce(Object.assign(new Error("Connection reset"), { type: "StripeConnectionError" }));

      const res = await cancel();

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ outcome: "refunded", amountReturned: 20, notice: null });
      // Every intent that held money was returned.
      expect(row).toMatchObject({ status: "cancelled", depositStatus: "refunded" });
      expect(logged(warnings).some((line) => line.includes("pi_balance") && line.includes("held no money"))).toBe(true);
      expect(logged(errors).some((line) => line.includes("CRITICAL"))).toBe(false);
    });

  });

  it("stops at a refused refund before touching a hold, and puts the booking back", async () => {
    seed(
      {
        status: "pending",
        stripePaymentIntentId: "pi_deposit",
        balancePaymentIntentId: "pi_balance",
        isDepositOnly: true,
        balancePaid: true,
        amount: "20.00",
        balanceAmount: "80.00",
      },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => (id === "pi_balance"
      ? intent("succeeded", { id, amount: 8000, amount_received: 8000 })
      : intent("requires_capture", { id, amount: 2000, amount_capturable: 2000 })));
    stripe.refunds.create.mockRejectedValueOnce(Object.assign(new Error("Insufficient funds"), { code: "balance_insufficient" }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await cancel();

    // Nothing had gone back when the refund failed, so the hold is left as it
    // was and the booking with it: the attendee can simply try again.
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBeUndefined();
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: "pending", cancelledAt: null, depositStatus: null });
    errors.mockRestore();
  });

  it("puts the booking back when the only hold cannot be released", async () => {
    seed({ status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00" }, { requireMinimumParticipants: true });
    stripe.paymentIntents.cancel.mockRejectedValueOnce(Object.assign(new Error("Connection reset"), { type: "StripeConnectionError" }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await cancel();
    expect(res.statusCode).toBe(502);
    expect(res.body.message).toMatch(/has not been cancelled/);
    expect(storage.revertBookingCancellation).toHaveBeenCalledWith("booking-1", { status: "pending", cancelledAt: null });
    expect(row).toMatchObject({ status: "pending", cancelledAt: null, depositStatus: null });
    expect(settleCancelledBooking).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  describe("when the group run captures the hold while it is being released", () => {
    const capturedMidCancel = () => Object.assign(
      new Error("This PaymentIntent's status is succeeded, but it must be one of requires_payment_method, requires_capture, requires_confirmation, requires_action, processing."),
      { code: "payment_intent_unexpected_state", payment_intent: { id: "pi_live_1", status: "succeeded" } },
    );
    let warnings: ReturnType<typeof vi.spyOn>;
    let errors: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
      errors = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      warnings.mockRestore();
      errors.mockRestore();
    });

    it("keeps the booking as captured and confirmed, and says the payment is now final", async () => {
      seed(
        { status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00", totalPrice: "45.00" },
        { requireMinimumParticipants: true, mvgStatus: "pending" },
      );
      stripe.paymentIntents.retrieve
        .mockResolvedValueOnce(intent("requires_capture"))
        .mockResolvedValueOnce(intent("succeeded", { capture_method: "manual", amount_received: 4500 }));
      stripe.paymentIntents.cancel.mockRejectedValueOnce(capturedMidCancel());

      const res = await cancel();

      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ code: "paid_final", message: policy.GROUP_CONFIRMED_DURING_CANCEL_MESSAGE });
      // Asked again rather than trusted from the error.
      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(2);
      expect(storage.restoreGroupCapturedBooking).toHaveBeenCalledWith("booking-1");
      expect(storage.revertBookingCancellation).not.toHaveBeenCalled();
      expect(row).toMatchObject({ status: "confirmed", depositStatus: "captured", cancelledAt: null });
      expect(row.depositCapturedAt).toBeInstanceOf(Date);
      expect(stripe.refunds.create).not.toHaveBeenCalled();
      expect(settleCancelledBooking).not.toHaveBeenCalled();
    });

    it("leaves the booking cancelled and flags the money when something else had already gone back", async () => {
      // A deposit held at checkout and a balance the attendee paid
      // themselves. The balance is refunded first; the deposit hold is then
      // captured by the group run before it can be released.
      seed(
        {
          status: "pending",
          stripePaymentIntentId: "pi_deposit",
          balancePaymentIntentId: "pi_balance",
          isDepositOnly: true,
          balancePaid: true,
          amount: "20.00",
          balanceAmount: "80.00",
        },
        { requireMinimumParticipants: true, mvgStatus: "pending" },
      );
      const reads: Record<string, number> = {};
      stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => {
        reads[id] = (reads[id] || 0) + 1;
        if (id === "pi_balance") return intent("succeeded", { id, amount: 8000, amount_received: 8000 });
        return reads[id] > 1
          ? intent("succeeded", { id, amount: 2000, amount_received: 2000, capture_method: "manual" })
          : intent("requires_capture", { id, amount: 2000, amount_capturable: 2000 });
      });
      stripe.refunds.create.mockResolvedValueOnce({ id: "re_balance", amount: 8000, status: "succeeded" });
      stripe.paymentIntents.cancel.mockRejectedValueOnce(capturedMidCancel());

      const res = await cancel();

      expect(res.statusCode).toBe(502);
      expect(res.body).toMatchObject({
        code: "partial_return",
        outcome: "refunded",
        amountReturned: 80,
        amountOutstanding: 20,
        notice: null,
      });
      expect(storage.restoreGroupCapturedBooking).not.toHaveBeenCalled();
      expect(row).toMatchObject({ status: "cancelled", depositStatus: null });
      const critical = errors.mock.calls.map((call: any[]) => String(call[0])).find((line: string) => line.includes("CRITICAL"));
      expect(critical).toContain("pi_deposit");
      expect(critical).toContain("captured by the group run");
    });

    it("counts the hold as released when Stripe says it was canceled after all", async () => {
      seed({ status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00" }, { requireMinimumParticipants: true });
      stripe.paymentIntents.retrieve
        .mockResolvedValueOnce(intent("requires_capture"))
        .mockResolvedValueOnce(intent("canceled"));
      stripe.paymentIntents.cancel.mockRejectedValueOnce(Object.assign(new Error("Unexpected state"), { code: "payment_intent_unexpected_state" }));

      const res = await cancel();

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ outcome: "hold_released", amountReturned: 45, notice: null });
      expect(row).toMatchObject({ status: "cancelled", depositStatus: "refunded" });
    });
  });

  describe("when releasing a hold fails for a reason that says nothing about its state", () => {
    const failuresThatSayNothing: Array<[string, () => Error]> = [
      ["a rate limit", () => Object.assign(new Error("Too many requests"), { type: "StripeRateLimitError", code: "rate_limit" })],
      ["a lock timeout", () => Object.assign(
        new Error("This object cannot be accessed right now because another API request or Stripe process is currently accessing it."),
        { type: "StripeRateLimitError", code: "lock_timeout" },
      )],
      ["a request timeout", () => Object.assign(
        new Error("Request aborted due to timeout being reached (80000ms)"),
        { type: "StripeConnectionError" },
      )],
    ];
    const singleHold = () => seed(
      { status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00", totalPrice: "45.00" },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    // A deposit held at checkout and a balance the attendee paid themselves.
    const heldDepositPaidBalance = () => seed(
      {
        status: "pending",
        stripePaymentIntentId: "pi_deposit",
        balancePaymentIntentId: "pi_balance",
        isDepositOnly: true,
        balancePaid: true,
        amount: "20.00",
        balanceAmount: "80.00",
      },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    let warnings: ReturnType<typeof vi.spyOn>;
    let errors: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
      errors = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      warnings.mockRestore();
      errors.mockRestore();
    });
    const criticalLines = () => errors.mock.calls.map((call: any[]) => call.map(String).join(" ")).filter((line: string) => line.includes("CRITICAL"));

    it.each(failuresThatSayNothing)("asks Stripe again after %s, and keeps a hold the group run captured meanwhile", async (_label, makeError) => {
      singleHold();
      stripe.paymentIntents.retrieve
        .mockResolvedValueOnce(intent("requires_capture"))
        .mockResolvedValueOnce(intent("succeeded", { capture_method: "manual", amount_received: 4500 }));
      stripe.paymentIntents.cancel.mockRejectedValueOnce(makeError());

      const res = await cancel();

      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ code: "paid_final", message: policy.GROUP_CONFIRMED_DURING_CANCEL_MESSAGE });
      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(2);
      expect(storage.restoreGroupCapturedBooking).toHaveBeenCalledWith("booking-1");
      expect(storage.revertBookingCancellation).not.toHaveBeenCalled();
      expect(row).toMatchObject({ status: "confirmed", depositStatus: "captured", cancelledAt: null });
      expect(row.depositCapturedAt).toBeInstanceOf(Date);
      expect(settleCancelledBooking).not.toHaveBeenCalled();
    });

    it("counts the hold as released when the timed-out cancel went through after all", async () => {
      singleHold();
      stripe.paymentIntents.retrieve
        .mockResolvedValueOnce(intent("requires_capture"))
        .mockResolvedValueOnce(intent("canceled", { capture_method: "manual" }));
      stripe.paymentIntents.cancel.mockRejectedValueOnce(failuresThatSayNothing[2][1]());

      const res = await cancel();

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ outcome: "hold_released", amountReturned: 45, notice: null });
      expect(storage.revertBookingCancellation).not.toHaveBeenCalled();
      expect(row).toMatchObject({ status: "cancelled", depositStatus: "refunded" });
    });

    it("puts the booking back as before and flags the hold when Stripe cannot be asked again", async () => {
      singleHold();
      stripe.paymentIntents.retrieve
        .mockResolvedValueOnce(intent("requires_capture"))
        .mockRejectedValueOnce(Object.assign(new Error("Request timed out"), { type: "StripeConnectionError" }));
      stripe.paymentIntents.cancel.mockRejectedValueOnce(failuresThatSayNothing[0][1]());

      const res = await cancel();

      expect(res.statusCode).toBe(502);
      expect(res.body.message).toMatch(/has not been cancelled/);
      expect(storage.revertBookingCancellation).toHaveBeenCalledWith("booking-1", { status: "pending", cancelledAt: null });
      expect(storage.restoreGroupCapturedBooking).not.toHaveBeenCalled();
      expect(row).toMatchObject({ status: "pending", cancelledAt: null, depositStatus: null });
      const [critical] = criticalLines();
      expect(critical).toContain("pi_live_1");
      expect(critical).toContain("booking-1");
      expect(critical).toMatch(/by hand/);
    });

    it("reads a hold it never reached after a refused refund, and keeps it if the group run captured it", async () => {
      heldDepositPaidBalance();
      const reads: Record<string, number> = {};
      stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => {
        reads[id] = (reads[id] || 0) + 1;
        if (id === "pi_balance") return intent("succeeded", { id, amount: 8000, amount_received: 8000 });
        return reads[id] > 1
          ? intent("succeeded", { id, amount: 2000, amount_received: 2000, capture_method: "manual" })
          : intent("requires_capture", { id, amount: 2000, amount_capturable: 2000 });
      });
      stripe.refunds.create.mockRejectedValueOnce(Object.assign(new Error("Insufficient funds"), { code: "balance_insufficient" }));

      const res = await cancel();

      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ code: "paid_final", message: policy.GROUP_CONFIRMED_DURING_CANCEL_MESSAGE });
      expect(reads.pi_deposit).toBe(2);
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(storage.restoreGroupCapturedBooking).toHaveBeenCalledWith("booking-1");
      expect(storage.revertBookingCancellation).not.toHaveBeenCalled();
      expect(row).toMatchObject({ status: "confirmed", depositStatus: "captured", cancelledAt: null });
    });

    it("puts the booking back and flags a hold it never reached when Stripe cannot be asked about it", async () => {
      heldDepositPaidBalance();
      const reads: Record<string, number> = {};
      stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => {
        reads[id] = (reads[id] || 0) + 1;
        if (id === "pi_balance") return intent("succeeded", { id, amount: 8000, amount_received: 8000 });
        if (reads[id] > 1) throw Object.assign(new Error("Too many requests"), { type: "StripeRateLimitError", code: "rate_limit" });
        return intent("requires_capture", { id, amount: 2000, amount_capturable: 2000 });
      });
      stripe.refunds.create.mockRejectedValueOnce(Object.assign(new Error("Insufficient funds"), { code: "balance_insufficient" }));

      const res = await cancel();

      expect(res.statusCode).toBe(502);
      expect(storage.revertBookingCancellation).toHaveBeenCalledWith("booking-1", { status: "pending", cancelledAt: null });
      expect(row).toMatchObject({ status: "pending", cancelledAt: null, depositStatus: null });
      expect(criticalLines().some((line: string) => line.includes("pi_deposit") && line.includes("booking-1"))).toBe(true);
    });
  });

  it("returns 502 without touching anything when Stripe cannot be read", async () => {
    seed({ status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00" });
    stripe.paymentIntents.retrieve.mockRejectedValueOnce(new Error("connection reset"));
    const res = await cancel();
    expect(res.statusCode).toBe(502);
    expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
    expect(row.status).toBe("pending");
  });

  it("answers a second cancel with 409 inactive", async () => {
    seed({});
    expect((await cancel()).statusCode).toBe(200);
    const second = await cancel();
    expect(second.statusCode).toBe(409);
    expect(second.body.code).toBe("inactive");
    expect(settleCancelledBooking).toHaveBeenCalledTimes(1);
  });

  it("answers 409 inactive when a concurrent request wins the guarded update", async () => {
    seed({ status: "pending", stripePaymentIntentId: "pi_live_1", amount: "45.00" });
    storage.cancelActiveBooking.mockResolvedValueOnce({ booking: null, refused: "inactive" });
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("inactive");
    // Lost the race, so it must not release a hold the winner is handling.
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it("refuses once the event has started", async () => {
    seed({}, { startDate: PAST });
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("started");
    expect(res.body.message).toEqual(expect.any(String));
    expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
  });

  it("refuses once the event's payout is in flight", async () => {
    seed({});
    payoutLocked = true;
    const res = await cancel();
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("payout");
  });

  it("handles a deposit and its paid balance together", async () => {
    seed(
      {
        status: "pending",
        stripePaymentIntentId: "pi_deposit",
        balancePaymentIntentId: "pi_balance",
        isDepositOnly: true,
        balancePaid: true,
        amount: "20.00",
        balanceAmount: "80.00",
      },
      { requireMinimumParticipants: true, mvgStatus: "pending" },
    );
    stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => (id === "pi_deposit"
      ? intent("requires_capture", { id, amount: 2000, amount_capturable: 2000 })
      : intent("succeeded", { id, amount: 8000, amount_received: 8000 })));
    stripe.refunds.create.mockResolvedValueOnce({ id: "re_2", amount: 8000 });
    const res = await cancel();
    expect(res.statusCode).toBe(200);
    // The refund goes first, so a refusal there leaves the hold untouched.
    expect(stripe.refunds.create.mock.invocationCallOrder[0])
      .toBeLessThan(stripe.paymentIntents.cancel.mock.invocationCallOrder[0]);
    expect(res.body).toMatchObject({ outcome: "refunded", amountReturned: 100 });
  });

  it("skips sandbox intents and follows the stored fields", async () => {
    seed({ status: "pending", stripePaymentIntentId: "pi_sandbox_123", amount: "45.00" }, { requireMinimumParticipants: true });
    const res = await cancel();
    expect(res.statusCode).toBe(200);
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(res.body.outcome).toBe("cancelled");
  });
});

describe("settleCancelledBooking", () => {
  function settle(overrides: Record<string, any> = {}) {
    const deps = {
      updateCommissionStatus: vi.fn(async () => {}),
      storage: {
        releaseDiscountLinkRedemption: vi.fn(async () => {}),
        getScheduledPayoutByExperience: vi.fn(async () => ({ id: "payout-1", status: "pending" })),
        getPaidBookings: vi.fn(async () => [{ status: "fully_paid", amount: "30.00", totalPrice: "30.00" }]),
        getUser: vi.fn(async (id: string) => ({ id, email: `${id}@example.test`, firstName: id === "attendee" ? "Ana" : "Olu", lastName: "Silva" })),
        getMVGProgress: vi.fn(async () => ({ current_participants: 4, minimum_participants: 6, mvg_met: false })),
        getExperienceParticipantAvatars: vi.fn(async () => []),
      },
      sumBookingPayoutGrossCents,
      PAYOUT_COUNTED_BOOKING_STATUSES: policy.PAYOUT_COUNTED_BOOKING_STATUSES,
      isExperiencePayoutEligible,
      scheduleExperiencePayout: vi.fn(async () => {}),
      notificationService: {
        sendBookingCancelledEmail: vi.fn(async () => ({ success: true })),
        sendBookingCancelledOrganiserEmail: vi.fn(async () => ({ success: true })),
      },
      formatCancellationAmount: policy.formatCancellationAmount,
      computeLifecycleStatus: routeFunction("computeLifecycleStatus", {}),
      broadcastMVGUpdate: vi.fn(),
      ...overrides,
    };
    return { deps, run: routeFunction("settleCancelledBooking", deps) };
  }

  const cancelledBooking = {
    id: "booking-1",
    userId: "attendee",
    experienceId: "event-1",
    status: "fully_paid",
    amount: "45.00",
    totalPrice: "45.00",
    commissionStatus: "estimated",
    discountLinkId: "link-1",
    ticketQuantity: 2,
  };

  it("voids the commission, gives the discount back and refreshes a pending payout's gross", async () => {
    const { deps, run } = settle();
    const formedEvent = {
      id: "event-1", title: "Sunrise Swim", status: "approved", price: "45.00", creatorId: "organiser",
      endDate: FUTURE, requireMinimumParticipants: true, mvgEnabled: true, mvgStatus: "met",
    };
    await run({ booking: cancelledBooking, experience: formedEvent, outcome: "hold_released", amountReturned: 45, currency: "eur" });

    expect(deps.updateCommissionStatus).toHaveBeenCalledWith("booking-1", "voided");
    expect(deps.storage.releaseDiscountLinkRedemption).toHaveBeenCalledWith("link-1");
    expect(deps.scheduleExperiencePayout).toHaveBeenCalledWith("event-1", new Date(FUTURE), 3000);

    // A group that has formed stays formed when one person leaves.
    expect(deps.broadcastMVGUpdate).toHaveBeenCalledWith(expect.objectContaining({
      trip_id: "event-1", seats_taken: 4, mvg_met: true, lifecycle_status: "confirmed", funded_percent: 100,
    }));

    await vi.waitFor(() => expect(deps.notificationService.sendBookingCancelledOrganiserEmail).toHaveBeenCalled());
    expect(deps.notificationService.sendBookingCancelledEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "attendee@example.test", outcome: "hold_released", amountLabel: "EUR 45.00", bookingId: "booking-1",
    }));
    expect(deps.notificationService.sendBookingCancelledOrganiserEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "organiser@example.test", attendeeName: "Ana S.", ticketQuantity: 2,
    }));
  });

  it("leaves a payout that is already paying, and a free RSVP's preset gross, alone", async () => {
    const { deps, run } = settle();
    deps.storage.getScheduledPayoutByExperience.mockResolvedValueOnce({ id: "payout-1", status: "processing" });
    const event = { id: "event-1", title: "Swim", status: "approved", price: "0", endDate: FUTURE, requireMinimumParticipants: false, mvgEnabled: false, mvgStatus: "pending" };
    await run({ booking: cancelledBooking, experience: event, outcome: "refunded", amountReturned: 45, currency: "eur" });
    await run({ booking: { ...cancelledBooking, amount: "0.00", totalPrice: "0.00" }, experience: event, outcome: "cancelled", amountReturned: 0, currency: "eur" });
    expect(deps.scheduleExperiencePayout).not.toHaveBeenCalled();
  });

  it("keeps going when a bookkeeping step fails", async () => {
    const { deps, run } = settle({ updateCommissionStatus: vi.fn(async () => { throw new Error("db down"); }) });
    const event = { id: "event-1", title: "Swim", status: "approved", price: "45", endDate: FUTURE, requireMinimumParticipants: true, mvgStatus: "pending" };
    await expect(run({ booking: cancelledBooking, experience: event, outcome: "refunded", amountReturned: 45, currency: "eur" })).resolves.toBeUndefined();
    expect(deps.storage.releaseDiscountLinkRedemption).toHaveBeenCalled();
    expect(deps.broadcastMVGUpdate).toHaveBeenCalledWith(expect.objectContaining({ lifecycle_status: "forming", mvg_met: false }));
  });
});
