import cron from 'node-cron';
import { db } from './db';
import { experiences, bookings } from '../shared/schema';
import { eq, and, lt, isNull, ne, or } from 'drizzle-orm';
import Stripe from 'stripe';
import { notificationService } from './notifications';
import { broadcastMVGUpdate } from './websocket';
import { storage } from './storage';
import { scheduleExperiencePayout } from './payout-scheduler';
import { lockCommissionsForExperience, voidCommissionsForExperience } from './commissionService';
import { sumBookingPayoutGrossCents } from './payoutRules';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

export function startMVGDeadlineScheduler() {
  cron.schedule('*/15 * * * *', async () => {
    console.log('[MVG Scheduler] Checking for expired MVG deadlines...');
    await processMVGDeadlines();
    await cleanupOrphanedPendingBookings();
  });

  // Run immediately on startup so no deadline is missed after a server restart
  setImmediate(async () => {
    console.log('[MVG Scheduler] Running startup check...');
    await processMVGDeadlines();
    await cleanupOrphanedPendingBookings();
  });
  
  console.log('[MVG Scheduler] Started - checking every 15 minutes');
}

export async function processMVGDeadlines(): Promise<{
  processed: number;
  captured: number;
  refunded: number;
  skipped: number;
  errors: number;
}> {
  const results = {
    processed: 0,
    captured: 0,
    refunded: 0,
    skipped: 0,
    errors: 0
  };
  
  try {
    const now = new Date();
    
    const eligibleExperiences = await db
      .select()
      .from(experiences)
      .where(
        and(
          eq(experiences.mvgStatus, 'pending'),
          eq(experiences.requireMinimumParticipants, true),
          eq(experiences.status, 'approved'),
          lt(experiences.mvgDeadline, now),
          isNull(experiences.mvgResolvedAt),
          isNull(experiences.mvgFailedAt)
        )
      );
    
    console.log(`[MVG Scheduler] Found ${eligibleExperiences.length} experiences with expired deadlines`);
    
    for (const experience of eligibleExperiences) {
      try {
        await db
          .update(experiences)
          .set({ mvgLastCheckedAt: now })
          .where(eq(experiences.id, experience.id));
        
        const mvgProgress = await storage.getMVGProgress(experience.id);
        
        console.log(`[MVG Scheduler] Experience ${experience.id}: ${mvgProgress.current_participants}/${mvgProgress.minimum_participants} (MVG ${mvgProgress.mvg_met ? 'MET' : 'NOT MET'})`);
        
        if (mvgProgress.mvg_met) {
          await processMVGSuccess(experience.id);
          results.captured++;
        } else {
          await processMVGFailure(experience.id);
          results.refunded++;
        }
        
        results.processed++;
        
      } catch (error) {
        console.error(`[MVG Scheduler] Error processing experience ${experience.id}:`, error);
        results.errors++;
      }
    }
    
    console.log(`[MVG Scheduler] Completed: ${results.processed} processed, ${results.captured} captured, ${results.refunded} refunded, ${results.errors} errors`);
    
  } catch (error) {
    console.error('[MVG Scheduler] Fatal error:', error);
  }
  
  return results;
}

async function processMVGSuccess(experienceId: string) {
  console.log(`[MVG Scheduler] Processing MVG SUCCESS for experience ${experienceId}`);
  
  const eligibleBookings = await storage.getEligibleDepositsForCapture(experienceId);
  console.log(`[MVG Scheduler] Found ${eligibleBookings.length} bookings to capture`);
  
  let capturedCount = 0;
  let stripeFailedCount = 0;
  
  for (const booking of eligibleBookings) {
    try {
      if (!booking.stripePaymentIntentId) {
        console.warn(`[MVG Scheduler] Booking ${booking.id} has no payment intent - marking as confirmed`);
      } else {
        try {
          await stripe.paymentIntents.capture(booking.stripePaymentIntentId);
          console.log(`[MVG Scheduler] Stripe capture successful for booking ${booking.id}`);
        } catch (stripeError: any) {
          console.error(`[MVG Scheduler] Stripe capture failed for booking ${booking.id}: ${stripeError.message}`);
          stripeFailedCount++;
        }
      }
      
      await storage.markDepositAsCaptured(booking.id);
      capturedCount++;
      console.log(`[MVG Scheduler] Marked booking ${booking.id} as captured in DB`);
      
    } catch (error: any) {
      console.error(`[MVG Scheduler] Failed to update booking ${booking.id}:`, error.message);
    }
  }
  
  const experience = await storage.getExperience(experienceId);
  if (!experience?.endDate) {
    throw new Error(`Cannot complete MVG success for ${experienceId}: event end date is missing`);
  }

  const confirmedBookings = await storage.getConfirmedBookings(experienceId);
  const grossCents = sumBookingPayoutGrossCents(confirmedBookings);

  // Schedule before leaving pending so a database failure remains retryable.
  await scheduleExperiencePayout(experienceId, new Date(experience.endDate), grossCents);

  await lockCommissionsForExperience(experienceId);
  await db
    .update(experiences)
    .set({
      mvgStatus: 'met',
      mvgResolvedAt: new Date()
    })
    .where(eq(experiences.id, experienceId));

  console.log(`[MVG Scheduler] MVG SUCCESS complete: ${capturedCount} captured, ${stripeFailedCount} Stripe failures`);

  // Send MVG confirmed notifications to all participants
  await notificationService.sendMVGConfirmedNotification(experience, confirmedBookings);

  const mvgProgress = await storage.getMVGProgress(experienceId);
  broadcastMVGUpdate({
    trip_id: experienceId,
    seats_taken: mvgProgress.current_participants,
    funded_amount: parseFloat(experience.price || '0') * mvgProgress.current_participants,
    funded_percent: 100,
    participants: []
  });
}

