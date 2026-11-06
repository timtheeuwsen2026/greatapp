// Who is asked to connect Stripe at an event's first paid booking (pure, so it is tested).

export type Target = { userId: string; role: "organiser" | "venue" | "partner"; setupPath: string };

const SETUP_PATHS: Record<Target["role"], string> = {
  organiser: "/creator-profile-setup",
  venue: "/venue-dashboard?tab=payouts",
  partner: "/promoter/profile-setup",
};

export function payoutSetupTargets(
  recipients: Array<{ recipientType: string; stripeAccountId?: string | null; userId?: string | null; isActive?: boolean | null; splitValue?: string | number | null }>,
  promoter: { userId: string | null; hasAccount: boolean; earnsCommission: boolean },
): Target[] {
  const targets = new Map<string, Target>();
  for (const recipient of recipients) {
    if (!recipient.isActive || recipient.recipientType === "platform") continue;
    if (recipient.stripeAccountId || !recipient.userId) continue;
    if (!(Number(recipient.splitValue) > 0)) continue;
    const role = recipient.recipientType === "venue" ? "venue" : recipient.recipientType === "creator" ? "organiser" : "partner";
    targets.set(`${recipient.userId}:${role}`, { userId: recipient.userId, role, setupPath: SETUP_PATHS[role] });
  }
  if (promoter.userId && promoter.earnsCommission && !promoter.hasAccount) {
    targets.set(`${promoter.userId}:partner`, { userId: promoter.userId, role: "partner", setupPath: SETUP_PATHS.partner });
  }
  return Array.from(targets.values());
}
