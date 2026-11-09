/**
 * Call an event off and give everyone their money back (Step 2, Nov 2026).
 *
 * Every paid ticket is charged at checkout, so cancelling an event has to
 * refund real money, not just let card holds lapse. Archiving stays what it
 * was (hide the event, keep the history); this is the action that refunds.
 *
 * Refused once the event's payout has gone out: the money has been shared
 * with the organiser, venue and partners, and refunding it would come out of
 * the platform balance. That needs a person, not a button.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { experiences, scheduledPayouts } from "@shared/schema";
import { storage } from "./storage";
import { notificationService } from "./notifications";
import { returnBookingMoney } from "./mvg-scheduler";
import { voidCommissionsForExperience } from "./commissionService";
import { releaseVenueDatesForExperience } from "./icalSync";
import { countsTowardsGroup } from "@shared/groupCount";

export type CancelEventResult =
  | { ok: false; status: number; message: string }
  | { ok: true; refunded: number; freeCancelled: number; failed: Array<{ bookingId: string; message: string }> };

function euros(amount: unknown, currency: string): string {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(value);
  } catch {
    return `€${value.toFixed(2)}`;
  }
}

export async function cancelEventAndRefund(experienceId: string, reason: string): Promise<CancelEventResult> {
  const experience = await storage.getExperience(experienceId);
  if (!experience) return { ok: false, status: 404, message: "Event not found" };

  const paidOut = await db
    .select({ id: scheduledPayouts.id })
    .from(scheduledPayouts)
    .where(and(eq(scheduledPayouts.experienceId, experienceId), inArray(scheduledPayouts.status, ["completed", "processing"] as any)));
  if (paidOut.length > 0) {
    return { ok: false, status: 409, message: "This event's payout has already gone out, so it cannot be refunded automatically." };
  }

  const now = new Date();
  await db
    .update(experiences)
    .set({ status: "cancelled", cancellationReason: reason, cancelledAt: now } as any)
    .where(eq(experiences.id, experienceId));
  await db
    .update(scheduledPayouts)
    .set({ status: "cancelled", errorMessage: `Event cancelled: ${reason}`, processedAt: now })
    .where(and(eq(scheduledPayouts.experienceId, experienceId), inArray(scheduledPayouts.status, ["pending", "failed"] as any)));
  await voidCommissionsForExperience(experienceId);
  await releaseVenueDatesForExperience(experienceId).catch(() => undefined);

  const currency = (experience.currency || "eur").toLowerCase();
  const result = { ok: true as const, refunded: 0, freeCancelled: 0, failed: [] as Array<{ bookingId: string; message: string }> };
  const bookings = (await storage.getBookingsByExperience(experienceId)).filter(countsTowardsGroup);

  for (const booking of bookings) {
    const paid = Number(booking.amount) > 0 && !!booking.stripePaymentIntentId;
    try {
      if (paid) await returnBookingMoney(booking as any);
      await storage.markBookingAsRefunded(booking.id);
      if (paid) result.refunded += 1;
      else result.freeCancelled += 1;

      const buyer = booking.userId ? await storage.getUser(booking.userId) : undefined;
      if (buyer?.email) {
        await notificationService.sendBookingCancelledEmail({
          to: buyer.email,
          firstName: buyer.firstName,
          eventName: experience.title,
          outcome: paid ? "refunded" : "cancelled",
          amountLabel: euros(booking.amount, currency),
          bookingId: booking.id,
        }).catch((error: any) => console.error(`[Event Cancel] Email to ${buyer.email} failed:`, error?.message));
      }
    } catch (error: any) {
      // Left as it was, so the cleanup run (or this button again) retries it.
      result.failed.push({ bookingId: booking.id, message: error?.message || "Refund failed" });
      console.error(`[Event Cancel] Could not refund booking ${booking.id}:`, error?.message);
    }
  }

  console.log(`[Event Cancel] ${experienceId} cancelled: ${result.refunded} refunded, ${result.freeCancelled} free places cancelled, ${result.failed.length} failed`);
  return result;
}
