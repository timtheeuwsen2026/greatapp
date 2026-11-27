import { describe, expect, it } from "vitest";
import { countsAsBooked, eventMoneyState, isCountedTestBooking } from "./organiserMoney";

// The organiser's numbers, defined once (Tim, 27 Nov, point 5).

describe("which bookings count", () => {
  it("counts paid bookings that still stand", () => {
    expect(countsAsBooked({ status: "fully_paid" })).toBe(true);
    expect(countsAsBooked({ status: "deposit_paid" })).toBe(true);
    expect(countsAsBooked({ status: "confirmed" })).toBe(true);
  });

  it("leaves out unpaid, cancelled, refunded, disputed and test bookings", () => {
    expect(countsAsBooked({ status: "pending" })).toBe(false);
    expect(countsAsBooked({ status: "fully_paid", cancelledAt: "2026-11-01" })).toBe(false);
    expect(countsAsBooked({ status: "refunded" })).toBe(false);
    expect(countsAsBooked({ status: "fully_paid", disputedAt: "2026-11-01" })).toBe(false);
    expect(countsAsBooked({ status: "fully_paid", testPayment: true })).toBe(false);
  });

  it("says when a booking is left out only for being a test", () => {
    expect(isCountedTestBooking({ status: "fully_paid", testPayment: true })).toBe(true);
    expect(isCountedTestBooking({ status: "refunded", testPayment: true })).toBe(false);
  });
});

describe("Confirmed and held until the minimum is reached", () => {
  const later = { startDate: "2030-06-01T12:00:00.000Z", startTime: "10:00", endTime: "12:00" };
  const past = { startDate: "2020-06-01T12:00:00.000Z", startTime: "10:00", endTime: "12:00" };

  it("is confirmed without a minimum, or once the minimum is met", () => {
    expect(eventMoneyState({ ...later, requireMinimumParticipants: false })).toBe("confirmed");
    expect(eventMoneyState({ ...later, requireMinimumParticipants: true, mvgStatus: "met" })).toBe("confirmed");
  });

  it("is held while the minimum is not reached before the start", () => {
    expect(eventMoneyState({ ...later, requireMinimumParticipants: true, mvgStatus: "pending" })).toBe("held");
  });

  it("goes ahead once the event has started and was not cancelled", () => {
    expect(eventMoneyState({ ...past, requireMinimumParticipants: true, mvgStatus: "pending" })).toBe("confirmed");
  });

  it("is neither when the event is cancelled or the minimum failed", () => {
    expect(eventMoneyState({ ...later, status: "cancelled" })).toBe("cancelled");
    expect(eventMoneyState({ ...later, requireMinimumParticipants: true, mvgStatus: "failed" })).toBe("cancelled");
  });
});
