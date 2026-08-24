import cron from "node-cron";
import { and, eq, gt, inArray, lte, or } from "drizzle-orm";
import { db } from "./db";
import { bookings, experiences, reviews } from "@shared/schema";
import { storage } from "./storage";
import { notificationService } from "./notifications";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** How long after an event finishes we ask what they thought. */
const REVIEW_REQUEST_DELAY_MS = 2 * HOUR_MS;

/**
 * How far back the review sweep will look.
 *
 * Without this the first run after deploy would email every attendee of every
 * event ever held. Two days is comfortably wider than the hourly cron needs.
 */
const REVIEW_REQUEST_LOOKBACK_MS = 2 * DAY_MS;

/**
 * When an event actually finished.
 *
 * A day event carries an endTime; a trip only has a date, so it finishes at the
 * end of that day. Getting this wrong in the other direction would email people
 * asking how it went while they were still standing in the room.
 */
export function resolveEventEndsAt(experience: any): Date | null {
  const raw = experience?.endDate || experience?.startDate;
  if (!raw) return null;
  const ends = new Date(raw);
  if (Number.isNaN(ends.getTime())) return null;

  const endTime = typeof experience?.endTime === "string" ? experience.endTime.trim() : "";
  const match = endTime.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      ends.setHours(hours, minutes, 0, 0);
      return ends;
    }
  }

  ends.setHours(23, 59, 59, 999);
  return ends;
}

export function startEventReminderScheduler() {
  cron.schedule("0 * * * *", async () => {
    await sendDueEvent24HourReminders();
    await sendDueReviewRequests();
  });

  setImmediate(() => {
    sendDueEvent24HourReminders().catch((error) => {
      console.error("[Event Reminder Scheduler] Startup check failed:", error);
    });
    sendDueReviewRequests().catch((error) => {
      console.error("[Event Reminder Scheduler] Review request check failed:", error);
    });
  });

  console.log("[Event Reminder Scheduler] Started - checking hourly");
}

export async function sendDueEvent24HourReminders(now = new Date()): Promise<{ sent: number; skipped: number; errors: number }> {
  const windowEnd = new Date(now.getTime() + DAY_MS);
  const dueExperiences = await db
    .select()
    .from(experiences)
    .where(and(
      gt(experiences.startDate, now),
      lte(experiences.startDate, windowEnd),
      inArray(experiences.status, ["approved", "published"] as any),
      or(
        eq(experiences.requireMinimumParticipants, false),
        eq(experiences.mvgStatus, "met"),
      ),
    ));

  const result = { sent: 0, skipped: 0, errors: 0 };

  for (const experience of dueExperiences) {
    const confirmedBookings = await storage.getConfirmedBookings(experience.id);
    for (const booking of confirmedBookings) {
      try {
        const user = await storage.getUser(booking.userId);
        if (!user?.email) {
          result.skipped += 1;
          continue;
        }

        const delivery = await notificationService.sendEvent24HourReminderEmail({
          to: user.email,
          userId: user.id,
          userFirstName: user.firstName,
          experienceTitle: experience.title,
          experienceSlugOrId: (experience as any).slug || experience.id,
          experience,
          startTime: experience.startDate,
          eventKey: `event_24h_reminder:${experience.id}:${booking.id}`,
        });
        if (delivery.skipped) result.skipped += 1;
        else result.sent += 1;
      } catch (error) {
        result.errors += 1;
        console.error(`[Event Reminder Scheduler] Failed reminder for booking ${booking.id}:`, error);
      }
    }
  }

  if (result.sent || result.errors) {
    console.log(`[Event Reminder Scheduler] 24-hour reminders: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors`);
  }

  return result;
}

/**
 * Asks everyone who attended a finished event to rate it.
 *
 * Runs on the same hourly tick as the reminder, so an event is asked about
 * within an hour of the two-hour mark. Idempotent through the email ledger's
 * event key, and it skips anyone who has already left a review — somebody who
 * rated it straight off the back of the event should not then be emailed
 * about it.
 */
export async function sendDueReviewRequests(now = new Date()): Promise<{ sent: number; skipped: number; errors: number }> {
  const result = { sent: 0, skipped: 0, errors: 0 };

  const earliestEnd = new Date(now.getTime() - REVIEW_REQUEST_LOOKBACK_MS);
  const latestEnd = new Date(now.getTime() - REVIEW_REQUEST_DELAY_MS);

  const candidates = await db
    .select()
    .from(experiences)
    .where(and(
      // A generous SQL window on the date column; resolveEventEndsAt below
      // applies the real cutoff once the end time is known.
      gt(experiences.endDate, new Date(earliestEnd.getTime() - DAY_MS)),
      lte(experiences.endDate, now),
      inArray(experiences.status, ["approved", "published"] as any),
    ));

  for (const experience of candidates) {
    const endsAt = resolveEventEndsAt(experience);
    if (!endsAt) continue;
    if (endsAt > latestEnd) continue;      // hasn't been two hours yet
    if (endsAt < earliestEnd) continue;    // too old to start asking now

    const attendees = await storage.getConfirmedBookings(experience.id);
    if (!attendees.length) continue;

    const alreadyReviewed = new Set(
      (await db.select().from(reviews).where(eq(reviews.experienceId, experience.id)))
        .map((review) => review.userId),
    );

    for (const booking of attendees) {
      try {
        if (alreadyReviewed.has(booking.userId)) {
          result.skipped += 1;
          continue;
        }

        const user = await storage.getUser(booking.userId);
        if (!user?.email) {
          result.skipped += 1;
          continue;
        }

        const delivery = await notificationService.sendReviewRequestEmail({
          to: user.email,
          userId: user.id,
          userFirstName: user.firstName,
          experienceId: experience.id,
          experienceTitle: experience.title,
          eventKey: `event_review_request:${experience.id}:${booking.id}`,
        });
        if (delivery.skipped) result.skipped += 1;
        else result.sent += 1;
      } catch (error) {
        result.errors += 1;
        console.error(`[Event Reminder Scheduler] Failed review request for booking ${booking.id}:`, error);
      }
    }
  }

  if (result.sent || result.errors) {
    console.log(`[Event Reminder Scheduler] Review requests: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors`);
  }

  return result;
}
