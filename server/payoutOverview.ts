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
import { cityOfEvent, inCity } from "@shared/cities";

export type OverviewLine = {
  key: string;
  role: "organiser" | "venue" | "partner" | "other";
  name: string;
  email: string | null;
  amountCents: number;
  stripeConnected: boolean;
  /** Settled already: a Stripe transfer id, "sent-earlier", or "manual: …". */
  settled: string | null;
  /** Kept back because this person has no Stripe account yet. */
  held?: boolean;
};

export type OverviewEvent = {
  payoutId: string;
  experienceId: string;
  title: string;
  currency: string;
  payoutStatus: string;
  /** Paid out, but one or more shares are still held. */
  partlyPaid: boolean;
  /** An internal test event (organiser is a test account): not counted in the totals. */
  isTest: boolean;
  /** Other payout rows for the same event that were left out (66.13). */
  duplicates: number;
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
  /** `incomingCents` is Stripe's "pending" balance: payments not yet available. */
  balance: { currency: string; availableCents: number; incomingCents: number } | null;
  balanceError: string | null;
  owedCents: number;
  events: OverviewEvent[];
};

const ROLE: Record<string, OverviewLine["role"]> = { creator: "organiser", venue: "venue", venue_addons: "venue", promoter: "partner" };

function roleOf(key: string, recipientType?: string): OverviewLine["role"] {
  return ROLE[recipientType ?? ""] ?? ROLE[key.split(":")[0]] ?? "other";
}

export async function buildPayoutOverview(options: { includePaidDays?: number; city?: string | null } = {}): Promise<PayoutOverview> {
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
  const nameOf = (user: any, fallback: string) =>
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || fallback;

  // One event is one payout. Bandido had two rows for the same payout, which
  // counted its €5.10 twice in "Still to pay" (66.13). The newest row stands;
  // the rest are counted as duplicates of it.
  const seenOpen = new Map<string, OverviewEvent>();

  for (const payout of payouts) {
    const transferIds = (payout.stripeTransferIds || {}) as Record<string, string>;
    const heldKeys = Object.keys(transferIds).filter((key) => key.startsWith("held:")).map((key) => key.slice("held:".length));
    const open = payout.status === "pending" || payout.status === "failed" || payout.status === "processing";
    const partlyPaid = payout.status === "completed" && heldKeys.length > 0;
    const recentlyPaid = payout.status === "completed" && payout.processedAt && new Date(payout.processedAt).getTime() >= includePaidSince;
    if (!open && !partlyPaid && !recentlyPaid) continue;

    if (open) {
      const first = seenOpen.get(payout.experienceId);
      if (first) { first.duplicates += 1; continue; }
    }

    const experience = await storage.getExperience(payout.experienceId);
    // The admin city switch (66.24): only this city's events and their totals.
    if (options.city && !inCity(cityOfEvent((experience ?? {}) as any), options.city)) continue;
    const organiser = experience?.creatorId ? await userOf(experience.creatorId) : null;
    const event: OverviewEvent = {
      payoutId: payout.id,
      experienceId: payout.experienceId,
      title: payout.experienceTitle,
      currency: (payout.currency || "eur").toLowerCase(),
      payoutStatus: payout.status,
      partlyPaid,
      isTest: !!organiser?.testAccount,
      duplicates: 0,
      scheduledFor: payout.scheduledFor ? new Date(payout.scheduledFor).toISOString() : null,
      processedAt: payout.processedAt ? new Date(payout.processedAt).toISOString() : null,
      errorMessage: payout.errorMessage ?? null,
      grossCents: (payout.totalGrossAmountCents || 0) + (payout.additionalGrossAmountCents || 0),
      platformFeeCents: payout.platformFeeAmountCents || 0,
      lines: [],
      owedCents: 0,
      planError: null,
    };
    if (open) seenOpen.set(payout.experienceId, event);

    if (!open) {
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
          key, role: roleOf(key), name: nameOf(user, key), email: user?.email ?? null,
          amountCents, stripeConnected: true, settled: value,
        });
      }
    }

    // The plan says who is (still) owed what. For a waiting payout that is every
    // line; for a paid one only the shares it held back, which stay in "Still to
    // pay" until they are paid (66.28a: the partner's €0.20 had disappeared).
    if (open || partlyPaid) {
      try {
        const plan = await executeExperiencePayout(
          payout.experienceId, payout.id, payout.totalGrossAmountCents || 0, payout.additionalGrossAmountCents || 0,
          { dryRun: true },
        ) as PayoutPlan;
        if (open) {
          event.grossCents = plan.grossCents;
          event.platformFeeCents = plan.platformFeeCents;
          if (!plan.eligible) event.planError = plan.reason;
        }
        const venue = experience?.linkedVenueId && plan.lines.some((line) => line.recipientType === "venue")
          ? await storage.getVenue(experience.linkedVenueId) : undefined;
        for (const line of plan.lines) {
          const settled = transferIds[line.key] ?? null;
          if (!open && settled) continue; // listed above with what Stripe sent
          const user = await userOf(line.userId);
          event.lines.push({
            key: line.key,
            role: roleOf(line.key, line.recipientType),
            name: line.recipientType === "venue" && venue?.name
              ? `${venue.name}${line.key === "venue_addons" ? " (add-ons)" : ""}`
              : nameOf(user, line.userId || "Unknown"),
            email: user?.email ?? null,
            amountCents: line.amountCents,
            stripeConnected: line.accountReady,
            settled,
            held: heldKeys.includes(line.key),
          });
          if (!settled) event.owedCents += line.amountCents;
        }
      } catch (error: any) {
        event.planError = error?.message || "Could not work out this payout";
      }
    }

    if (!event.isTest) overview.owedCents += event.owedCents;
    overview.events.push(event);
  }
  return overview;
}
