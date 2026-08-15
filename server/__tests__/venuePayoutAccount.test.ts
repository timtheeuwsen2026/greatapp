import { describe, expect, it, vi, beforeEach } from "vitest";

// A venue's share used to be resolved through storage.getCreatorProfile(venue.createdBy).
// A venue-only account has no creator profile row, so that returned null, the venue
// was dropped from the split, and the payout still reported "completed" — the venue's
// money quietly stayed in the platform balance. The account now lives on the venue
// itself, with the old creator-profile lookup kept only as a migration fallback.

const venuesById = new Map<string, any>();
const creatorProfilesByUserId = new Map<string, any>();

vi.mock("../storage", () => ({
  storage: {
    getVenue: async (id: string) => venuesById.get(id),
    getCreatorProfile: async (userId: string) => creatorProfilesByUserId.get(userId),
  },
}));

const { resolveVenuePayoutAccount } = await import("../venuePayouts");

beforeEach(() => {
  venuesById.clear();
  creatorProfilesByUserId.clear();
});

describe("resolving a venue's payout account", () => {
  it("uses the account connected to the venue itself", async () => {
    venuesById.set("venue-1", {
      id: "venue-1",
      createdBy: "owner-1",
      stripeAccountId: "acct_venue",
      stripeVerificationStatus: "verified",
    });

    expect(await resolveVenuePayoutAccount("venue-1")).toEqual({
      stripeAccountId: "acct_venue",
      userId: "owner-1",
      verified: true,
    });
  });

  it("reports an unverified venue account as not yet payable", async () => {
    venuesById.set("venue-1", {
      id: "venue-1",
      createdBy: "owner-1",
      stripeAccountId: "acct_venue",
      stripeVerificationStatus: "pending",
    });

    const account = await resolveVenuePayoutAccount("venue-1");
    expect(account.stripeAccountId).toBe("acct_venue");
    expect(account.verified).toBe(false);
  });

  it("falls back to the owner's creator profile for venues connected before the venue flow", async () => {
    venuesById.set("venue-1", { id: "venue-1", createdBy: "owner-1", stripeAccountId: null });
    creatorProfilesByUserId.set("owner-1", {
      stripeAccountId: "acct_legacy",
      stripeVerificationStatus: "verified",
    });

    expect(await resolveVenuePayoutAccount("venue-1")).toEqual({
      stripeAccountId: "acct_legacy",
      userId: "owner-1",
      verified: true,
    });
  });

  it("prefers the venue's own account over the owner's creator profile", async () => {
    venuesById.set("venue-1", {
      id: "venue-1",
      createdBy: "owner-1",
      stripeAccountId: "acct_venue",
      stripeVerificationStatus: "verified",
    });
    creatorProfilesByUserId.set("owner-1", {
      stripeAccountId: "acct_legacy",
      stripeVerificationStatus: "verified",
    });

    expect((await resolveVenuePayoutAccount("venue-1")).stripeAccountId).toBe("acct_venue");
  });

  it("returns no account when the venue has never connected, but still names the owner", async () => {
    venuesById.set("venue-1", { id: "venue-1", createdBy: "owner-1", stripeAccountId: null });

    expect(await resolveVenuePayoutAccount("venue-1")).toEqual({
      stripeAccountId: null,
      userId: "owner-1",
      verified: false,
    });
  });

  it("returns nothing for a missing or unset venue instead of throwing", async () => {
    expect(await resolveVenuePayoutAccount("does-not-exist")).toEqual({
      stripeAccountId: null,
      userId: null,
      verified: false,
    });
    expect(await resolveVenuePayoutAccount(null)).toEqual({
      stripeAccountId: null,
      userId: null,
      verified: false,
    });
    expect(await resolveVenuePayoutAccount(undefined)).toEqual({
      stripeAccountId: null,
      userId: null,
      verified: false,
    });
  });
});
