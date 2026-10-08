import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeFunction, routeResponse } from "../../tests/routeHarness";
import { isBookingCancelled } from "@shared/bookingCancellation";
import { normalizeCurrency } from "../impactLedger";

/**
 * The places outside the cancel endpoint that must respect a cancellation:
 * paying a balance, and the group-success run confirming its bookings. Each
 * runs as written in routes.ts against an in-memory booking row.
 */

let row: any;
let stripe: any;
let storage: any;

function seedBooking(overrides: Record<string, unknown> = {}) {
  row = {
    id: "booking-1",
    userId: "attendee",
    experienceId: "event-1",
    status: "deposit_paid",
    cancelledAt: null,
    stripePaymentIntentId: "pi_deposit",
    balancePaymentIntentId: null,
    isDepositOnly: true,
    balancePaid: false,
    balanceAmount: "80.00",
    depositAmount: "20.00",
    amount: "20.00",
    totalPrice: "100.00",
    ...overrides,
  };
}

const event = {
  id: "event-1",
  currency: "eur",
  requireMinimumParticipants: false,
  escrowEnabled: false,
  startDate: new Date("2026-11-20T00:00:00Z"),
  balanceDueDays: 7,
};

beforeEach(() => {
  stripe = {
    paymentIntents: {
      create: vi.fn(async (params: any) => ({ id: "pi_balance_new", client_secret: "secret_1", ...params })),
      retrieve: vi.fn(),
      capture: vi.fn(async (id: string) => ({ id, status: "succeeded" })),
      cancel: vi.fn(async (id: string) => ({ id, status: "canceled" })),
    },
  };
  storage = {
    getBooking: vi.fn(async (id: string) => (row && row.id === id ? { ...row } : undefined)),
    getExperience: vi.fn(async () => ({ ...event })),
    updateBooking: vi.fn(async (_id: string, updates: any) => {
      row = { ...row, ...updates };
      return { ...row };
    }),
  };
});

describe("paying the balance on a booking", () => {
  const createIntent = () => routeFunction("/api/bookings/:id/pay-balance/create-intent", {
    storage, stripe, isBookingCancelled,
  }, "post");
  const confirm = () => routeFunction("/api/bookings/:id/pay-balance/confirm", {
    storage, stripe, isBookingCancelled,
  }, "post");
  const request = (body: Record<string, unknown> = {}) => ({
    user: { claims: { sub: "attendee" } },
    params: { id: "booking-1" },
    body,
  });

  it("lets an attendee whose balance card was declined try again with another card", async () => {
    // A declined balance marks the whole booking failed. That is not a
    // cancellation, and refusing here would leave them no way to pay.
    seedBooking({ status: "failed" });
    const res = routeResponse();
    await createIntent()(request(), res);
    expect(res.statusCode).toBe(200);
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 8000, currency: "eur" }));
    expect(row.balancePaymentIntentId).toBe("pi_balance_new");
  });

  it("records the retried payment on a failed booking rather than refusing after the money was taken", async () => {
    seedBooking({ status: "failed", balancePaymentIntentId: "pi_balance_new" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({
      id: "pi_balance_new",
      status: "succeeded",
      amount: 8000,
      currency: "eur",
      metadata: { bookingId: "booking-1" },
    });
    const res = routeResponse();
    await confirm()(request({ paymentIntentId: "pi_balance_new" }), res);
    expect(res.statusCode).toBe(200);
    expect(row).toMatchObject({ balancePaid: true, status: "fully_paid", amount: "100" });
  });

  it("refuses a booking the attendee cancelled, by status or by timestamp", async () => {
    for (const overrides of [{ status: "cancelled" }, { status: "deposit_paid", cancelledAt: new Date() }]) {
      seedBooking(overrides);
      const before = { ...row };

      const created = routeResponse();
      await createIntent()(request(), created);
      expect(created.statusCode).toBe(409);

      const confirmed = routeResponse();
      await confirm()(request({ paymentIntentId: "pi_balance_new" }), confirmed);
      expect(confirmed.statusCode).toBe(409);

      expect(row).toEqual(before);
    }
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(storage.updateBooking).not.toHaveBeenCalled();
  });

  it("refuses a refunded booking, so a failed group or an organiser refund is never charged the balance", async () => {
    seedBooking({ status: "refunded", cancelledAt: null });
    const before = { ...row };

    const created = routeResponse();
    await createIntent()(request(), created);
    expect(created.statusCode).toBe(409);

    const confirmed = routeResponse();
    await confirm()(request({ paymentIntentId: "pi_balance_new" }), confirmed);
    expect(confirmed.statusCode).toBe(409);

    expect(row).toEqual(before);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(storage.updateBooking).not.toHaveBeenCalled();
  });
});

