/**
 * Ask everyone who will be owed money for an event, but has no Stripe account
 * yet, to connect one, as soon as the first paid booking comes in.
 *
 * A payout halts when a recipient has no account (so their share is never
 * kept quietly), and until now the organiser, venue or partner found out only
 * after the event, when the payout failed. One email per event and person;
 * sending again is a no-op.
 */

import { db } from "./db";
import { platformSettings } from "@shared/schema";
import { storage } from "./storage";
import { notificationService } from "./notifications";
import { buildDefaultRecipients } from "./payout-scheduler";

import { payoutSetupTargets } from "./payoutSetupTargets";

export async function remindPayoutAccountSetup(
  experienceId: string,
  booking: { promoterId?: string | null; commissionAmount?: string | number | null; testPayment?: boolean | null },
): Promise<number> {
  if (booking.testPayment) return 0;
  const experience = await storage.getExperience(experienceId);
  if (!experience) return 0;

  const [settings] = await db.select().from(platformSettings).limit(1);
  const platformFeePct = parseFloat(settings?.platformFeePercentage?.toString() ?? "15");
  const stored = await storage.getSplitRecipientsByExperience(experienceId);
  const recipients = stored.length > 0 ? stored : await buildDefaultRecipients(experience, platformFeePct);

  const promoterProfile = booking.promoterId ? await storage.getPromoterProfile(booking.promoterId) : undefined;
  const targets = payoutSetupTargets(recipients as any[], {
    userId: booking.promoterId ?? null,
    hasAccount: !!promoterProfile?.stripeAccountId,
    earnsCommission: Number(booking.commissionAmount || 0) > 0,
  });

  let sent = 0;
  for (const target of targets) {
    try {
      const user = await storage.getUser(target.userId);
      if (!user?.email) continue;
      await notificationService.sendPayoutSetupReminderEmail({
        to: user.email,
        firstName: user.firstName,
        eventName: experience.title || "your event",
        role: target.role,
        setupPath: target.setupPath,
        eventKey: `payout_setup:${experienceId}:${target.userId}:${target.role}`,
      });
      sent += 1;
    } catch (error: any) {
      console.error(`[Payout Setup] Could not remind ${target.userId} for ${experienceId}:`, error?.message);
    }
  }
  return sent;
}
