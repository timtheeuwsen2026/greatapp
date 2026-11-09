import { beforeEach, describe, expect, it, vi } from "vitest";

// Cancelling an event refunds every paid buyer, now that tickets are charged at checkout.

const state = vi.hoisted(() => ({ paidOut: [] as any[], updates: [] as any[] }));
const storage = vi.hoisted(() => ({
  getExperience: vi.fn(),
  getBookingsByExperience: vi.fn(),
  markBookingAsRefunded: vi.fn(async () => ({})),
  getUser: vi.fn(async () => ({ email: "buyer@example.com", firstName: "Anna" })),
}));
const returnBookingMoney = vi.hoisted(() => vi.fn(async () => {}));
const sendBookingCancelledEmail = vi.hoisted(() => vi.fn(async () => ({ success: true })));

vi.mock("../db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => state.paidOut }) }),
    update: () => ({ set: (values: any) => ({ where: async () => { state.updates.push(values); } }) }),
  },
}));
vi.mock("../storage", () => ({ storage }));
vi.mock("../mvg-scheduler", () => ({ returnBookingMoney }));
vi.mock("../notifications", () => ({ notificationService: { sendBookingCancelledEmail } }));
vi.mock("../commissionService", () => ({ voidCommissionsForExperience: vi.fn(async () => {}) }));
vi.mock("../icalSync", () => ({ releaseVenueDatesForExperience: vi.fn(async () => {}) }));

import { cancelEventAndRefund } from "../eventCancellation";

beforeEach(() => {
  state.paidOut = [];
  state.updates = [];
  vi.clearAllMocks();
  storage.getExperience.mockResolvedValue({ id: "e1", title: "Sunday 5k", currency: "eur" });
  storage.getBookingsByExperience.mockResolvedValue([
    { id: "paid", status: "fully_paid", amount: "7.00", stripePaymentIntentId: "pi_1", userId: "u1" },
    { id: "free", status: "fully_paid", amount: "0.00", stripePaymentIntentId: null, userId: "u2" },
    { id: "gone", status: "cancelled", amount: "7.00", stripePaymentIntentId: "pi_2", userId: "u3" },
  ]);
});

describe("cancelling an event", () => {
  it("refunds every paid buyer, cancels free places, and emails them", async () => {
    const result = await cancelEventAndRefund("e1", "Venue closed");
    expect(result).toMatchObject({ ok: true, refunded: 1, freeCancelled: 1, failed: [] });
    expect(returnBookingMoney).toHaveBeenCalledTimes(1);
    expect(storage.markBookingAsRefunded).toHaveBeenCalledTimes(2);
    expect(sendBookingCancelledEmail).toHaveBeenCalledWith(expect.objectContaining({ outcome: "refunded", amountLabel: "€7.00" }));
    expect(state.updates[0]).toMatchObject({ status: "cancelled", cancellationReason: "Venue closed" });
  });

  it("keeps a booking whose refund failed, so it can be retried", async () => {
    returnBookingMoney.mockRejectedValueOnce(new Error("Stripe is down"));
    const result = await cancelEventAndRefund("e1", "Venue closed");
    expect(result).toMatchObject({ ok: true, refunded: 0, failed: [{ bookingId: "paid", message: "Stripe is down" }] });
  });

  it("refuses once the payout has gone out", async () => {
    state.paidOut = [{ id: "p1" }];
    const result = await cancelEventAndRefund("e1", "Venue closed");
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(returnBookingMoney).not.toHaveBeenCalled();
  });
});
