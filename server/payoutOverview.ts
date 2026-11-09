/**
 * The admin money overview: what is on the Stripe balance, and per event who
 * is owed how much and whether they can be paid.
 *
 * Every amount comes from the payout run's own dry run, so this list and the
 * transfers that are actually made can never disagree. Nothing here moves
 * money or writes anything.
 */

import { stripe } from "./stripeClient";
import { storage } from "./storage";
import { executeExperiencePayout, type PayoutPlan } from "./payout-scheduler";

export type OverviewLine = {
  key: string;
  role: "organiser" | "venue" | "partner" | "other";
  name: string;
  email: string | null;
  amountCents: number;
  stripeConnected: boolean;
  /** Settled already: a Stripe transfer id, "sent-earlier", or "manual: …". */
  settled: string | null;
};

export type OverviewEvent = {
  payoutId: string;
  experienceId: string;
  title: string;
  currency: string;
  payoutStatus: string;
  scheduledFor: string | null;
  processedAt: string | null;
  errorMessage: string | null;
  grossCents: number;
  platformFeeCents: number;
  lines: OverviewLine[];
  owedCents: number;
  planError: string | null;
};

export type PayoutOverview = {
  balance: { currency: string; availableCents: number; incomingCents: number } | null;
  balanceError: string | null;
  owedCents: number;
  events: OverviewEvent[];
};

const ROLE: Record<string, OverviewLine["role"]> = { creator: "organiser", venue: "venue", promoter: "partner" };

function plannedLines(plan: PayoutPlan, transferIds: Record<string, string>) {
  return plan.lines.map((line) => ({ line, settled: transferIds[line.key] ?? null }));
}

export async function buildPayoutOverview(options: { includePaidDays?: number } = {}): Promise<PayoutOverview> {
  const includePaidSince = Date.now() - (options.includePaidDays ?? 30) * 24 * 60 * 60 * 1000;
  const overview: PayoutOverview = { balance: null, balanceError: null, owedCents: 0, events: [] };

  try {
    const balance = await stripe.balance.retrieve();
    const pick = (rows: Array<{ amount: number; currency: string }>) =>
      rows.filter((row) => row.currency === "eur").reduce((sum, row) => sum + row.amount, 0);
    overview.balance = { currency: "eur", availableCents: pick(balance.available), incomingCents: pick(balance.pending) };
  } catch (error: any) {
    overview.balanceError = error?.message || "Could not read the Stripe balance";
  }

  const payouts = await storage.getAllScheduledPayouts();
  const userCache = new Map<string, any>();
  const userOf = async (id: string | null) => {
    if (!id) return null;
    if (!userCache.has(id)) userCache.set(id, await storage.getUser(id));
    return userCache.get(id);
  };

  for (const payout of payouts) {
    const open = payout.status === "pending" || payout.status === "failed" || payout.status === "processing";
    const recentlyPaid = payout.status === "completed" && payout.processedAt && new Date(payout.processedAt).getTime() >= includePaidSince;
    if (!open && !recentlyPaid) continue;

    const transferIds = (payout.stripeTransferIds || {}) as Record<string, string>;
    const event: OverviewEvent = {
      payoutId: payout.id,
      experienceId: payout.experienceId,
      title: payout.experienceTitle,
      currency: (payout.currency || "eur").toLowerCase(),
      payoutStatus: payout.status,
      scheduledFor: payout.scheduledFor ? new Date(payout.scheduledFor).toISOString() : null,
      processedAt: payout.processedAt ? new Date(payout.processedAt).toISOString() : null,
      errorMessage: payout.errorMessage ?? null,
      grossCents: (payout.totalGrossAmountCents || 0) + (payout.additionalGrossAmountCents || 0),
      platformFeeCents: payout.platformFeeAmountCents || 0,
      lines: [],
      owedCents: 0,
      planError: null,
    };

    if (open) {
      try {
        const plan = await executeExperiencePayout(
          payout.experienceId, payout.id, payout.totalGrossAmountCents || 0, payout.additionalGrossAmountCents || 0,
          { dryRun: true },
        ) as PayoutPlan;
        event.grossCents = plan.grossCents;
        event.platformFeeCents = plan.platformFeeCents;
        if (!plan.eligible) event.planError = plan.reason;
        // A venue is known by its own name, not its owner's.
        const experience = plan.lines.some((line) => line.recipientType === "venue")
          ? await storage.getExperience(payout.experienceId) : undefined;
        const venue = experience?.linkedVenueId ? await storage.getVenue(experience.linkedVenueId) : undefined;
        for (const { line, settled } of plannedLines(plan, transferIds)) {
          const user = await userOf(line.userId);
          const person = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || line.userId || "Unknown";
          event.lines.push({
            key: line.key,
            role: ROLE[line.recipientType] ?? "other",
            name: line.recipientType === "venue" && venue?.name
              ? `${venue.name}${line.key === "venue_addons" ? " (add-ons)" : ""}`
              : person,
            email: user?.email ?? null,
            amountCents: line.amountCents,
            stripeConnected: line.accountReady,
            settled,
          });
          if (!settled) event.owedCents += line.amountCents;
        }
      } catch (error: any) {
        event.planError = error?.message || "Could not work out this payout";
      }
    } else {
      // Already paid out: what each person was sent, read from Stripe itself.
      for (const [key, value] of Object.entries(transferIds)) {
        if (key.startsWith("held:")) continue;
        let amountCents = 0;
        let userId: string | null = key.startsWith("promoter:") ? key.slice("promoter:".length) : null;
        for (const id of String(value).split(",").filter((part) => part.startsWith("tr_"))) {
          try {
            const transfer = await stripe.transfers.retrieve(id);
            amountCents += transfer.amount - (transfer.amount_reversed || 0);
            userId = userId || transfer.metadata?.userId || null;
          } catch {
            // Unreadable (other Stripe mode): shown without an amount.
          }
        }
        const user = await userOf(userId);
        event.lines.push({
          key,
          role: ROLE[key.split(":")[0]] ?? (key === "venue_addons" ? "venue" : "other"),
          name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || key,
          email: user?.email ?? null,
          amountCents,
          stripeConnected: true,
          settled: value,
        });
      }
      // Partners whose commission the payout held back for a missing or
      // unverified Stripe account: still owed, paid automatically once they
      // connect (or mark them paid manually).
      const heldPromoters = Object.keys(transferIds)
        .filter((key) => key.startsWith("held:promoter:"))
        .map((key) => key.slice("held:promoter:".length));
      if (heldPromoters.length > 0) {
        const eventBookings = await storage.getBookingsByExperience(payout.experienceId);
        for (const promoterId of heldPromoters) {
          const owed = eventBookings
            .filter((booking: any) => booking.promoterId === promoterId && booking.commissionStatus === "locked"
              && ["confirmed", "fully_paid", "deposit_paid"].includes(String(booking.status)))
            .reduce((sum: number, booking: any) => sum + Math.round(Number(booking.commissionAmount || 0) * 100), 0);
          if (owed <= 0) continue;
          const user = await userOf(promoterId);
          event.lines.push({
            key: `promoter:${promoterId}`,
            role: "partner",
            name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || promoterId,
            email: user?.email ?? null,
            amountCents: owed,
            stripeConnected: false,
            settled: null,
          });
          event.owedCents += owed;
        }
      }
    }
    overview.owedCents += event.owedCents;
    overview.events.push(event);
  }
  return overview;
}
