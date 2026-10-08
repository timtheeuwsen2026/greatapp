import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A late payment confirmation must not bring a cancelled booking back.
 *
 * An attendee can cancel while Stripe's confirmation is still on its way, and
 * an MVG failure closes bookings the same way. The webhook used to mark every
 * booking it found fully_paid and send its confirmation email, whatever state
 * the booking was in.
 */

let booking: any;
const updateBookingStatus = vi.fn(async () => ({}));
const updateBookingBalancePaid = vi.fn(async () => ({}));
const sendBookingNotificationsAfterPayment = vi.fn(async () => {});
const scheduleExperiencePayout = vi.fn(async () => {});

vi.mock("../storage", () => ({
  storage: {
    getBookingByPaymentIntent: async () => booking,
    updateBookingStatus,
    updateBookingBalancePaid,
    getExperience: async () => ({ id: "event-1", endDate: new Date("2026-11-01"), requireMinimumParticipants: false, mvgEnabled: false }),
    getPaidBookings: async () => [],
  },
}));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../payout-scheduler", () => ({ scheduleExperiencePayout }));
vi.mock("../venuePayouts", () => ({ resolveVenuePayoutAccount: async () => null }));
vi.mock("../notifications", () => ({ notificationService: {}, formatPromotionDealSummary: () => "" }));
vi.mock("../bookingEmailOrchestrator", () => ({ sendBookingNotificationsAfterPayment }));
vi.mock("../bookingFinalizer", () => ({ finalizeBookingFromPaymentIntent: async () => ({ created: false }) }));

const { handleStripeWebhook } = await import("../stripe-webhook");

function succeeded(metadata: Record<string, string> = {}) {
  return {
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_live_1", metadata } },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("payment_intent.succeeded on a cancelled booking", () => {
  it.each([
    ["cancelled", { status: "cancelled", cancelledAt: new Date() }],
    ["refunded", { status: "refunded", cancelledAt: null }],
    ["timestamped but not yet flipped", { status: "pending", cancelledAt: new Date() }],
  ])("leaves a %s booking as it is and sends nothing", async (_label, state) => {
    booking = { id: "booking-1", experienceId: "event-1", ...state };
    await handleStripeWebhook(succeeded(), {} as any);
    expect(updateBookingStatus).not.toHaveBeenCalled();
    expect(updateBookingBalancePaid).not.toHaveBeenCalled();
    expect(sendBookingNotificationsAfterPayment).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("booking-1"));
  });

  it("still confirms an active booking", async () => {
    booking = { id: "booking-1", experienceId: "event-1", status: "pending", cancelledAt: null };
    await handleStripeWebhook(succeeded(), {} as any);
    expect(updateBookingStatus).toHaveBeenCalledWith("booking-1", "fully_paid");
    expect(sendBookingNotificationsAfterPayment).toHaveBeenCalledWith("booking-1");
  });

  it("still lets a declined card be retried on the same payment", async () => {
    booking = { id: "booking-1", experienceId: "event-1", status: "failed", cancelledAt: null };
    await handleStripeWebhook(succeeded(), {} as any);
    expect(updateBookingStatus).toHaveBeenCalledWith("booking-1", "fully_paid");
  });
});
