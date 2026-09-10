/**
 * Who is allowed to see the partner tooling.
 *
 * Switching an account's role to Creator or Venue used to be the whole check.
 * Anyone with a participant account could flip the switch and land, unverified
 * and un-onboarded, in front of the deal-type builder, the revenue calculator,
 * the Partners tab and the matching feed — which is to say, in front of most of
 * what is commercially distinctive about the platform. That has already been
 * copied off this product once.
 *
 * So access is a *status*, not a role. Selecting the role opens the onboarding
 * that leads to the tooling; an admin approving what was submitted opens the
 * tooling itself. This is deliberately the interim shape — manual approval as
 * the stopgap — until the full onboarding and verification architecture lands.
 * The rules live here so the server enforces and the browser explains the same
 * decision, in the same words.
 */

export type PartnerAccessState =
  /** Not a partner role at all. */
  | "not_partner"
  /** Partner role chosen, nothing submitted yet. Onboarding is the next step. */
  | "onboarding"
  /** Submitted, waiting on an admin. */
  | "pending_review"
  /** Approved — the tooling is open. */
  | "approved";

export type PartnerAccess = {
  state: PartnerAccessState;
  /** The only thing callers should branch on to show or hide tooling. */
  canUseTooling: boolean;
  /** Where to send someone who has not started, or null when there is nowhere to go. */
  onboardingHref: string | null;
  title: string;
  message: string;
};

export type PartnerAccessInput = {
  role?: string | null;
  isAdmin?: boolean;
  /** The creator's own profile, where they have one. */
  creatorProfile?: { completed?: boolean | null; approved?: boolean | null } | null;
  /** Every space this account has listed, in whatever state. */
  venues?: Array<{ status?: string | null }> | null;
};

export const PARTNER_ROLES = ["creator", "venue_provider", "promoter", "service_provider"] as const;

export function isPartnerRole(role: unknown): boolean {
  return (PARTNER_ROLES as readonly string[]).includes(String(role ?? ""));
}

const OPEN: Omit<PartnerAccess, "state"> = {
  canUseTooling: true,
  onboardingHref: null,
  title: "",
  message: "",
};

export function resolvePartnerAccess(input: PartnerAccessInput): PartnerAccess {
  const role = String(input.role ?? "");

  // An admin reviewing a submission has to be able to see what they are
  // approving, so the gate never closes in front of them.
  if (input.isAdmin) return { ...OPEN, state: "approved" };

  if (!isPartnerRole(role)) {
    return {
      state: "not_partner",
      canUseTooling: false,
      onboardingHref: "/profile-setup",
      title: "This is for creators, venues and promoters",
      message:
        "Choose a partner role from your account first. You can switch back at any time.",
    };
  }

  if (role === "creator") {
    const profile = input.creatorProfile;
    if (!profile || !profile.completed) {
      return {
        state: "onboarding",
        canUseTooling: false,
        onboardingHref: "/creator/profile-setup",
        title: "Finish your creator profile first",
        message:
          "The builder, the revenue calculator and the Partners tab open once your profile "
          + "is complete and approved. It takes a couple of minutes.",
      };
    }
    if (!profile.approved) {
      return {
        state: "pending_review",
        canUseTooling: false,
        onboardingHref: null,
        title: "Your profile is with our team",
        message:
          "We review every new creator before opening the deal tooling. You'll be emailed "
          + "the moment it's approved — usually within a working day.",
      };
    }
    return { ...OPEN, state: "approved" };
  }

  if (role === "venue_provider") {
    const venues = Array.isArray(input.venues) ? input.venues : [];
    const statuses = venues.map((venue) => String(venue?.status ?? "").toLowerCase());
    if (statuses.includes("approved")) return { ...OPEN, state: "approved" };
    // A draft is not a submission: the listing form is still open to them, but
    // the tooling is not.
    if (statuses.some((status) => status === "pending")) {
      return {
        state: "pending_review",
        canUseTooling: false,
        onboardingHref: null,
        title: "Your space is with our team",
        message:
          "We review every new space before opening the deal tooling. You'll be emailed "
          + "the moment it's approved — usually within a working day.",
      };
    }
    return {
      state: "onboarding",
      canUseTooling: false,
      onboardingHref: "/venues/new",
      title: "List your space first",
      message:
        "Deal types, the Partners tab and matching open once your space is listed and "
        + "approved. Start with what kind of space you're listing.",
    };
  }

  // Promoters and service providers have no admin review of their own yet, so
  // the role is the check. Named explicitly rather than falling through, so
  // adding a review step for them is a change in one place.
  return { ...OPEN, state: "approved" };
}