describe("capturing deposits once the group has formed", () => {
  let captureStorage: any;
  const listed = () => [{ ...row, status: "deposit_authorized", cancelledAt: null }];

  beforeEach(() => {
    captureStorage = {
      getExperience: vi.fn(async () => ({ ...event, requireMinimumParticipants: true })),
      getMVGProgress: vi.fn(async () => ({ current_participants: 6, minimum_participants: 6, mvg_met: true })),
      // Read once, before the loop: whatever happens to a booking afterwards,
      // the list still shows it as it was.
      getEligibleDepositsForCapture: vi.fn(async () => listed()),
      getBooking: storage.getBooking,
      markDepositAsCaptured: vi.fn(async () => {
        if (row.cancelledAt || ["cancelled", "refunded"].includes(row.status)) return undefined;
        row = { ...row, status: "confirmed", depositStatus: "captured", depositCapturedAt: new Date() };
        return { ...row };
      }),
      updateExperienceMVGStatus: vi.fn(async () => ({})),
    };
  });

  const run = async () => {
    const res = routeResponse();
    await routeFunction("/api/experiences/:id/capture-deposits", {
      storage: captureStorage,
      stripe,
      lockCommissionsForExperience: vi.fn(async () => {}),
    }, "post")({ params: { id: "event-1" }, user: { claims: { sub: "organiser" } } }, res);
    return res;
  };

  it("does not capture a booking cancelled after the list was read, even with its hold still on the card", async () => {
    // The attendee cancelled, and their hold could not be released — it is
    // left to lapse on its own. Capturing it would take money for a place
    // they gave up.
    seedBooking({ status: "cancelled", cancelledAt: new Date(), depositAmount: "20.00" });
    const before = { ...row };
    const res = await run();
    expect(res.statusCode).toBe(200);
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    expect(captureStorage.markDepositAsCaptured).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ captured: 0 });
    expect(res.body.captureLog).toEqual([expect.objectContaining({ bookingId: "booking-1", status: "skipped" })]);
    expect(row).toEqual(before);
  });

  it("captures and confirms an active deposit, as before", async () => {
    seedBooking({ status: "deposit_authorized", depositAmount: "20.00" });
    const res = await run();
    expect(stripe.paymentIntents.capture).toHaveBeenCalledWith("pi_deposit", { amount_to_capture: 2000 });
    expect(res.body).toMatchObject({ captured: 1 });
    expect(row).toMatchObject({ status: "confirmed", depositStatus: "captured" });
  });

  it("flags a capture that landed on a booking cancelled at that very moment", async () => {
    seedBooking({ status: "deposit_authorized", depositAmount: "20.00" });
    stripe.paymentIntents.capture.mockImplementationOnce(async (id: string) => {
      row = { ...row, status: "cancelled", cancelledAt: new Date() };
      return { id, status: "succeeded" };
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await run();
    expect(res.body).toMatchObject({ captured: 0 });
    expect(row.status).toBe("cancelled");
    expect(errors.mock.calls.some((call) => String(call[0]).includes("CRITICAL") && String(call[0]).includes("booking-1"))).toBe(true);
    errors.mockRestore();
  });
});

