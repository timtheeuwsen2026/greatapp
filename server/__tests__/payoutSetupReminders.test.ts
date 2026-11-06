import { describe, expect, it } from "vitest";
import { payoutSetupTargets } from "../payoutSetupTargets";

// Who is asked to connect Stripe at the first paid booking.

const noPromoter = { userId: null, hasAccount: false, earnsCommission: false };

describe("asking for a payout account", () => {
  it("asks the organiser and the venue that are owed money but have no account", () => {
    const targets = payoutSetupTargets([
      { recipientType: "platform", stripeAccountId: null, userId: null, isActive: true, splitValue: "15" },
      { recipientType: "venue", stripeAccountId: null, userId: "venue-owner", isActive: true, splitValue: "20" },
      { recipientType: "creator", stripeAccountId: null, userId: "organiser", isActive: true, splitValue: "65" },
    ], noPromoter);
    expect(targets).toEqual([
      { userId: "venue-owner", role: "venue", setupPath: "/venue-dashboard?tab=payouts" },
      { userId: "organiser", role: "organiser", setupPath: "/creator-profile-setup" },
    ]);
  });

  it("leaves out anyone already connected, on a 0% share, or inactive", () => {
    const targets = payoutSetupTargets([
      { recipientType: "creator", stripeAccountId: "acct_1", userId: "organiser", isActive: true, splitValue: "85" },
      { recipientType: "venue", stripeAccountId: null, userId: "venue-owner", isActive: true, splitValue: "0" },
      { recipientType: "venue", stripeAccountId: null, userId: "old-venue", isActive: false, splitValue: "10" },
    ], noPromoter);
    expect(targets).toEqual([]);
  });

  it("asks the partner who brought the buyer when they earn a commission and cannot be paid", () => {
    expect(payoutSetupTargets([], { userId: "community", hasAccount: false, earnsCommission: true }))
      .toEqual([{ userId: "community", role: "partner", setupPath: "/promoter/profile-setup" }]);
    expect(payoutSetupTargets([], { userId: "community", hasAccount: true, earnsCommission: true })).toEqual([]);
  });
});
