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
  it("counts only bookings Stripe has the money for, leaving out unfinished checkouts and cancelled, refunded and failed ones", () => {
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

    expect(summary.bookingsCount).toBe(1);
    expect(summary.totalGross).toBe(10);
    expect(summary.totalPlatformFees).toBe(1.5);
    expect(summary.totalEarnings).toBe(8.5);
    expect(summary.currency).toBe("eur");
  });

  it("gives the organiser tickets minus fee plus the add-on margin, and the venue its add-on price (TEST 1)", () => {
    const venue = eur({ linkedVenueId: "test-venue", venueCompensationModel: "venue_barter" });
    const coffee = (quantity: number) => ({ id: "coffee", name: "Coffee", unitPrice: 1.25, quantity, total: 1.25 * quantity, venueAmount: 1 });
    const booking = (extra: Record<string, unknown>) => ({
      status: "fully_paid", ticketQuantity: 1, ticketPlatformFeePct: "15", addonPlatformFeePct: "0", experience: venue, ...extra,
    });
    const { summary } = summarizeCreatorEarnings(
      [
        booking({ totalPrice: "2.25", amount: "2.25", addonTotal: "1.25", addonItems: [coffee(1)] }),
        booking({ totalPrice: "2.25", amount: "2.25", addonTotal: "1.25", addonItems: [coffee(1)] }),
        booking({ totalPrice: "1.00", amount: "1.00" }),
      ],
      { defaultPlatformFeePct: 15 },
    );
    expect(summary.totalGross).toBe(5.5);
    expect(summary.totalPlatformFees).toBe(0.45);
    expect(summary.totalSpaceShare).toBe(2);
    expect(summary.totalEarnings).toBe(3.05);
    expect(summary.effectivePlatformFeePct).toBe(15);
  });

  it("takes the partner commission off the organiser's share (TEST 3)", () => {
    const venue = eur({ linkedVenueId: "test-venue", venueCompensationModel: "fixed_fee", venueFixedFee: "0.50" });
    const { summary } = summarizeCreatorEarnings(
      [{
        status: "fully_paid", totalPrice: "2.00", amount: "2.00", ticketQuantity: 1, ticketPlatformFeePct: "15",
        commissionAmount: "0.20", commissionStatus: "locked", experience: venue,
      }],
      { defaultPlatformFeePct: 15 },
    );
    expect(summary.totalPlatformFees).toBe(0.3);
    expect(summary.totalSpaceShare).toBe(0.5);
    expect(summary.totalPartnerCommission).toBe(0.2);
    expect(summary.totalEarnings).toBe(1);
  });

  it("leaves out test payments and disputed ones", () => {
    const { summary } = summarizeCreatorEarnings(
      [
        { status: "fully_paid", totalPrice: "10.00", amount: "10.00", ticketQuantity: 1, testPayment: true, experience: eur() },
        { status: "fully_paid", totalPrice: "10.00", amount: "10.00", ticketQuantity: 1, disputedAt: "2026-11-10", experience: eur() },
      ],
      { defaultPlatformFeePct: 15 },
    );
    expect(summary.bookingsCount).toBe(0);
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