async function processMVGFailure(experienceId: string) {
  console.log(`[MVG Scheduler] Processing MVG FAILURE for experience ${experienceId}`);
  
  const eligibleBookings = await storage.getEligibleBookingsForRefund(experienceId);
  console.log(`[MVG Scheduler] Found ${eligibleBookings.length} bookings to refund`);
  
  let refundedCount = 0;
  let stripeFailedCount = 0;
  
  const refundedBookings: typeof eligibleBookings = [];
  const cancelledBookings: typeof eligibleBookings = [];
  const failedBookings: typeof eligibleBookings = [];
  
  for (const booking of eligibleBookings) {
    try {
      if (!booking.stripePaymentIntentId) {
        console.warn(`[MVG Scheduler] Booking ${booking.id} has no payment intent - marking as cancelled`);
      } else {
        try {
          await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
          console.log(`[MVG Scheduler] Stripe cancel successful for booking ${booking.id}`);
          refundedBookings.push(booking);
        } catch (stripeError: any) {
          console.error(`[MVG Scheduler] Stripe cancel failed for booking ${booking.id}: ${stripeError.message}`);
          cancelledBookings.push(booking);
          stripeFailedCount++;
        }
      }
      
      await storage.markBookingAsRefunded(booking.id);
      refundedCount++;
      console.log(`[MVG Scheduler] Marked booking ${booking.id} as refunded in DB`);
      
    } catch (error: any) {
      console.error(`[MVG Scheduler] Failed to update booking ${booking.id}:`, error.message);
      failedBookings.push(booking);
    }
  }
  
  await db
    .update(experiences)
    .set({
      status: 'cancelled',
      mvgStatus: 'failed',
      mvgFailedAt: new Date(),
      cancellationReason: 'MVG Not Reached',
      cancelledAt: new Date(),
      currentParticipants: 0
    })
    .where(eq(experiences.id, experienceId));
  await voidCommissionsForExperience(experienceId);
  
  const experience = await storage.getExperience(experienceId);
  if (experience) {
    await notificationService.sendMVGFailedNotification(experience, refundedBookings, cancelledBookings, failedBookings);
  }
  
  console.log(`[MVG Scheduler] MVG FAILURE complete: ${refundedCount} refunded, ${stripeFailedCount} Stripe failures, ${failedBookings.length} DB failures`);
  
  broadcastMVGUpdate({
    trip_id: experienceId,
    seats_taken: 0,
    funded_amount: 0,
    funded_percent: 0,
    participants: []
  });
}

// Cleanup pass: finds 'pending' bookings on already-cancelled experiences and refunds them.
// This handles cases where the MVG failure was processed before the status fix,
// leaving orphaned pending bookings that the original query missed.
export async function cleanupOrphanedPendingBookings(): Promise<void> {
  try {
    const orphaned = await db
      .select({
        bookingId: bookings.id,
        paymentIntentId: bookings.stripePaymentIntentId,
        experienceId: bookings.experienceId,
      })
      .from(bookings)
      .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
      .where(
        and(
          or(
            eq(bookings.status, 'pending'),
            eq(bookings.status, 'deposit_authorized')
          ),
          eq(experiences.status, 'cancelled'),
          isNull(bookings.cancelledAt),
          isNull(bookings.depositCapturedAt)
        )
      );

    if (orphaned.length === 0) return;

    console.log(`[MVG Cleanup] Found ${orphaned.length} orphaned pending booking(s) on cancelled experiences`);

    for (const row of orphaned) {
      try {
        if (row.paymentIntentId) {
          try {
            await stripe.paymentIntents.cancel(row.paymentIntentId);
            console.log(`[MVG Cleanup] Stripe cancel OK for booking ${row.bookingId}`);
          } catch (stripeErr: any) {
            // Already cancelled or captured — log and continue to DB update
            console.warn(`[MVG Cleanup] Stripe cancel skipped for ${row.bookingId}: ${stripeErr.message}`);
          }
        }
        await storage.markBookingAsRefunded(row.bookingId);
        console.log(`[MVG Cleanup] Marked booking ${row.bookingId} as cancelled/refunded`);
      } catch (err: any) {
        console.error(`[MVG Cleanup] Failed for booking ${row.bookingId}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[MVG Cleanup] Error during orphan cleanup:', err.message);
  }
}
