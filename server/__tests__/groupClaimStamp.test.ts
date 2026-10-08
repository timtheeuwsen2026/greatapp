import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeFunction, routeResponse } from "../../tests/routeHarness";
import * as policy from "@shared/bookingCancellation";
import { normalizeCurrency } from "../impactLedger";

const database = vi.hoisted(() => ({ update: vi.fn(), transaction: vi.fn() }));
vi.mock("../db", () => ({ db: database }));
import { DatabaseStorage } from "../storage";

/**
 * Every way the group-success run claims a booking leaves the capture stamp,
 * so a claimed booking stays final for the attendee's own cancel even after
 * the payment webhook rewrites `confirmed` as `fully_paid` and while the event
 * still reads `pending`.
 *
 * confirmMVGEvent runs as written in routes.ts, writing through the real
 * storage methods; only the database underneath is a single in-memory row.
 * The cancel endpoint and the bookings-list preview are then asked about that
 * row, so the test follows a claim from the run's write to what the attendee
 * is told.
 */

let row: any;
let stripe: any;

const event = {
  id: "event-1",
  title: "Sunrise Swim",
  status: "approved",
  archivedAt: null,
  startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  currency: "eur",
  balanceDueDays: 7,
  requireMinimumParticipants: true,
  // The run marks the event met only after it has been through every booking.
  mvgStatus: "pending",
  creatorId: "organiser",
};

function seed(overrides: Record<string, unknown> = {}) {
  row = {
    id: "booking-1",
    userId: "attendee",
    experienceId: "event-1",
    status: "pending",
    cancelledAt: null,
    attendanceStatus: "unknown",
    addonRedeemedAt: null,
    commissionStatus: null,
    stripePaymentIntentId: "pi_deposit",
    balancePaymentIntentId: null,
    depositCapturedAt: null,
    depositStatus: null,
    isDepositOnly: true,
    balancePaid: false,
    amount: "20.00",
    totalPrice: "100.00",
    depositAmount: "20.00",
    balanceAmount: "80.00",
    ticketQuantity: 1,
    ...overrides,
  };
}

beforeEach(() => {
  database.update.mockReset();
  database.update.mockImplementation(() => ({
    set: (patch: Record<string, unknown>) => ({
      // The real WHERE refuses a cancelled booking; every booking here is live.
      where: () => ({
        returning: async () => {
          row = { ...row, ...patch };
          return [{ ...row }];
        },
      }),
    }),
  }));
  stripe = {
    paymentIntents: {
      retrieve: vi.fn(),
      create: vi.fn(async (params: any) => ({ id: "pi_balance", status: "requires_capture", ...params })),
      capture: vi.fn(async (id: string) => ({ id, status: "succeeded" })),
      cancel: vi.fn(async (id: string) => ({ id, status: "canceled" })),
    },
    refunds: { create: vi.fn(async () => ({ id: "re_1", amount: 2000, status: "succeeded" })) },
  };
});

async function runGroup() {
  const real = new DatabaseStorage();
  const storage = {
    getExperience: async () => ({ ...event }),
    getBooking: async (id: string) => (row.id === id ? { ...row } : undefined),
    confirmActiveBooking: (id: string) => real.confirmActiveBooking(id),
    updateBookingBalancePayment: (id: string, intentId: string, due: Date | null) => real.updateBookingBalancePayment(id, intentId, due),
  };
  const confirmMVGEvent = routeFunction("confirmMVGEvent", { storage, stripe, normalizeCurrency });
  vi.spyOn(console, "log").mockImplementation(() => {});
  await confirmMVGEvent("event-1", [{ ...row }]);
  vi.mocked(console.log).mockRestore();
}

/** The deposit's payment_intent.succeeded, landing after the run. */
function lateWebhook() {
  row = { ...row, status: "fully_paid" };
}

async function cancel() {
  const storage = {
    getBooking: vi.fn(async (id: string) => (row.id === id ? { ...row } : undefined)),
    getExperience: vi.fn(async () => ({ ...event })),
    getPayoutLockedExperienceIds: vi.fn(async () => new Set<string>()),
    cancelActiveBooking: vi.fn(async (_id: string, _experienceId: string, options: any = {}) => {
      const refused = policy.lockedCancellationRefusal({ booking: row, experience: event, refundPlanned: !!options.refundPlanned });
      if (refused) return { booking: null, refused };
      row = { ...row, status: "cancelled", cancelledAt: new Date() };
      return { booking: { ...row }, refused: null };
    }),
    revertBookingCancellation: vi.fn(),
    restoreGroupCapturedBooking: vi.fn(),
    updateBooking: vi.fn(async (_id: string, updates: any) => {
      row = { ...row, ...updates };
      return { ...row };
    }),
  };
  const returnCancelledBookingPayment = routeFunction("returnCancelledBookingPayment", { stripe });
  const route = routeFunction("/api/bookings/:id/cancel", {
    storage,
    stripe,
    resolveCurrentUserId: () => "attendee",
    returnCancelledBookingPayment,
    settleCancelledBooking: vi.fn(async () => {}),
    ...policy,
  }, "post");
  const res = routeResponse();
  await route({ params: { id: "booking-1" } }, res);
  return { res, storage };
}

const preview = () => policy.assessBookingCancellation({ booking: row, experience: event, now: new Date() });

const depositIntent = {
  id: "pi_deposit",
  status: "succeeded",
  capture_method: "automatic",
  amount: 2000,
  amount_received: 2000,
  currency: "eur",
  customer: "cus_1",
  payment_method: "pm_1",
};

function expectStamped() {
  expect(row).toMatchObject({ status: "confirmed", depositStatus: "captured" });
  expect(row.depositCapturedAt).toBeInstanceOf(Date);
}

