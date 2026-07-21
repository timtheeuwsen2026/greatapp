import type { Booking, Experience } from "@shared/schema";
import { notificationService } from "./notifications";
import { storage } from "./storage";

const INACTIVE_BOOKING_STATUSES = new Set(["cancelled", "refunded", "failed"]);

async function settleNotificationTasks(tasks: Array<{ label: string; task: Promise<unknown> }>): Promise<void> {
  const results = await Promise.allSettled(tasks.map(({ task }) => task));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`[Booking notification] ${tasks[index].label} failed:`, result.reason);
    }
  });
}

function formatCurrency(amount: string | number | null | undefined, currency?: string | null): string {
  const value = Number(amount || 0);
  const code = String(currency || "USD").toUpperCase();
  return `${code} ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
}

export async function sendBookingNotificationsAfterPayment(
  bookingId: string,
  options: { sendParticipant?: boolean } = {},
): Promise<void> {
  const booking = await storage.getBooking(bookingId);
  if (!booking || INACTIVE_BOOKING_STATUSES.has(String(booking.status))) return;

  const experience = await storage.getExperience(booking.experienceId);
  if (!experience) return;

  const experienceBookings = await storage.getBookingsByExperience(experience.id);
  const currentParticipants = experienceBookings.filter(
    (item) => !INACTIVE_BOOKING_STATUSES.has(String(item.status)),
  ).length;
  const notificationExperience: Experience = {
    ...experience,
    currentParticipants,
  };

  const coreNotifications: Array<{ label: string; task: Promise<unknown> }> = [];
  if (options.sendParticipant !== false) {
    coreNotifications.push({
      label: "participant booking confirmation",
      task: notificationService.sendDepositCreatedNotification(
        booking.userId,
        notificationExperience,
        booking as Booking,
      ),
    });
  }

  if (experience.creatorId) {
    coreNotifications.push({
      label: "creator new-member alert",
      task: notificationService.sendCreatorNewMemberNotification(
        experience.creatorId,
        notificationExperience,
        booking.userId,
        booking.id,
      ),
    });
  }
  await settleNotificationTasks(coreNotifications);

  const commissionAmount = Number(booking.commissionAmount || 0);
  if (booking.promoterId) {
    const [promoterResult, milestoneResult] = await Promise.allSettled([
      storage.getUser(booking.promoterId),
      storage.syncMilestoneFulfillmentForBooking(booking.id),
    ]);
    const promoter = promoterResult.status === "fulfilled" ? promoterResult.value : undefined;
    const milestoneProgress = milestoneResult.status === "fulfilled" ? milestoneResult.value : undefined;
    if (promoterResult.status === "rejected") {
      console.error("[Booking notification] referral owner lookup failed:", promoterResult.reason);
    }
    if (milestoneResult.status === "rejected") {
      console.error("[Booking notification] milestone fulfillment sync failed:", milestoneResult.reason);
    }
    if (promoter?.email) {
      if (milestoneProgress) {
        const milestoneEmails: Array<{ label: string; task: Promise<unknown> }> = [
          {
            label: "referral booking progress",
            task: notificationService.sendReferralBookingProgressEmail({
              to: promoter.email,
              userFirstName: promoter.firstName,
              eventName: experience.title,
              qualifyingBookings: milestoneProgress.qualifyingBookings,
              milestoneTarget: milestoneProgress.milestoneTarget,
              eventKey: `referral_booking_progress:${booking.id}:${booking.promoterId}`,
            }),
          },
        ];

        if (milestoneProgress.unlocked) {
          milestoneEmails.push({
            label: "milestone perk unlocked",
            task: notificationService.sendMilestonePerkUnlockedEmail({
              to: promoter.email,
              userFirstName: promoter.firstName,
              eventName: experience.title,
              milestoneTarget: milestoneProgress.milestoneTarget,
              rewardDescription: milestoneProgress.rewardDescription,
              eventKey: `milestone_perk_unlocked:${milestoneProgress.promoterExperienceId}`,
            }),
          });
        }

        await settleNotificationTasks(milestoneEmails);
      } else if (commissionAmount > 0) {
        await settleNotificationTasks([{
          label: "affiliate sale",
          task: notificationService.sendAffiliateSaleMadeEmail({
            to: promoter.email,
            eventName: experience.title,
            earnedAmount: formatCurrency(
              booking.commissionAmount,
              booking.commissionCurrency || experience.currency,
            ),
            eventKey: `affiliate_sale:${booking.id}:${booking.promoterId}`,
          }),
        }]);
      }
    }
  }
}
