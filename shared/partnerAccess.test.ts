import { describe, it, expect } from "vitest";
import { resolvePartnerAccess, shouldAutoApproveCreator } from "./partnerAccess";

/**
 * The gap Tim flagged: switching an account's role was the whole check, so a
 * participant could flip to Creator and read the deal-type builder, the revenue
 * calculator and the Partners tab without having onboarded at all.
 */
describe("resolvePartnerAccess", () => {
  it("does not open the tooling on role selection alone", () => {
    const access = resolvePartnerAccess({ role: "creator", creatorProfile: null });
    expect(access.canUseTooling).toBe(false);
    expect(access.state).toBe("onboarding");
    expect(access.onboardingHref).toBe("/creator/profile-setup");
  });

  it("still holds a completed creator profile until an admin approves it", () => {
    const access = resolvePartnerAccess({
      role: "creator",
      creatorProfile: { completed: true, approved: false },
    });
    expect(access.canUseTooling).toBe(false);
    expect(access.state).toBe("pending_review");
    // Nowhere to send them: waiting is the whole state.
    expect(access.onboardingHref).toBeNull();
  });

  it("opens the tooling for an approved creator", () => {
    const access = resolvePartnerAccess({
      role: "creator",
      creatorProfile: { completed: true, approved: true },
    });
    expect(access).toMatchObject({ state: "approved", canUseTooling: true });
  });

  it("sends a venue with nothing listed into the listing flow", () => {
    const access = resolvePartnerAccess({ role: "venue_provider", venues: [] });
    expect(access.canUseTooling).toBe(false);
    expect(access.onboardingHref).toBe("/venues/new");
  });

  it("treats a venue draft as not yet submitted", () => {
    const access = resolvePartnerAccess({
      role: "venue_provider",
      venues: [{ status: "draft" }],
    });
    expect(access.state).toBe("onboarding");
    expect(access.canUseTooling).toBe(false);
  });

  it("holds a submitted venue at review, and opens on approval", () => {
    expect(resolvePartnerAccess({
      role: "venue_provider",
      venues: [{ status: "pending" }],
    })).toMatchObject({ state: "pending_review", canUseTooling: false });

    expect(resolvePartnerAccess({
      role: "venue_provider",
      venues: [{ status: "draft" }, { status: "approved" }],
    })).toMatchObject({ state: "approved", canUseTooling: true });
  });

  it("keeps a participant out entirely", () => {
    const access = resolvePartnerAccess({ role: "participant" });
    expect(access).toMatchObject({ state: "not_partner", canUseTooling: false });
  });

  // An admin has to be able to see what they are being asked to approve.
  it("never closes in front of an admin", () => {
    const access = resolvePartnerAccess({ role: "participant", isAdmin: true });
    expect(access.canUseTooling).toBe(true);
  });
});

describe("shouldAutoApproveCreator — creator approval switched off", () => {
  const completed = { completed: true, approved: false };

  it("approves a creator on the save that first completes their profile", () => {
    expect(shouldAutoApproveCreator({ before: null, after: completed, approvalRequired: false })).toBe(true);
    expect(shouldAutoApproveCreator({
      before: { completed: false }, after: completed, approvalRequired: false,
    })).toBe(true);
  });

  it("leaves everyone waiting while approval is switched on", () => {
    expect(shouldAutoApproveCreator({ before: null, after: completed, approvalRequired: true })).toBe(false);
  });

  // The reason "first" matters: an admin can hold one creator with review
  // off, and their next profile edit must not quietly let them back in.
  it("does not undo a hold when a held creator saves again", () => {
    expect(shouldAutoApproveCreator({
      before: { completed: true }, after: completed, approvalRequired: false,
    })).toBe(false);
  });

  it("does nothing for an incomplete or already-approved profile", () => {
    expect(shouldAutoApproveCreator({
      before: null, after: { completed: false, approved: false }, approvalRequired: false,
    })).toBe(false);
    expect(shouldAutoApproveCreator({
      before: null, after: { completed: true, approved: true }, approvalRequired: false,
    })).toBe(false);
  });
});
