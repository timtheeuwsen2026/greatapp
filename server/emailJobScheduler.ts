import cron from "node-cron";
import { and, eq, gt, ne, or } from "drizzle-orm";
import { experienceChatReads, experienceMessages } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { notificationService, sendQueuedRenderedEmail } from "./notifications";
import {
  claimScheduledEmailJob,
  completeEmailEvent,
  getDueEmailJobs,
  recoverStaleEmailJobs,
  retryOrFailEmailJob,
  scheduleEmailJob,
} from "./emailDeliveryLedger";

const DEFAULT_UNREAD_DELAY_MS = 5 * 60 * 1000;
const DEFAULT_UNREAD_COOLDOWN_MS = 60 * 60 * 1000;
const DEFAULT_CREATOR_NUDGE_DELAY_MS = 15 * 60 * 1000;
const DEFAULT_CREATOR_NUDGE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CREATOR_RECENT_REPLY_MS = 12 * 60 * 60 * 1000;

function bucketFor(now: Date, cooldownMs: number): number {
  return Math.floor(now.getTime() / cooldownMs);
}

export async function scheduleCommunityHubUnreadJob(input: {
  experienceId: string;
  userId: string;
  delayMs?: number;
  cooldownMs?: number;
  now?: Date;
}): Promise<boolean> {
  const now = input.now || new Date();
  const cooldownMs = input.cooldownMs || DEFAULT_UNREAD_COOLDOWN_MS;
  return scheduleEmailJob({
    eventKey: `community_hub_unread:${input.experienceId}:${input.userId}:${bucketFor(now, cooldownMs)}`,
    emailType: "community_hub_unread",
    category: "community",
    scheduledFor: new Date(now.getTime() + (input.delayMs ?? DEFAULT_UNREAD_DELAY_MS)),
    payload: { experienceId: input.experienceId, userId: input.userId },
  });
}

export async function scheduleCreatorHubNudgeJob(input: {
  experienceId: string;
  creatorId: string;
  delayMs?: number;
  cooldownMs?: number;
  now?: Date;
}): Promise<boolean> {
  const now = input.now || new Date();
  const cooldownMs = input.cooldownMs || DEFAULT_CREATOR_NUDGE_COOLDOWN_MS;
  return scheduleEmailJob({
    eventKey: `creator_hub_nudge:${input.experienceId}:${input.creatorId}:${bucketFor(now, cooldownMs)}`,
    emailType: "creator_hub_nudge",
    category: "community",
    scheduledFor: new Date(now.getTime() + (input.delayMs ?? DEFAULT_CREATOR_NUDGE_DELAY_MS)),
    payload: { experienceId: input.experienceId, creatorId: input.creatorId },
  });
}

async function hasUnreadExperienceMessages(experienceId: string, userId: string): Promise<boolean> {
  const [readState] = await db
    .select()
    .from(experienceChatReads)
    .where(and(eq(experienceChatReads.experienceId, experienceId), eq(experienceChatReads.userId, userId)))
    .limit(1);
  const lastReadAt = readState?.lastReadAt || new Date(0);
  const unread = await db
    .select({ id: experienceMessages.id })
    .from(experienceMessages)
    .where(and(
      eq(experienceMessages.experienceId, experienceId),
      gt(experienceMessages.createdAt, lastReadAt),
      ne(experienceMessages.userId, userId),
      or(eq(experienceMessages.isPrivate, false), eq(experienceMessages.recipientId, userId)),
    ))
    .limit(1);
  return unread.length > 0;
}

async function hasRecentCreatorReply(experienceId: string, creatorId: string): Promise<boolean> {
  const lookbackMs = Number(process.env.CREATOR_HUB_RECENT_REPLY_MS || DEFAULT_CREATOR_RECENT_REPLY_MS);
  const since = new Date(Date.now() - lookbackMs);
  const recentReply = await db
    .select({ id: experienceMessages.id })
    .from(experienceMessages)
    .where(and(
      eq(experienceMessages.experienceId, experienceId),
      eq(experienceMessages.userId, creatorId),
      gt(experienceMessages.createdAt, since),
    ))
    .limit(1);
  return recentReply.length > 0;
}

async function processCommunityUnreadJob(payload: Record<string, unknown>) {
  const experienceId = String(payload.experienceId || "");
  const userId = String(payload.userId || "");
  if (!experienceId || !userId || !(await hasUnreadExperienceMessages(experienceId, userId))) {
    return { success: true, skipped: true };
  }

  const [experience, user] = await Promise.all([
    storage.getExperience(experienceId),
    storage.getUser(userId),
  ]);
  if (!experience || !user?.email) return { success: true, skipped: true };
  return notificationService.sendCommunityHubUnreadEmail({
    to: user.email,
    userId,
    userFirstName: user.firstName,
    experienceTitle: experience.title,
    experienceSlugOrId: (experience as any).slug || experience.id,
    experience,
  });
}

async function processCreatorNudgeJob(payload: Record<string, unknown>) {
  const experienceId = String(payload.experienceId || "");
  const creatorId = String(payload.creatorId || "");
  if (!experienceId || !creatorId || await hasRecentCreatorReply(experienceId, creatorId)) {
    return { success: true, skipped: true };
  }

  const [experience, creator] = await Promise.all([
    storage.getExperience(experienceId),
    storage.getUser(creatorId),
  ]);
  if (!experience || !creator?.email) return { success: true, skipped: true };
  return notificationService.sendCreatorCommunityHubNudgeEmail({
    to: creator.email,
    creatorName: creator.firstName,
    experienceTitle: experience.title,
    experienceSlugOrId: (experience as any).slug || experience.id,
    experience,
  });
}

export async function processDueEmailJobs(now = new Date()): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  await recoverStaleEmailJobs(now);
  const jobs = await getDueEmailJobs(now);
  const result = { processed: 0, sent: 0, skipped: 0, failed: 0 };

  for (const job of jobs) {
    if (!(await claimScheduledEmailJob(job.eventKey))) continue;
    result.processed += 1;
    try {
      const delivery = job.payload.kind === "rendered_email"
        ? await sendQueuedRenderedEmail(job.payload)
        : job.emailType === "community_hub_unread"
          ? await processCommunityUnreadJob(job.payload)
          : job.emailType === "creator_hub_nudge"
            ? await processCreatorNudgeJob(job.payload)
            : { success: true, skipped: true };
      if (!delivery.success) {
        await retryOrFailEmailJob(job.eventKey, job.attempts + 1, delivery.error || "Email provider delivery failed");
        result.failed += 1;
      } else {
        await completeEmailEvent(job.eventKey, delivery);
        if (delivery.skipped) result.skipped += 1;
        else result.sent += 1;
      }
    } catch (error: any) {
      result.failed += 1;
      await retryOrFailEmailJob(job.eventKey, job.attempts + 1, error?.message || "Unknown email job error");
    }
  }

  return result;
}

export function startEmailJobScheduler(): void {
  cron.schedule("* * * * *", () => {
    processDueEmailJobs().catch((error) => console.error("[Email Job Scheduler] Processing failed:", error));
  });
  setImmediate(() => {
    processDueEmailJobs().catch((error) => console.error("[Email Job Scheduler] Startup check failed:", error));
  });
  console.log("[Email Job Scheduler] Started - checking every minute");
}
