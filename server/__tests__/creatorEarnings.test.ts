import { describe, it, expect } from "vitest";
import { summarizeCreatorEarnings } from "../creatorEarnings";

// QA V13 Bug 3: the dashboard's ledger strip summed every booking row —
// cancellations included — in dollars, while the revenue cards below read a
// stub that always returned zero. One calculation now feeds both.

const eur = (overrides: Record<string, any> = {}) => ({
  id: "exp-1",
  title: "The GREAT Sweat & Social Bootcamp",
  currency: "eur",
  platformPct: "15",
  venueRevenuePercentage: "0",
  venueCompensationModel: "access_only",
  venueFixedFee: "0",
  ...overrides,
});

describe("summarizeCreatorEarnings", () => {
  it("counts committed bookings and leaves out cancelled, refunded and failed ones", () => {
    const { summary } = summarizeCreatorEarnings(
      [
        { status: "fully_paid", totalPrice: "10.00", amount: "10.00", ticketQuantity: 1, experience: eur() },
        { status: "pending", totalPrice: "10.00", amount: "10.00", ticketQuantity: 1, experience: eur() },
        { status: "cancelled", totalPrice: "1.00", amount: "1.00", ticketQuantity: 1, experience: eur() },
        { status: "refunded", totalPrice: "1.00", amount: "1.00", ticketQuantity: 1, experience: eur() },
        { status: "failed", totalPrice: "1.00", amount: "1.00", ticketQuantity: 1, experience: eur() },
      ],
      { defaultPlatformFeePct: 15 },
    );

    expect(summary.bookingsCount).toBe(2);
    expect(summary.totalGross).toBe(20);
    expect(summary.totalPlatformFees).toBe(3);
    expect(summary.totalEarnings).toBe(17);
    expect(summary.currency).toBe("eur");
  });

  it("reports the event currency rather than assuming dollars", () => {
    const { summary } = summarizeCreatorEarnings(
      [{ status: "fully_paid", totalPrice: "10.00", amount: "10.00", ticketQuantity: 1, experience: eur({ currency: "GBP" }) }],
      { defaultPlatformFeePct: 15 },
    );

    expect(summary.currency).toBe("gbp");
  });

  it("reads the platform fee from the caller's setting when an event has none stored", () => {
    const { summary } = summarizeCreatorEarnings(
      [{ status: "fully_paid", totalPrice: "100.00", amount: "100.00", ticketQuantity: 1, experience: eur({ platformPct: null }) }],
      { defaultPlatformFeePct: 12 },
    );

    expect(summary.totalPlatformFees).toBe(12);
    expect(summary.totalEarnings).toBe(88);
    expect(summary.effectivePlatformFeePct).toBe(12);
  });

  it("splits a venue revenue share off the top before the creator's share", () => {
    const { summary } = summarizeCreatorEarnings(
      [{
        status: "fully_paid",
        totalPrice: "100.00",
        amount: "100.00",
        ticketQuantity: 1,
        experience: eur({ venueCompensationModel: "revenue_share", venueRevenuePercentage: "20" }),
      }],
      { defaultPlatformFeePct: 15 },
    );

    expect(summary.totalGross).toBe(100);
    expect(summary.totalPlatformFees).toBe(15);
    expect(summary.totalSpaceShare).toBe(20);
    expect(summary.totalEarnings).toBe(65);
  });

  it("charges a per-ticket venue deduction on every ticket in the booking", () => {
    const { summary } = summarizeCreatorEarnings(
      [{
        status: "fully_paid",
        totalPrice: "60.00",
        amount: "60.00",
        ticketQuantity: 3,
        experience: eur({ venueCompensationModel: "fixed_fee", venueFixedFee: "5" }),
      }],
      { defaultPlatformFeePct: 15 },
    );

    expect(summary.totalSpaceShare).toBe(15);
    expect(summary.totalEarnings).toBe(36);
  });

  it("separates money already collected from an outstanding deposit balance", () => {
    const { summary } = summarizeCreatorEarnings(
      [{
        status: "deposit_paid",
        totalPrice: "100.00",
        amount: "30.00",
        ticketQuantity: 1,
        isDepositOnly: true,
        balancePaid: false,
        experience: eur(),
      }],
      { defaultPlatformFeePct: 15 },
    );

    expect(summary.totalGross).toBe(100);
    expect(summary.totalCollected).toBe(30);
    expect(summary.outstandingBalance).toBe(70);
  });

  it("never lets a venue deduction push a booking's split below zero", () => {
    const { summary } = summarizeCreatorEarnings(
      [{
        status: "fully_paid",
        totalPrice: "10.00",
        amount: "10.00",
        ticketQuantity: 1,
        experience: eur({ venueCompensationModel: "fixed_fee", venueFixedFee: "500" }),
      }],
      { defaultPlatformFeePct: 15 },
    );

    expect(summary.totalEarnings).toBe(0);
    expect(summary.totalSpaceShare).toBe(8.5);
    expect(summary.totalPlatformFees).toBe(1.5);
  });

  it("returns zeroes rather than NaN for a creator with no bookings", () => {
    const { summary, byExperience } = summarizeCreatorEarnings([], { defaultPlatformFeePct: 15 });

    expect(summary.bookingsCount).toBe(0);
    expect(summary.totalGross).toBe(0);
    expect(summary.averageBookingValue).toBe(0);
    expect(byExperience).toEqual([]);
  });
});