describe("confirmMVGEvent", () => {
  let mvgStorage: any;

  beforeEach(() => {
    mvgStorage = {
      getExperience: vi.fn(async () => ({ ...event, requireMinimumParticipants: true })),
      getBooking: storage.getBooking,
      confirmActiveBooking: vi.fn(async () => {
        if (row.cancelledAt || ["cancelled", "refunded", "failed"].includes(row.status)) return undefined;
        row = { ...row, status: "confirmed" };
        return { ...row };
      }),
      updateBookingBalancePayment: vi.fn(async (_id: string, balancePaymentIntentId: string) => {
        if (row.cancelledAt || ["cancelled", "refunded", "failed"].includes(row.status)) return undefined;
        row = { ...row, status: "confirmed", balancePaymentIntentId };
        return { ...row };
      }),
      updateBookingStatus: vi.fn(async (_id: string, status: string) => {
        row = { ...row, status };
        return { ...row };
      }),
    };
  });

  const run = () => routeFunction("confirmMVGEvent", { storage: mvgStorage, stripe, normalizeCurrency });

  // The run is handed a list read before it started: every booking in it
  // still looks pending, whatever has happened to it since.
  const snapshot = () => [{ ...row, status: "pending", cancelledAt: null }];

  const depositIntent = {
    id: "pi_deposit",
    status: "succeeded",
    currency: "eur",
    customer: "cus_1",
    payment_method: "pm_1",
    metadata: { isDepositPayment: "true", balanceAmount: "80" },
  };

  it("skips a booking cancelled after the list was read, without touching Stripe or its status", async () => {
    for (const overrides of [
      { status: "cancelled", cancelledAt: new Date() },
      { status: "refunded" },
      { status: "failed" },
    ]) {
      seedBooking({ status: "pending", ...overrides });
      const listed = snapshot();
      const before = { ...row };
      await run()("event-1", listed);
      expect(row).toEqual(before);
    }
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.capture).not.toHaveBeenCalled();
    expect(mvgStorage.confirmActiveBooking).not.toHaveBeenCalled();
    expect(mvgStorage.updateBookingBalancePayment).not.toHaveBeenCalled();
    expect(mvgStorage.updateBookingStatus).not.toHaveBeenCalled();
  });

  it("authorises the balance and confirms an active deposit booking, as before", async () => {
    seedBooking({ status: "pending" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(depositIntent);
    await run()("event-1", snapshot());
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 8000,
      currency: "eur",
      customer: "cus_1",
      payment_method: "pm_1",
      capture_method: "manual",
      off_session: true,
    }));
    expect(row).toMatchObject({ status: "confirmed", balancePaymentIntentId: "pi_balance_new" });
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it("lets the new balance hold go if the attendee cancels while it is being made", async () => {
    seedBooking({ status: "pending" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(depositIntent);
    stripe.paymentIntents.create.mockImplementationOnce(async (params: any) => {
      row = { ...row, status: "cancelled", cancelledAt: new Date() };
      return { id: "pi_balance_new", ...params };
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await run()("event-1", snapshot());
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_balance_new");
    expect(row).toMatchObject({ status: "cancelled", balancePaymentIntentId: null });
    warn.mockRestore();
  });

  it("captures and confirms an active full-payment hold, as before", async () => {
    seedBooking({ status: "pending", isDepositOnly: false });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ id: "pi_deposit", status: "requires_capture", metadata: {} });
    await run()("event-1", snapshot());
    expect(stripe.paymentIntents.capture).toHaveBeenCalledWith("pi_deposit");
    expect(row.status).toBe("confirmed");
  });

  it("does not confirm a booking cancelled between the check and the write", async () => {
    seedBooking({ status: "pending", isDepositOnly: false });
    stripe.paymentIntents.retrieve.mockImplementationOnce(async () => {
      row = { ...row, status: "cancelled", cancelledAt: new Date() };
      return { id: "pi_deposit", status: "succeeded", metadata: {} };
    });
    await run()("event-1", snapshot());
    expect(mvgStorage.confirmActiveBooking).toHaveBeenCalled();
    expect(row.status).toBe("cancelled");
  });

  it("confirms without a second balance hold when one already exists", async () => {
    seedBooking({ status: "pending", balancePaymentIntentId: "pi_balance_old" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce(depositIntent);
    await run()("event-1", snapshot());
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(row.status).toBe("confirmed");
  });
});
