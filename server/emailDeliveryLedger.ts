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

  // A row already exists. It may be reclaimed when the previous attempt failed,
  // or when a claim was left dangling by a crash mid-send — but only while
  // attempts remain. Without the cap a permanently undeliverable address was
  // re-sent on every subsequent trigger, forever: one rate-limited burst turned
  // every one of its failures into a standing instruction to try again.
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
      lt(emailNotificationEvents.attempts, MAX_JOB_ATTEMPTS),
      sql`${emailNotificationEvents.status} = 'failed' OR ${emailNotificationEvents.lastAttemptAt} < ${staleBefore}`,
    ))
    .returning({ id: emailNotificationEvents.id });
  return Boolean(reclaimed);
}

/**
 * The attempt count the ledger currently holds for an event key.
 *
 * claimImmediateEmailEvent has just incremented it, so this is the number of
 * the attempt that failed. sendEmailOnce used to pass a literal 1 instead,
 * which reset the backoff every time a fresh trigger came through and kept a
 * broken send in permanent five-minute retry.
 */
export async function getEmailJobAttempts(eventKey: string): Promise<number> {
  const [row] = await db
    .select({ attempts: emailNotificationEvents.attempts })
    .from(emailNotificationEvents)
    .where(eq(emailNotificationEvents.eventKey, eventKey))
    .limit(1);
  return row?.attempts ?? 1;
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
      // Rows that ran away before the backoff was fixed sit at attempt counts in
      // the dozens. Without this they would each get one more delivery the
      // moment the scheduler next ticks.
      lt(emailNotificationEvents.attempts, MAX_JOB_ATTEMPTS),
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
