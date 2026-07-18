import cron from "node-cron";
import { and, eq, gt, inArray, lte, or } from "drizzle-orm";
import { db } from "./db";
import { bookings, experiences } from "@shared/schema";
import { storage } from "./storage";
import { notificationService } from "./notifications";

const DAY_MS = 24 * 60 * 60 * 1000;

export function startEventReminderScheduler() {
  cron.schedule("0 * * * *", async () => {
    await sendDueEvent24HourReminders();
  });

  setImmediate(() => {
    sendDueEvent24HourReminders().catch((error) => {
      console.error("[Event Reminder Scheduler] Startup check failed:", error);
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
