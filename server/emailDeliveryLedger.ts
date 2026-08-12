import { and, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { emailNotificationEvents } from "@shared/schema";
import { db } from "./db";
import type { EmailCategory } from "./emailPreferences";

const STALE_CLAIM_MS = 15 * 60 * 1000;
const MAX_JOB_ATTEMPTS = 5;

export interface EmailJobInput {
  eventKey: string;
  emailType: string;
  category: EmailCategory;
  recipientEmail?: string | null;
  scheduledFor: Date;
  payload: Record<string, unknown>;
}

export async function claimImmediateEmailEvent(
  input: Omit<EmailJobInput, "scheduledFor" | "payload"> & { payload?: Record<string, unknown> },
): Promise<boolean> {
  const now = new Date();
  const [inserted] = await db
    .insert(emailNotificationEvents)
    .values({
      ...input,
      recipientEmail: input.recipientEmail || null,
      status: "sending",
      scheduledFor: now,
      payload: input.payload || {},
      attempts: 1,
      lastAttemptAt: now,
    })
    .onConflictDoNothing({ target: emailNotificationEvents.eventKey })
    .returning({ id: emailNotificationEvents.id });
  if (inserted) return true;

  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  const [reclaimed] = await db
    .update(emailNotificationEvents)
    .set({
      status: "sending",
      recipientEmail: input.recipientEmail || null,
      attempts: sql`${emailNotificationEvents.attempts} + 1`,
      lastAttemptAt: now,
      errorMessage: null,
      payload: input.payload || {},
      updatedAt: now,
    })
    .where(and(
      eq(emailNotificationEvents.eventKey, input.eventKey),
      inArray(emailNotificationEvents.status, ["failed", "sending"]),
      sql`${emailNotificationEvents.status} = 'failed' OR ${emailNotificationEvents.lastAttemptAt} < ${staleBefore}`,
    ))
    .returning({ id: emailNotificationEvents.id });
  return Boolean(reclaimed);
}

export async function completeEmailEvent(
  eventKey: string,
  result: { success: boolean; skipped?: boolean; error?: string },
): Promise<void> {
  const now = new Date();
  await db
    .update(emailNotificationEvents)
    .set({
      status: result.skipped ? "skipped" : result.success ? "sent" : "failed",
      sentAt: result.success && !result.skipped ? now : null,
      errorMessage: result.error || null,
      updatedAt: now,
    })
    .where(eq(emailNotificationEvents.eventKey, eventKey));
}

export async function scheduleEmailJob(input: EmailJobInput): Promise<boolean> {
  const [inserted] = await db
    .insert(emailNotificationEvents)
    .values({
      ...input,
      recipientEmail: input.recipientEmail || null,
      status: "scheduled",
    })
    .onConflictDoNothing({ target: emailNotificationEvents.eventKey })
    .returning({ id: emailNotificationEvents.id });
  return Boolean(inserted);
}

export async function getDueEmailJobs(now = new Date(), limit = 50) {
  return db
    .select()
    .from(emailNotificationEvents)
    .where(and(
      eq(emailNotificationEvents.status, "scheduled"),
      lte(emailNotificationEvents.scheduledFor, now),
    ))
    .limit(limit);
}

export async function claimScheduledEmailJob(eventKey: string): Promise<boolean> {
  const now = new Date();
  const [claimed] = await db
    .update(emailNotificationEvents)
    .set({
      status: "sending",
      attempts: sql`${emailNotificationEvents.attempts} + 1`,
      lastAttemptAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(emailNotificationEvents.eventKey, eventKey),
      eq(emailNotificationEvents.status, "scheduled"),
      lte(emailNotificationEvents.scheduledFor, now),
    ))
    .returning({ id: emailNotificationEvents.id });
  return Boolean(claimed);
}

export async function retryOrFailEmailJob(eventKey: string, attempts: number, error: string): Promise<void> {
  const permanentlyFailed = attempts >= MAX_JOB_ATTEMPTS;
  const retryDelayMinutes = Math.min(60, 5 * Math.pow(2, Math.max(0, attempts - 1)));
  const now = new Date();
  await db
    .update(emailNotificationEvents)
    .set({
      status: permanentlyFailed ? "failed" : "scheduled",
      scheduledFor: permanentlyFailed ? now : new Date(now.getTime() + retryDelayMinutes * 60 * 1000),
      errorMessage: error.slice(0, 2000),
      updatedAt: now,
    })
    .where(eq(emailNotificationEvents.eventKey, eventKey));
}

/**
 * When this address last had an email of this type attempted.
 *
 * A resend button hands the creator a trigger that fires at somebody else's
 * inbox, so the ledger — which already records every attempt — is what stops a
 * repeated click from becoming a repeated email.
 */
export async function getLastEmailAttemptAt(
  emailType: string,
  recipientEmail: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ lastAttemptAt: emailNotificationEvents.lastAttemptAt })
    .from(emailNotificationEvents)
    .where(and(
      eq(emailNotificationEvents.emailType, emailType),
      sql`lower(${emailNotificationEvents.recipientEmail}) = lower(${recipientEmail})`,
    ))
    .orderBy(desc(emailNotificationEvents.lastAttemptAt))
    .limit(1);
  return row?.lastAttemptAt ?? null;
}

export async function recoverStaleEmailJobs(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  const recovered = await db
    .update(emailNotificationEvents)
    .set({ status: "scheduled", scheduledFor: now, updatedAt: now })
    .where(and(
      eq(emailNotificationEvents.status, "sending"),
      lt(emailNotificationEvents.lastAttemptAt, staleBefore),
    ))
    .returning({ id: emailNotificationEvents.id });
  return recovered.length;
}
