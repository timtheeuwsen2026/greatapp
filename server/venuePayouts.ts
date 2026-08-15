/**
 * Where a venue's payout account lives.
 *
 * Two call sites need this — the 7-day payout scheduler building a default split,
 * and the upfront-rental webhook writing split_recipients — and they used to
 * resolve it differently, both through storage.getCreatorProfile(venue.createdBy).
 * A venue-only account has no creator profile row, so both returned null and the
 * venue was dropped from the transfer.
 *
 * venues.stripe_account_id is now the source of truth. The creator profile stays
 * as a fallback for owners who connected through the creator dashboard before the
 * venue flow existed and were never migrated.
 */

import { storage } from "./storage";

export type VenuePayoutAccount = {
  stripeAccountId: string | null;
  /** The venue owner, recorded on the split row so payout emails can reach them. */
  userId: string | null;
  verified: boolean;
};

const EMPTY: VenuePayoutAccount = { stripeAccountId: null, userId: null, verified: false };

export async function resolveVenuePayoutAccount(
  venueId: string | null | undefined,
): Promise<VenuePayoutAccount> {
  if (!venueId) return EMPTY;

  const venue = await storage.getVenue(venueId);
  if (!venue) return EMPTY;

  const ownerId = venue.createdBy ?? null;

  if (venue.stripeAccountId) {
    return {
      stripeAccountId: venue.stripeAccountId,
      userId: ownerId,
      verified: venue.stripeVerificationStatus === "verified",
    };
  }

  // Legacy path: the owner onboarded as a creator before venues could connect.
  const ownerProfile = ownerId ? await storage.getCreatorProfile(ownerId) : undefined;
  if (ownerProfile?.stripeAccountId) {
    return {
      stripeAccountId: ownerProfile.stripeAccountId,
      userId: ownerId,
      verified: ownerProfile.stripeVerificationStatus === "verified",
    };
  }

  return { ...EMPTY, userId: ownerId };
}
