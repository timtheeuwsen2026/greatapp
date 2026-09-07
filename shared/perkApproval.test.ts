import { describe, it, expect } from "vitest";
import {
  buildProposedPerkTerms,
  canPromisePerk,
  formatPerkForVenue,
  getPerkApprovalMessage,
  getPerkApprovalState,
  isPerkConfigured,
} from "./perkApproval";

// Point 9: "bring 3 friends, get a coffee at Bandido" commits Bandido's product
// on their behalf. Nothing stopped an organiser promising it first and asking
// afterwards — or never asking at all.

const venuePerk = {
  participantReferralDealType: "milestone_barter",
  participantReferralMilestoneAttendeeTarget: 3,
  participantReferralMilestoneRewardDescription: "a free coffee at Bandido",
  participantReferralVenueBacked: true,
};

describe("whether a perk is complete enough to promise", () => {
  it("needs its numbers filled in", () => {
    expect(isPerkConfigured(venuePerk)).toBe(true);
    expect(isPerkConfigured({ ...venuePerk, participantReferralMilestoneAttendeeTarget: 0 })).toBe(false);
    expect(isPerkConfigured({ ...venuePerk, participantReferralMilestoneRewardDescription: "  " })).toBe(false);
  });

  it("treats no perk at all as no perk, not as a broken one", () => {
    expect(getPerkApprovalState(null)).toBe("none");
    expect(getPerkApprovalState({})).toBe("none");
    expect(getPerkApprovalState({ participantReferralDealType: null })).toBe("none");
  });

  it("reads a cashback perk off its percentage", () => {
    expect(isPerkConfigured({
      participantReferralDealType: "commission_per_ticket",
      participantReferralCommissionPct: 5,
    })).toBe(true);
    expect(isPerkConfigured({
      participantReferralDealType: "commission_per_ticket",
      participantReferralCommissionPct: 0,
    })).toBe(false);
  });
});

describe("a perk the organiser funds themselves", () => {
  const selfFunded = {
    participantReferralDealType: "commission_per_ticket",
    participantReferralCommissionPct: 5,
  };

  it("needs nobody's permission", () => {
    expect(getPerkApprovalState(selfFunded)).toBe("self_funded");
    expect(canPromisePerk(selfFunded)).toBe(true);
    expect(getPerkApprovalMessage("self_funded")).toBeNull();
  });

  it("carries nothing into the venue proposal", () => {
    expect(buildProposedPerkTerms(selfFunded)).toBeNull();
  });
});

describe("a perk the venue has to fund", () => {
  it("is held back until the venue actually agrees", () => {
    expect(getPerkApprovalState(venuePerk)).toBe("awaiting_venue");
    expect(canPromisePerk(venuePerk)).toBe(false);
    expect(getPerkApprovalMessage("awaiting_venue")).toMatch(/their product to give/i);
  });

  it("goes live once the venue has accepted", () => {
    const approved = { ...venuePerk, participantReferralVenueApprovedAt: "2026-09-06T10:00:00.000Z" };

    expect(getPerkApprovalState(approved)).toBe("venue_approved");
    expect(canPromisePerk(approved)).toBe(true);
  });

  it("travels with the proposal so the venue sees what it is agreeing to", () => {
    expect(buildProposedPerkTerms(venuePerk)).toEqual({
      dealType: "milestone_barter",
      rewardDescription: "a free coffee at Bandido",
      attendeeTarget: 3,
      commissionPct: null,
    });
  });

  it("describes itself to the venue in one line", () => {
    const line = formatPerkForVenue(buildProposedPerkTerms(venuePerk));

    expect(line).toContain("3 friends");
    expect(line).toContain("a free coffee at Bandido");
    expect(line).toMatch(/provided by your venue/i);
  });

  it("says nothing at all when there is no perk to describe", () => {
    expect(formatPerkForVenue(null)).toBeNull();
    expect(buildProposedPerkTerms({ ...venuePerk, participantReferralVenueBacked: false })).toBeNull();
    // Marked as the venue's, but never finished — nothing to ask them about.
    expect(buildProposedPerkTerms({
      participantReferralDealType: "milestone_barter",
      participantReferralVenueBacked: true,
    })).toBeNull();
  });
});
