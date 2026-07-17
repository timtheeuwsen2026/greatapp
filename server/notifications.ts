import sgMail from '@sendgrid/mail';
import { storage } from './storage';
import { db } from './db';
import { bookingEmailEvents } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Booking, Experience } from '@shared/schema';
import { renderMasterEmailTemplate, type EmailReceiptRow, type GrowthFooterContext } from './emailTemplates';

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// FROM_EMAIL must be a verified sender in Resend or SendGrid.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'noreply@great.com';
const FROM_NAME = process.env.RESEND_FROM_NAME || process.env.SENDGRID_FROM_NAME || 'Great. Experiences';

// Public base URL used for links inside emails (View Event Details, dashboards).
const APP_BASE_URL = (process.env.VITE_APP_BASE_URL || process.env.APP_BASE_URL || 'https://greatapp.replit.app').replace(/\/$/, '');
const GREAT_LOGO_URL = process.env.GREAT_LOGO_URL || `${APP_BASE_URL}/email-assets/great-logo.jpg`;

function experienceDetailsUrl(slugOrId: string): string {
  return `${APP_BASE_URL}/experience/${slugOrId}`;
}

// Human-readable one-liner for a promotion deal's baseline/counter terms.
export function formatPromotionDealSummary(
  dealType: string | null | undefined,
  terms: Record<string, any> | null | undefined,
  currency?: string | null,
): string {
  const t = terms || {};
  const cur = String(currency || t.currency || 'eur').toUpperCase();
  switch (dealType) {
    case 'commission_per_ticket':
      return `Commission per Ticket — ${t.commissionPct ?? t.influencerCommissionPct ?? 0}% per ticket sold`;
    case 'milestone_barter':
      return `Milestone Barter — bring ${t.attendeeTarget ?? 'X'} attendees, earn ${t.rewardTickets ?? 1} free ticket(s)`;
    case 'brand_barter':
      return `Brand Barter — ${t.brandPitch || 'products or services in exchange for exposure'}`;
    case 'financial_sponsorship':
      return `Financial Sponsorship — ${cur} ${t.sponsorshipAmount ?? 0} for exposure`;
    default:
      return 'Promotion partnership deal';
  }
}

// Human-readable one-liner for a venue deal's commercial model.
export function formatVenueDealSummary(
  model: string | null | undefined,
  terms: Record<string, any> | null | undefined,
  currency?: string | null,
): string {
  const t = terms || {};
  const cur = String(currency || t.currency || 'eur').toUpperCase();
  switch (model) {
    case 'fixed_fee':
      return `Flat Fee — ${cur} ${t.fixedFee ?? 0}`;
    case 'per_head':
      return `Per Head — ${cur} ${t.perHeadAmount ?? 0} per participant`;
    case 'minimum_spend':
      return `Minimum Spend Guarantee — ${cur} ${t.minimumSpend ?? 0}`;
    case 'revenue_share':
      return `Revenue Share — ${t.revenueSharePct ?? 0}% of ticket sales`;
    case 'venue_sponsored':
      return `Venue-Sponsored — venue pays ${cur} ${t.fixedFee ?? 0} to the creator`;
    case 'upfront_rental':
      return `Upfront Rental — creator pays ${cur} ${t.fixedFee ?? 0} rental fee`;
    case 'access_only':
      return `Access-Only / Pay-at-Counter${t.accessFee ? ` — ${cur} ${t.accessFee} access fee` : ''}`;
    default:
      return model || 'Venue deal';
  }
}

export interface NotificationPayload {
  type: 'mvg_confirmed' | 'mvg_failed' | 'deposit_created' | 'balance_due';
  experienceId: string;
  experienceTitle: string;
  userId: string;
  userEmail?: string;
  data: Record<string, any>;
}

async function hasEmailBeenSentSuccessfully(bookingId: string, emailType: 'booking_created' | 'mvg_confirmed' | 'mvg_failed'): Promise<boolean> {
  // Only consider successful emails as "sent" - failed emails should be retryable
  const existing = await db.select()
    .from(bookingEmailEvents)
    .where(and(
      eq(bookingEmailEvents.bookingId, bookingId),
      eq(bookingEmailEvents.emailType, emailType),
      eq(bookingEmailEvents.success, true)
    ))
    .limit(1);
  return existing.length > 0;
}

async function recordEmailSent(
  bookingId: string, 
  emailType: 'booking_created' | 'mvg_confirmed' | 'mvg_failed',
  recipientEmail: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await db.insert(bookingEmailEvents).values({
    bookingId,
    emailType,
    recipientEmail,
    success,
    errorMessage: errorMessage || null,
  });
}

