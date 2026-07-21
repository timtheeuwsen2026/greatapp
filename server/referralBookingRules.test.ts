import { describe, expect, it } from "vitest";
import { isActivePostCheckoutBooking } from "./referralBookingRules";

describe("isActivePostCheckoutBooking", () => {
  const booking = {
    userId: "participant-1",
    experienceId: "experience-1",
    status: "confirmed",
  };

  it("accepts an active booking owned by the participant for the experience", () => {
    expect(isActivePostCheckoutBooking(booking, "participant-1", "experience-1")).toBe(true);
  });

  it.each(["cancelled", "refunded", "failed"])("rejects %s bookings", (status) => {
    expect(isActivePostCheckoutBooking({ ...booking, status }, "participant-1", "experience-1")).toBe(false);
  });

  it("rejects a booking owned by another participant", () => {
    expect(isActivePostCheckoutBooking(booking, "participant-2", "experience-1")).toBe(false);
  });

  it("rejects a booking for another experience", () => {
    expect(isActivePostCheckoutBooking(booking, "participant-1", "experience-2")).toBe(false);
  });

  it("rejects a missing booking", () => {
    expect(isActivePostCheckoutBooking(undefined, "participant-1", "experience-1")).toBe(false);
  });
});