async function expectFinalEverywhere() {
  expect(preview()).toMatchObject({ allowed: false, blockedReason: "paid_final" });
  const before = { ...row };
  const { res, storage } = await cancel();
  expect(res.statusCode).toBe(409);
  expect(res.body.code).toBe("paid_final");
  expect(storage.cancelActiveBooking).not.toHaveBeenCalled();
  expect(stripe.refunds.create).not.toHaveBeenCalled();
  expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
  expect(row).toEqual(before);
}

describe("the group-success run's claim on a booking", () => {
  it("stamps a full-payment hold it captures, so the refund is refused once the webhook rewrites it", async () => {
    seed({ isDepositOnly: false, amount: "100.00", balanceAmount: "0.00", depositAmount: "0.00", stripePaymentIntentId: "pi_hold" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ id: "pi_hold", status: "requires_capture", capture_method: "manual", metadata: {} });

    await runGroup();

    expect(stripe.paymentIntents.capture).toHaveBeenCalledWith("pi_hold");
    expectStamped();
    lateWebhook();
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_hold", status: "succeeded", capture_method: "manual", amount: 10000, amount_received: 10000, currency: "eur",
    });
    await expectFinalEverywhere();
  });

  it("stamps a deposit-only booking it confirms, so the deposit taken upfront is not refunded", async () => {
    seed({ balanceAmount: "0.00", totalPrice: "20.00" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ ...depositIntent, metadata: { isDepositPayment: "true", balanceAmount: "0" } });

    await runGroup();

    expectStamped();
    lateWebhook();
    // Captured on payment and the event still forming: without the stamp this
    // was the one case the endpoint would have refunded.
    stripe.paymentIntents.retrieve.mockResolvedValue(depositIntent);
    await expectFinalEverywhere();
  });

  it("stamps a deposit booking whose balance it puts on hold, so neither is handed back", async () => {
    seed();
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ ...depositIntent, metadata: { isDepositPayment: "true", balanceAmount: "80" } });

    await runGroup();

    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({ capture_method: "manual", off_session: true }));
    expectStamped();
    expect(row.balancePaymentIntentId).toBe("pi_balance");
    lateWebhook();
    stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => (id === "pi_deposit"
      ? depositIntent
      : { id, status: "requires_capture", capture_method: "manual", amount: 8000, amount_capturable: 8000, currency: "eur" }));
    await expectFinalEverywhere();
  });

  it("keeps that booking final on the stamp alone once the balance hold has lapsed", async () => {
    seed();
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ ...depositIntent, metadata: { isDepositPayment: "true", balanceAmount: "80" } });

    await runGroup();
    lateWebhook();
    // Stripe drops an uncaptured authorisation after about seven days.
    stripe.paymentIntents.retrieve.mockImplementation(async (id: string) => (id === "pi_deposit"
      ? depositIntent
      : { id, status: "canceled", capture_method: "manual", amount: 8000, currency: "eur" }));
    await expectFinalEverywhere();
  });

  it("stamps a deposit booking whose balance hold already exists, and one already captured", async () => {
    seed({ balancePaymentIntentId: "pi_balance_old" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ ...depositIntent, metadata: { isDepositPayment: "true", balanceAmount: "80" } });
    await runGroup();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    expectStamped();

    seed({ isDepositOnly: false, stripePaymentIntentId: "pi_paid" });
    stripe.paymentIntents.retrieve.mockResolvedValueOnce({ id: "pi_paid", status: "succeeded", metadata: {} });
    await runGroup();
    expectStamped();
  });

  it("writes the stamp the same way markDepositAsCaptured does", async () => {
    seed();
    const real = new DatabaseStorage();
    await real.confirmActiveBooking("booking-1");
    const confirmPatch = { ...row };
    seed();
    await real.updateBookingBalancePayment("booking-1", "pi_balance", null);
    const balancePatch = { ...row };
    seed();
    await real.markDepositAsCaptured("booking-1");

    for (const claimed of [confirmPatch, balancePatch]) {
      expect(claimed).toMatchObject({ status: row.status, depositStatus: row.depositStatus });
      expect(claimed.depositCapturedAt).toBeInstanceOf(Date);
    }
    expect(balancePatch).toMatchObject({ balancePaymentIntentId: "pi_balance", balanceDueDate: null });
  });
});

describe("an attendee paying the balance themselves", () => {
  it("gets an intent captured on payment, so it is never read as the group's hold", async () => {
    // The live check in the cancel endpoint rests on this: only the group run
    // ever puts a manual-capture intent in the balance column.
    seed({ status: "fully_paid" });
    const storage = {
      getBooking: async (id: string) => (row.id === id ? { ...row } : undefined),
      getExperience: async () => ({ ...event }),
      updateBooking: async (_id: string, updates: any) => {
        row = { ...row, ...updates };
        return { ...row };
      },
    };
    stripe.paymentIntents.create.mockImplementationOnce(async (params: any) => ({
      id: "pi_attendee_balance",
      client_secret: "secret",
      status: "requires_payment_method",
      capture_method: params.capture_method ?? "automatic",
      ...params,
    }));
    const res = routeResponse();
    await routeFunction("/api/bookings/:id/pay-balance/create-intent", {
      storage, stripe, isBookingCancelled: policy.isBookingCancelled,
    }, "post")({ user: { claims: { sub: "attendee" } }, params: { id: "booking-1" } }, res);

    expect(res.statusCode).toBe(200);
    const [params] = stripe.paymentIntents.create.mock.calls[0];
    expect(params.capture_method).toBeUndefined();
    expect(row.balancePaymentIntentId).toBe("pi_attendee_balance");
    const created = await stripe.paymentIntents.create.mock.results[0].value;
    expect(policy.isGroupBalanceHold(row, created)).toBe(false);
  });
});
