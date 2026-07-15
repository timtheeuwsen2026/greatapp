import { describe, expect, it } from "vitest";
import {
  isExperiencePayoutEligible,
  resolveBookingPayoutGrossCents,
  resolvePayoutGrossCents,
  sumBookingPayoutGrossCents,
} from "../payoutRules";

describe("MVG payout eligibility", () => {
  it.each(["pending", "failed", null])(
    "blocks transfers while an MVG event is %s",
    (mvgStatus) => {
      expect(isExperiencePayoutEligible({
        requireMinimumParticipants: true,
        mvgStatus,
      })).toBe(false);
    },
  );

  it("allows transfers only after an MVG event is met", () => {
    expect(isExperiencePayoutEligible({
      mvgEnabled: true,
      mvgStatus: "met",
    })).toBe(true);
  });

  it("does not impose MVG gating on a standard event", () => {
    expect(isExperiencePayoutEligible({
      requireMinimumParticipants: false,
      mvgEnabled: false,
      mvgStatus: "pending",
    })).toBe(true);
  });
});

describe("payout gross", () => {
  it("adds sponsorship revenue to ticket revenue", () => {
    expect(resolvePayoutGrossCents(5_000, 5_000, 50_000)).toBe(55_000);
  });

  it("uses preset gross only when there are no bookings", () => {
    expect(resolvePayoutGrossCents(0, 20_000, 5_000)).toBe(25_000);
  });

  it("uses the full ticket price after a deposit balance is paid", () => {
    expect(resolveBookingPayoutGrossCents({
      amount: "25.00",
      totalPrice: "100.00",
      isDepositOnly: true,
      balancePaid: true,
    })).toBe(10_000);
  });

  it("does not pay out an uncollected deposit balance", () => {
    expect(resolveBookingPayoutGrossCents({
      amount: "25.00",
      totalPrice: "100.00",
      isDepositOnly: true,
      balancePaid: false,
    })).toBe(2_500);
  });

  it("uses totalPrice for standard bookings and amount for legacy rows", () => {
    expect(sumBookingPayoutGrossCents([
      { amount: "100.00", totalPrice: "100.00", isDepositOnly: false },
      { amount: "40.00", totalPrice: null, isDepositOnly: false },
    ])).toBe(14_000);
  });
});
