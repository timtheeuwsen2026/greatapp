import type { Booking, Experience } from "@shared/schema";
import { notificationService } from "./notifications";
import { storage } from "./storage";

const INACTIVE_BOOKING_STATUSES = new Set(["cancelled", "refunded", "failed"]);

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

  if (options.sendParticipant !== false) {
    await notificationService.sendDepositCreatedNotification(
      booking.userId,
      notificationExperience,
      booking as Booking,
    );
  }

  if (experience.creatorId) {
    await notificationService.sendCreatorNewMemberNotification(
      experience.creatorId,
      notificationExperience,
      booking.userId,
      booking.id,
    );
  }

  const commissionAmount = Number(booking.commissionAmount || 0);
  if (booking.promoterId) {
    const [promoter, milestoneProgress] = await Promise.all([
      storage.getUser(booking.promoterId),
      storage.syncMilestoneFulfillmentForBooking(booking.id),
    ]);
    if (promoter?.email) {
      if (milestoneProgress) {
        const milestoneEmails = [
          notificationService.sendReferralBookingProgressEmail({
            to: promoter.email,
            userFirstName: promoter.firstName,
            eventName: experience.title,
            qualifyingBookings: milestoneProgress.qualifyingBookings,
            milestoneTarget: milestoneProgress.milestoneTarget,
            eventKey: `referral_booking_progress:${booking.id}:${booking.promoterId}`,
          }),
        ];

        if (milestoneProgress.unlocked) {
          milestoneEmails.push(notificationService.sendMilestonePerkUnlockedEmail({
            to: promoter.email,
            userFirstName: promoter.firstName,
            eventName: experience.title,
            milestoneTarget: milestoneProgress.milestoneTarget,
            rewardDescription: milestoneProgress.rewardDescription,
            eventKey: `milestone_perk_unlocked:${milestoneProgress.promoterExperienceId}`,
          }));
        }

        await Promise.all(milestoneEmails);
      } else if (commissionAmount > 0) {
        await notificationService.sendAffiliateSaleMadeEmail({
          to: promoter.email,
          eventName: experience.title,
          earnedAmount: formatCurrency(
            booking.commissionAmount,
            booking.commissionCurrency || experience.currency,
          ),
          eventKey: `affiliate_sale:${booking.id}:${booking.promoterId}`,
        });
      }
    }
  }
}
