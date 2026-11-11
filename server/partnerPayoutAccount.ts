/**
 * Can this partner be paid, and if not, why not?
 *
 * A partner's commission was held whenever the cached status on their partner
 * profile was not "verified". That cache only moved when Stripe's
 * account.updated webhook arrived, so a partner who finished Stripe could stay
 * "not connected" for good (Tim, 66.27b: "connected Stripe more than once and it
 * stays not connected"). Organisers and venues already had a live check; this
 * is the same for partners. It also accepts the account the person connected
 * as an organiser: one person, one Stripe account.
 */

import { stripe } from "./stripeClient";
import { storage } from "./storage";

export type PartnerPayoutAccount = {
  stripeAccountId: string | null;
  stripeVerificationStatus: "verified" | "pending" | "unverified";
  /** Why it cannot be paid yet, in words a partner understands. Null when ready. */
  reason: string | null;
};

export { describeStripeRequirements } from "@shared/stripeRequirements";
import { describeStripeRequirements } from "@shared/stripeRequirements";

export async function resolvePartnerPayoutAccount(
  userId: string,
  promoterProfile?: { stripeAccountId?: string | null; stripeVerificationStatus?: string | null } | null,
): Promise<PartnerPayoutAccount> {
  const promoter = promoterProfile === undefined ? await storage.getPromoterProfile(userId) : promoterProfile;
  const creator = await storage.getCreatorProfile(userId).catch(() => undefined);
  const candidates = Array.from(new Set([promoter?.stripeAccountId, creator?.stripeAccountId].filter(Boolean))) as string[];
  if (candidates.length === 0) {
    return { stripeAccountId: null, stripeVerificationStatus: "unverified", reason: "No Stripe account connected yet." };
  }

  let fallback: PartnerPayoutAccount | null = null;
  for (const accountId of candidates) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      const ready = !!account.charges_enabled && !!account.payouts_enabled;
      const status = ready ? "verified" : account.details_submitted ? "pending" : "unverified";
      // Keep the partner profile's cache in step, webhook or no webhook.
      if (promoter?.stripeAccountId === accountId && promoter.stripeVerificationStatus !== status) {
        await storage.updatePromoterProfileStripe(userId, accountId, status).catch(() => undefined);
      }
      if (ready) return { stripeAccountId: accountId, stripeVerificationStatus: "verified", reason: null };
      const due = [...(account.requirements?.currently_due || []), ...(account.requirements?.past_due || [])];
      fallback ??= {
        stripeAccountId: accountId,
        stripeVerificationStatus: status,
        reason: describeStripeRequirements(due)
          ?? (account.details_submitted ? "Stripe is still checking your details." : "Stripe setup is not finished."),
      };
    } catch (error: any) {
      fallback ??= { stripeAccountId: accountId, stripeVerificationStatus: "unverified", reason: "Stripe could not find this account. Connect again." };
    }
  }
  return fallback!;
}