async function sendEmail(to: string, subject: string, textContent: string, htmlContent?: string): Promise<{ success: boolean; error?: string }> {
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [to],
          subject,
          text: textContent,
          html: htmlContent || textContent.replace(/\n/g, '<br>'),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`📧 [RESEND FAILED] Error sending to ${to}: ${errorBody} (Code: ${response.status})`);
        return { success: false, error: errorBody };
      }

      console.log(`📧 [RESEND SENT] Successfully sent to ${to}: ${subject}`);
      return { success: true };
    } catch (error: any) {
      console.error(`📧 [RESEND FAILED] Error sending to ${to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  if (!process.env.SENDGRID_API_KEY) {
    console.log(`📧 [EMAIL - NO API KEY] Would send email to ${to}: ${subject}`);
    return { success: true };
  }

  try {
    await sgMail.send({
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      text: textContent,
      html: htmlContent || textContent.replace(/\n/g, '<br>'),
    });
    console.log(`📧 [EMAIL SENT] Successfully sent to ${to}: ${subject}`);
    return { success: true };
  } catch (error: any) {
    const errorBody = error.response?.body?.errors?.[0]?.message || error.message;
    const errorCode = error.code || error.response?.statusCode;
    console.error(`📧 [EMAIL FAILED] Error sending to ${to}: ${errorBody} (Code: ${errorCode})`);
    
    // Provide helpful guidance for common errors
    if (errorCode === 403 || error.message === 'Forbidden') {
      console.error(`📧 [EMAIL CONFIG] The sender email "${FROM_EMAIL}" is not verified in SendGrid.`);
      console.error(`📧 [EMAIL CONFIG] Please set SENDGRID_FROM_EMAIL to a verified sender email in your SendGrid account.`);
    }
    
    return { success: false, error: errorBody };
  }
}

function renderBaseEmail(opts: {
  to: string;
  bodyText: string;
  receiptRows?: EmailReceiptRow[];
  cta?: { label: string; href: string };
  preheader?: string;
  growthFooterContext?: GrowthFooterContext;
}) {
  return renderMasterEmailTemplate({
    recipientEmail: opts.to,
    bodyText: opts.bodyText,
    receiptRows: opts.receiptRows,
    cta: opts.cta,
    preheader: opts.preheader,
    growthFooterContext: opts.growthFooterContext,
    logoUrl: GREAT_LOGO_URL,
    appBaseUrl: APP_BASE_URL,
  });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'TBD';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return 'TBD';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatCurrency(amount: string | number | null | undefined): string {
  if (!amount) return '$0.00';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `$${num.toFixed(2)}`;
}

function communityHubUrl(): string {
  return `${APP_BASE_URL}/community-hub`;
}

function bookingTotalPaid(booking: Booking): string | number | null | undefined {
  if (booking.balancePaid || !booking.isDepositOnly) {
    return booking.totalPrice || booking.depositAmount;
  }

  return booking.depositAmount || booking.totalPrice;
}

class NotificationService {
  private logs: NotificationPayload[] = [];

  async sendWelcomeVerifyEmail(opts: {
    to: string;
    userFirstName?: string | null;
    verifyUrl: string;
  }): Promise<void> {
    const firstName = opts.userFirstName?.trim() || 'there';
    const subject = 'Welcome to the Tribe! Please verify your email ⚡️';
    const bodyText = `Hey ${firstName}, welcome to the platform. We are thrilled to have you here. To unlock full access to experiences, community hubs, and partner deals, please verify your email address below.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'Verify My Email', href: opts.verifyUrl },
      preheader: 'Verify your email to unlock full access to Great.',
      growthFooterContext: 'account',
    });

    const result = await sendEmail(opts.to, subject, email.text, email.html);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send welcome verification email');
    }
  }

  async sendPasswordResetEmail(opts: {
    to: string;
    resetUrl: string;
  }): Promise<void> {
    const subject = 'Reset your password';
    const bodyText = `We received a request to reset your password. Click the button below to choose a new one. If you didn't request this, you can safely ignore this email.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'Reset Password', href: opts.resetUrl },
      preheader: 'Use this secure link to reset your Great. password.',
      growthFooterContext: 'security',
    });

    const result = await sendEmail(opts.to, subject, email.text, email.html);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send password reset email');
    }
  }

  private renderBookingConfirmedEmail(opts: {
    to: string;
    userFirstName?: string | null;
    experience: Experience;
    booking: Booking;
  }): { subject: string; text: string; html: string } {
    const eventName = opts.experience.title;
    const subject = `It's Happening! You're confirmed for ${eventName} 🔥`;
    const bodyText = `Hey ${opts.userFirstName || 'there'}, pack your bags! ${eventName} is officially confirmed and your spot is locked in. The system just announced your arrival in the Community Hub. Jump in, say hi, and introduce yourself to the squad!`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      receiptRows: [
        { label: 'Ticket Type', value: opts.booking.ticketName || 'General Admission' },
        { label: 'Total Paid', value: formatCurrency(bookingTotalPaid(opts.booking)) },
      ],
      cta: { label: 'Meet Your Squad in the Hub', href: communityHubUrl() },
      preheader: `${eventName} is confirmed and your spot is locked in.`,
      growthFooterContext: 'confirmed_participant',
    });

    return { subject, text: email.text, html: email.html };
  }

  async sendCommunityHubUnreadEmail(opts: {
    to: string;
    userFirstName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
  }): Promise<void> {
    const subject = `You have unread messages in the ${opts.experienceTitle} Hub 💬`;
    const bodyText = `Hey ${opts.userFirstName || 'there'}, the squad is talking! There are new messages waiting for you in the ${opts.experienceTitle} Community Hub. Catch up on the conversation and get to know your fellow attendees before the experience begins.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'Reply in the Hub', href: communityHubUrl() },
      preheader: `New messages are waiting in the ${opts.experienceTitle} Hub.`,
      growthFooterContext: 'confirmed_participant',
    });

    const result = await sendEmail(opts.to, subject, email.text, email.html);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send unread hub email');
    }
  }

  async sendEvent24HourReminderEmail(opts: {
    to: string;
    userFirstName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    startTime: Date | string;
  }): Promise<void> {
    const subject = `Get ready! ${opts.experienceTitle} starts tomorrow ⏳`;
    const bodyText = `Hey ${opts.userFirstName || 'there'}, your experience is almost here! ${opts.experienceTitle} kicks off tomorrow at ${formatTime(opts.startTime)}. Double-check the location details and jump into the Community Hub if you need to coordinate with the squad.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'View Event Details', href: experienceDetailsUrl(opts.experienceSlugOrId) },
      preheader: `${opts.experienceTitle} starts tomorrow at ${formatTime(opts.startTime)}.`,
      growthFooterContext: 'confirmed_participant',
    });

    const result = await sendEmail(opts.to, subject, email.text, email.html);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send 24-hour event reminder email');
    }
  }

  async sendBookingCreatedEmail(userId: string, experience: Experience, booking: Booking): Promise<void> {
    try {
      if (await hasEmailBeenSentSuccessfully(booking.id, 'booking_created')) {
        console.log(`📧 [IDEMPOTENT] Booking created email already sent for booking ${booking.id}`);
        return;
      }

      const user = await storage.getUser(userId);
      if (!user || !user.email) {
        console.warn(`Cannot send booking created email: no email for user ${userId}`);
        return;
      }

      const currentParticipants = experience.currentParticipants ?? 0;
      const minimumParticipants = experience.minimumParticipants ?? 0;
      const remainingMvgSpots = Math.max(0, minimumParticipants - currentParticipants);
      const mvgNotMet = !!experience.requireMinimumParticipants
        && experience.mvgStatus !== 'met'
        && remainingMvgSpots > 0;

      let subject = `Your deposit is secured - ${experience.title}`;
      let textContent = `
Hi ${user.firstName || 'there'},

Great news! Your deposit for "${experience.title}" has been authorized.

📍 Experience: ${experience.title}
📅 Start Date: ${formatDate(experience.startDate)}
💰 Deposit Amount: ${formatCurrency(booking.depositAmount)}
📊 Status: Deposit authorized – waiting for group to form

What happens next?
${experience.requireMinimumParticipants 
  ? `• This experience requires a minimum group size of ${experience.minimumParticipants} participants
• Your deposit is fully refundable until the group forms
• We'll notify you when the trip is confirmed`
  : `• Your booking is confirmed
• We'll send you more details closer to the experience date`}

Questions? Just reply to this email.

See you on the adventure!
The Great. Team
      `.trim();
      let htmlContent: string | undefined;

      if (mvgNotMet) {
        subject = `Spot reserved! We need ${remainingMvgSpots} more people to confirm ${experience.title}`;
        const bodyText = `Hey ${user.firstName || 'there'}, you are officially on the roster for ${experience.title}! Because this is a community-powered experience, it only happens if we hit our minimum group size. Your spot is reserved, but we still need ${remainingMvgSpots} more people to lock it in. The system just announced your arrival in the Community Hub. Jump in, say hi, and introduce yourself to the squad!`;
        const email = renderBaseEmail({
          to: user.email,
          bodyText,
          receiptRows: [
            { label: 'Ticket Type', value: booking.ticketName || 'General Admission' },
            { label: 'Deposit Paid Today', value: formatCurrency(booking.depositAmount) },
            { label: 'Balance Due upon Confirmation', value: formatCurrency(booking.balanceAmount) },
          ],
          cta: { label: 'Introduce Yourself in the Hub', href: communityHubUrl() },
          preheader: `Your spot is reserved for ${experience.title}. Help unlock the group.`,
          growthFooterContext: 'pre_mvg_participant',
        });
        textContent = email.text;
        htmlContent = email.html;
      } else {
        const email = this.renderBookingConfirmedEmail({
          to: user.email,
          userFirstName: user.firstName,
          experience,
          booking,
        });
        subject = email.subject;
        textContent = email.text;
        htmlContent = email.html;
      }

      const result = await sendEmail(user.email, subject, textContent, htmlContent);
      await recordEmailSent(booking.id, 'booking_created', user.email, result.success, result.error);

      this.logNotification({
        type: 'deposit_created',
        experienceId: experience.id,
        experienceTitle: experience.title,
        userId,
        userEmail: user.email,
        data: {
          bookingId: booking.id,
          depositAmount: booking.depositAmount,
          depositStatus: booking.depositStatus,
          requiresMinimum: experience.requireMinimumParticipants,
        }
      });

    } catch (error: any) {
      console.error(`Error sending booking created email:`, error.message);
    }
  }

  async sendMVGConfirmedNotification(experience: Experience, bookings: Booking[]): Promise<void> {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║        🎉 MVG CONFIRMED - COMMUNITY CONFIRMED! 🎉             ║
╠════════════════════════════════════════════════════════════════╣
║ Experience: ${experience.title.padEnd(50)} ║
║ Location: ${experience.location.padEnd(52)} ║
║ Participants: ${bookings.length.toString().padEnd(47)} ║
╠════════════════════════════════════════════════════════════════╣
║ AUTOMATED ACTIONS:                                             ║
║ ✓ Deposits locked (non-refundable)                             ║
║ ✓ Venue deposit release initiated                              ║
║ ✓ Balance payment reminders scheduled                          ║
╚════════════════════════════════════════════════════════════════╝
    `);

    let emailsSent = 0;
    let emailsSkipped = 0;

    for (const booking of bookings) {
      try {
        if (await hasEmailBeenSentSuccessfully(booking.id, 'mvg_confirmed')) {
          console.log(`📧 [IDEMPOTENT] MVG confirmed email already sent for booking ${booking.id}`);
          emailsSkipped++;
          continue;
        }

        const user = await storage.getUser(booking.userId);
        if (!user || !user.email) {
          console.warn(`Cannot send MVG confirmed email: no email for user ${booking.userId}`);
          continue;
        }

        const email = this.renderBookingConfirmedEmail({
          to: user.email,
          userFirstName: user.firstName,
          experience,
          booking,
        });

        const result = await sendEmail(user.email, email.subject, email.text, email.html);
        await recordEmailSent(booking.id, 'mvg_confirmed', user.email, result.success, result.error);
        emailsSent++;

        this.logNotification({
          type: 'mvg_confirmed',
          experienceId: experience.id,
          experienceTitle: experience.title,
          userId: booking.userId,
          userEmail: user.email,
          data: {
            bookingId: booking.id,
            location: experience.location,
            startDate: experience.startDate,
            endDate: experience.endDate,
            depositAmount: booking.depositAmount,
            balanceAmount: booking.balanceAmount,
            balanceDueDate: booking.balanceDueDate,
            totalParticipants: bookings.length,
          }
        });

      } catch (error: any) {
        console.error(`Error sending MVG confirmed notification to user ${booking.userId}:`, error.message);
      }
    }

    console.log(`📧 [MVG CONFIRMED] Sent ${emailsSent} emails, skipped ${emailsSkipped} (already sent)`);
  }

  async sendMVGFailedNotification(
    experience: Experience, 
    refundedBookings: Booking[], 
    cancelledBookings: Booking[] = [], 
    failedRefundBookings: Booking[] = []
  ): Promise<void> {
    const totalBookings = refundedBookings.length + cancelledBookings.length + failedRefundBookings.length;
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║        ⚠️  MVG FAILED - MINIMUM NOT REACHED ⚠️                ║
╠════════════════════════════════════════════════════════════════╣
║ Experience: ${experience.title.padEnd(50)} ║
║ Location: ${experience.location.padEnd(52)} ║
║ Participants: ${totalBookings.toString().padEnd(47)} ║
║ Minimum Required: ${(experience.minimumParticipants || 0).toString().padEnd(41)} ║
╠════════════════════════════════════════════════════════════════╣
║ AUTOMATED ACTIONS:                                             ║
║ ✓ Deposits refunded: ${refundedBookings.length.toString().padEnd(42)} ║
║ ✓ Bookings cancelled: ${cancelledBookings.length.toString().padEnd(41)} ║
║ ⚠ Refunds failed: ${failedRefundBookings.length.toString().padEnd(44)} ║
║ ✓ Participants notified                                        ║
╚════════════════════════════════════════════════════════════════╝
    `);

    let emailsSent = 0;
    let emailsSkipped = 0;

    const sendFailedEmail = async (booking: Booking, wasRefunded: boolean, refundFailed: boolean = false) => {
      try {
        if (await hasEmailBeenSentSuccessfully(booking.id, 'mvg_failed')) {
          console.log(`📧 [IDEMPOTENT] MVG failed email already sent for booking ${booking.id}`);
          emailsSkipped++;
          return;
        }

        const user = await storage.getUser(booking.userId);
        if (!user || !user.email) {
          console.warn(`Cannot send MVG failed email: no email for user ${booking.userId}`);
          return;
        }

        let subject: string;
        let textContent: string;
        let htmlContent: string | undefined;

        if (refundFailed) {
          subject = `Important: Issue with your refund for ${experience.title}`;
          textContent = `
Hi ${user.firstName || 'there'},

⚠️ We encountered an issue processing your refund of ${formatCurrency(booking.depositAmount)}.
Our team has been notified and will process your refund manually within 3-5 business days.
If you don't see your refund after 5 business days, please contact us.

The Great. Team
          `.trim();
        } else {
          subject = `Update on ${experience.title}: Minimum group not reached`;
          const amountRefunded = wasRefunded ? booking.depositAmount : 0;
          const bodyText = `Hey ${user.firstName || 'there'}, unfortunately, we didn't quite reach the minimum group size needed to make ${experience.title} happen this time. Your reservation has been canceled, and a full refund of ${formatCurrency(amountRefunded)} has been automatically processed back to your card. Don't worry—there are plenty of other incredible experiences forming right now!`;
          const email = renderBaseEmail({
            to: user.email,
            bodyText,
            cta: { label: 'Explore New Experiences', href: `${APP_BASE_URL}/experiences` },
            preheader: `${experience.title} did not reach its minimum group size.`,
            growthFooterContext: 'participant',
          });
          textContent = email.text;
          htmlContent = email.html;
        }

        const result = await sendEmail(user.email, subject, textContent, htmlContent);
        await recordEmailSent(booking.id, 'mvg_failed', user.email, result.success, result.error);
        emailsSent++;

        this.logNotification({
          type: 'mvg_failed',
          experienceId: experience.id,
          experienceTitle: experience.title,
          userId: booking.userId,
          userEmail: user.email,
          data: {
            bookingId: booking.id,
            refundAmount: booking.depositAmount,
            minimumRequired: experience.minimumParticipants,
            actualParticipants: totalBookings,
            wasRefunded,
            refundFailed,
          }
        });

      } catch (error: any) {
        console.error(`Error sending MVG failed notification to user ${booking.userId}:`, error.message);
      }
    };

    for (const booking of refundedBookings) {
      await sendFailedEmail(booking, true, false);
    }

    for (const booking of cancelledBookings) {
      await sendFailedEmail(booking, false, false);
    }

    for (const booking of failedRefundBookings) {
      await sendFailedEmail(booking, true, true);
    }

    console.log(`📧 [MVG FAILED] Sent ${emailsSent} emails, skipped ${emailsSkipped} (already sent)`);
  }

  async sendDepositCreatedNotification(userId: string, experience: Experience, booking: Booking): Promise<void> {
    await this.sendBookingCreatedEmail(userId, experience, booking);
  }

  async sendCreatorNewMemberNotification(creatorId: string, experience: Experience, newUserId: string): Promise<void> {
    try {
      const creator = await storage.getUser(creatorId);
      if (!creator || !creator.email) {
        console.warn(`Cannot send creator new-member email: no email for creator ${creatorId}`);
        return;
      }
      const newUser = await storage.getUser(newUserId);
      const newUserName = newUser?.firstName ? `${newUser.firstName}${newUser.lastName ? ' ' + newUser.lastName[0] + '.' : ''}` : 'Someone new';

      const currentCount = experience.currentParticipants ?? 0;
      const minimum = experience.minimumParticipants ?? 0;
      const remaining = Math.max(0, minimum - currentCount);

      const subject = `New member joined "${experience.title}"!`;
      const textContent = `
Hi ${creator.firstName || 'there'},

Great news — ${newUserName} just reserved a spot on your trip!

📍 Trip: ${experience.title}
👥 Participants: ${currentCount}${minimum > 0 ? ` / ${minimum} needed` : ''}
${remaining > 0 ? `⏳ ${remaining} more needed to confirm` : '✅ Group is confirmed!'}

View your full participant list at:
https://greatapp.replit.app/creator-dashboard

Keep sharing the link to get this trip confirmed!

The Great. Team
      `.trim();

      const result = await sendEmail(creator.email, subject, textContent);
      if (result.success) {
        console.log(`📧 [CREATOR NOTIF] Sent new-member email to creator ${creator.email} for experience ${experience.id}`);
      }
    } catch (error: any) {
      console.error(`Error sending creator new-member email:`, error.message);
    }
  }

  async sendRoleApplicationReceivedEmail(opts: {
    creatorId: string;
    applicantId: string;
    experience: Experience;
    roleName: string;
  }): Promise<void> {
    const [creator, applicant] = await Promise.all([
      storage.getUser(opts.creatorId),
      storage.getUser(opts.applicantId),
    ]);
    if (!creator?.email) return;

    const applicantName = [applicant?.firstName, applicant?.lastName].filter(Boolean).join(' ') || 'A participant';
    const subject = `New ${opts.roleName} application - ${opts.experience.title}`;
    const textContent = `
Hi ${creator.firstName || 'there'},

${applicantName} applied for the ${opts.roleName} role on "${opts.experience.title}".

Review and approve or decline the application in your Creator Dashboard:
${APP_BASE_URL}/creator-dashboard

The Great. Team
    `.trim();
    await sendEmail(creator.email, subject, textContent);
  }

  async sendRoleApplicationResolvedEmail(opts: {
    applicantId: string;
    experience: Experience;
    roleName: string;
    status: 'confirmed' | 'declined';
  }): Promise<void> {
    const applicant = await storage.getUser(opts.applicantId);
    if (!applicant?.email) return;

    const approved = opts.status === 'confirmed';
    const subject = `${approved ? 'Role confirmed' : 'Role application update'} - ${opts.experience.title}`;
    const textContent = `
Hi ${applicant.firstName || 'there'},

Your application for the ${opts.roleName} role on "${opts.experience.title}" was ${approved ? 'approved' : 'declined'}.

${approved ? 'You are now confirmed for this role. Open the event page for the latest experience details.' : 'You can browse other open roles and gigs in the Community Hub.'}

${approved ? `${APP_BASE_URL}/experience/${(opts.experience as any).slug || opts.experience.id}` : `${APP_BASE_URL}/community-hub`}

The Great. Team
    `.trim();
    await sendEmail(applicant.email, subject, textContent);
  }

  async sendExternalVenueInvitation(event: {
    title?: string | null;
    startDate?: Date | string | null;
    location?: string | null;
    manualVenueName?: string | null;
    manualVenueAddress?: string | null;
    manualVenueContactName?: string | null;
    manualVenueEmail?: string | null;
    manualVenuePropertyUrl?: string | null;
    venueTargetDeal?: string | null;
    venueTargetDealValue?: string | number | null;
    currency?: string | null;
  }): Promise<void> {
    if (!event.manualVenueEmail) return;

    const contact = event.manualVenueContactName?.trim() || 'there';
    const dealLabels: Record<string, string> = {
      revenue_share: 'Revenue Split',
      fixed_fee: 'Ticket Deduction',
      access_only: 'Access-Only',
      venue_sponsored: 'Venue Sponsorship',
      upfront_rental: 'Upfront Rental',
    };
    const deal = event.venueTargetDeal
      ? dealLabels[event.venueTargetDeal] || event.venueTargetDeal
      : 'To be agreed';
    const value = event.venueTargetDealValue
      ? event.venueTargetDeal === 'revenue_share'
        ? `${event.venueTargetDealValue}%`
        : `${String(event.currency || 'eur').toUpperCase()} ${event.venueTargetDealValue}`
      : '';

    const subject = `Venue proposal: ${event.title || 'A Great. experience'}`;
    const textContent = `
Hi ${contact},

A creator would like to host "${event.title || 'an experience'}" at ${event.manualVenueName || 'your property'}.

Date: ${formatDate(event.startDate)}
Location: ${event.location || event.manualVenueAddress || 'TBD'}
Property: ${event.manualVenuePropertyUrl || 'Not provided'}
Proposed deal: ${deal}${value ? ` (${value})` : ''}

Reply to this email to continue with the deal proposal.

The Great. Team
    `.trim();

    const result = await sendEmail(event.manualVenueEmail, subject, textContent);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send external venue invitation');
    }
  }

  async sendPromotionExternalInvitations(event: {
    title?: string | null;
    startDate?: Date | string | null;
    location?: string | null;
    currency?: string | null;
    promotionDealType?: string | null;
    influencerCommissionPct?: string | number | null;
    promotionMilestoneAttendeeTarget?: string | number | null;
    promotionMilestoneRewardTickets?: string | number | null;
    promotionBrandPitch?: string | null;
    promotionSponsorshipAmount?: string | number | null;
    promotionExternalInvites?: Array<{
      email?: string | null;
      name?: string | null;
      website?: string | null;
    }> | null;
  }): Promise<number> {
    const invites = Array.isArray(event.promotionExternalInvites)
      ? event.promotionExternalInvites.filter((invite) => invite?.email)
      : [];
    if (invites.length === 0) return 0;

    const dealSummary = (() => {
      switch (event.promotionDealType) {
        case 'commission_per_ticket':
          return `Commission per Ticket: ${event.influencerCommissionPct || 0}% per ticket sold.`;
        case 'milestone_barter':
          return `Milestone Barter: Bring ${event.promotionMilestoneAttendeeTarget || 'X'} attendees and earn ${event.promotionMilestoneRewardTickets || 1} free ticket(s).`;
        case 'brand_barter':
          return `Brand Barter: ${event.promotionBrandPitch || 'Products or services in exchange for exposure.'}`;
        case 'financial_sponsorship':
          return `Financial Sponsorship: ${String(event.currency || 'eur').toUpperCase()} ${event.promotionSponsorshipAmount || 0} for exposure.`;
        default:
          return 'A creator would like to discuss a promotion partnership for this experience.';
      }
    })();

    let sentCount = 0;
    for (const invite of invites) {
      const subject = `Promotion invitation: ${event.title || 'A Great. experience'}`;
      const textContent = `
Hi ${invite.name?.trim() || 'there'},

A creator would like to invite you to promote "${event.title || 'an experience'}" on Great.

Date: ${formatDate(event.startDate)}
Location: ${event.location || 'TBD'}
Suggested profile link: ${invite.website || 'Not provided'}
Baseline deal: ${dealSummary}

Reply to this email to continue the conversation.

The Great. Team
      `.trim();

      const result = await sendEmail(invite.email!, subject, textContent);
      if (!result.success) {
        throw new Error(result.error || 'Failed to send external promotion invitation');
      }
      sentCount += 1;
    }

    return sentCount;
  }

  // ── Digital Handshake emails ──────────────────────────────────────────────
  // One shared layout for every handshake email (proposal, counter, acceptance,
  // decline). Every email carries a View Event Details link so the receiving
  // party can read the full event page before acting on the terms.
  private async sendHandshakeEmail(opts: {
    to: string;
    recipientName?: string | null;
    subject: string;
    headline: string;
    detailLines?: string[];
    experienceTitle: string;
    experienceSlugOrId: string;
    ctaNote?: string;
  }): Promise<void> {
    const details = (opts.detailLines || []).filter(Boolean).join('\n');
    const textContent = `
Hi ${opts.recipientName?.trim() || 'there'},

${opts.headline}

📍 Event: ${opts.experienceTitle}
${details}

View Event Details: ${experienceDetailsUrl(opts.experienceSlugOrId)}

${opts.ctaNote || 'Log in to your Great. dashboard to respond.'}

The Great. Team
    `.trim().replace(/\n{3,}/g, '\n\n');

    const result = await sendEmail(opts.to, opts.subject, textContent);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send handshake email');
    }
  }

  // Direct offer (Options A & B) landed in a partner's Offers tab.
  async sendPromotionOfferReceivedEmail(opts: {
    to: string;
    recipientName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    dealType?: string | null;
    terms?: Record<string, any> | null;
    currency?: string | null;
  }): Promise<void> {
    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `New promotion offer: ${opts.experienceTitle}`,
      headline: `A creator sent you a Digital Handshake offer to promote "${opts.experienceTitle}".`,
      detailLines: [`🤝 Deal: ${formatPromotionDealSummary(opts.dealType, opts.terms, opts.currency)}`],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: 'Open your dashboard to Accept or Decline this offer.',
    });
  }

  // Partner accepted/declined a direct offer, or accepted marketplace baseline terms.
  async sendPromotionOfferResponseEmail(opts: {
    to: string;
    recipientName?: string | null;
    partnerName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    action: 'accepted' | 'declined';
    dealType?: string | null;
    terms?: Record<string, any> | null;
    currency?: string | null;
  }): Promise<void> {
    const partner = opts.partnerName?.trim() || 'A partner';
    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `${partner} ${opts.action} your promotion deal — ${opts.experienceTitle}`,
      headline: `${partner} has ${opts.action} the Digital Handshake deal for "${opts.experienceTitle}".`,
      detailLines: [`🤝 Deal: ${formatPromotionDealSummary(opts.dealType, opts.terms, opts.currency)}`],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: opts.action === 'accepted'
        ? 'The partner now has their tracking link and can start promoting.'
        : 'You can adjust your deal or invite other partners from your dashboard.',
    });
  }

  // Marketplace bid (Option C): a partner countered the creator's baseline terms.
  async sendPromotionCounterReceivedEmail(opts: {
    to: string;
    recipientName?: string | null;
    partnerName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    dealType?: string | null;
    terms?: Record<string, any> | null;
    currency?: string | null;
    message?: string | null;
  }): Promise<void> {
    const partner = opts.partnerName?.trim() || 'A partner';
    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `Counter offer received — ${opts.experienceTitle}`,
      headline: `${partner} sent a counter offer on your baseline deal for "${opts.experienceTitle}".`,
      detailLines: [
        `🤝 Proposed terms: ${formatPromotionDealSummary(opts.dealType, opts.terms, opts.currency)}`,
        opts.message ? `💬 Message: "${opts.message}"` : '',
      ],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: 'Open your creator dashboard to Accept or Decline the counter offer.',
    });
  }

  // Creator resolved a partner's counter offer.
  async sendPromotionCounterResolvedEmail(opts: {
    to: string;
    recipientName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    action: 'accepted' | 'declined';
    dealType?: string | null;
    terms?: Record<string, any> | null;
    currency?: string | null;
  }): Promise<void> {
    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `Your counter offer was ${opts.action} — ${opts.experienceTitle}`,
      headline: `The creator has ${opts.action} your counter offer for "${opts.experienceTitle}".`,
      detailLines: [`🤝 Deal: ${formatPromotionDealSummary(opts.dealType, opts.terms, opts.currency)}`],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: opts.action === 'accepted'
        ? opts.dealType === 'financial_sponsorship'
          ? 'Your terms are approved. Open the Experience Pool to complete the sponsorship payment.'
          : 'Your tracking link is ready in your dashboard — you can start promoting now.'
        : 'You can accept the original baseline terms or browse other experiences in the pool.',
    });
  }

  // Reverse Handshake: an admin-approved venue bid is now visible to the creator.
  async sendVenueBidReceivedEmail(opts: {
    to: string;
    recipientName?: string | null;
    venueName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    model?: string | null;
    terms?: Record<string, any> | null;
    currency?: string | null;
    message?: string | null;
  }): Promise<void> {
    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `New venue offer for ${opts.experienceTitle}`,
      headline: `${opts.venueName || 'A venue'} submitted an Offer to Host "${opts.experienceTitle}".`,
      detailLines: [
        `🏛️ Commercial model: ${formatVenueDealSummary(opts.model, opts.terms, opts.currency)}`,
        opts.message ? `💬 Message: "${opts.message}"` : '',
      ],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: 'Open your creator dashboard (Venue Offers tab) to Accept or Decline.',
    });
  }

  // Creator resolved a venue's Offer to Host bid.
  async sendVenueBidResolvedEmail(opts: {
    to: string;
    recipientName?: string | null;
    venueName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    action: 'accepted' | 'declined';
    model?: string | null;
    terms?: Record<string, any> | null;
    currency?: string | null;
  }): Promise<void> {
    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `Your venue offer was ${opts.action} — ${opts.experienceTitle}`,
      headline: `The creator has ${opts.action} ${opts.venueName ? `${opts.venueName}'s` : 'your'} Offer to Host "${opts.experienceTitle}".`,
      detailLines: [`🏛️ Deal: ${formatVenueDealSummary(opts.model, opts.terms, opts.currency)}`],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: opts.action === 'accepted'
        ? 'The event is being linked to your venue — track sales in your venue dashboard.'
        : 'You can bid on other open events from your venue dashboard.',
    });
  }

  // Creator published an event linked to a platform venue — proposal lands in the
  // venue owner's Pending Offers tab.
  async sendVenueContractProposalEmail(opts: {
    to: string;
    recipientName?: string | null;
    venueName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    model?: string | null;
    terms?: Record<string, any> | null;
    currency?: string | null;
  }): Promise<void> {
    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `New event proposal for ${opts.venueName || 'your venue'}: ${opts.experienceTitle}`,
      headline: `A creator wants to host "${opts.experienceTitle}" at ${opts.venueName || 'your venue'}.`,
      detailLines: [`🏛️ Proposed deal: ${formatVenueDealSummary(opts.model, opts.terms, opts.currency)}`],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: 'Open your venue dashboard (Pending Offers tab) to Accept or Reject the Digital Handshake.',
    });
  }

  // Venue owner resolved the creator's direct contract proposal.
  async sendVenueContractResolvedEmail(opts: {
    to: string;
    recipientName?: string | null;
    venueName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    action: 'accepted' | 'rejected';
    reason?: string | null;
  }): Promise<void> {
    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `${opts.venueName || 'The venue'} ${opts.action} your event — ${opts.experienceTitle}`,
      headline: `${opts.venueName || 'The venue'} has ${opts.action} your Digital Handshake proposal for "${opts.experienceTitle}".`,
      detailLines: [opts.reason ? `💬 Reason: "${opts.reason}"` : ''],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: opts.action === 'accepted'
        ? 'Your event is now live and open for bookings.'
        : 'Your event was returned to draft — you can pick another venue and republish.',
    });
  }

  private logNotification(payload: NotificationPayload) {
    this.logs.push(payload);
    if (this.logs.length > 100) {
      this.logs.shift();
    }
  }

  getNotificationLogs(): NotificationPayload[] {
    return this.logs;
  }
}

export const notificationService = new NotificationService();
