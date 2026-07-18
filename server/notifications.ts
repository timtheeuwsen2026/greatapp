import sgMail from '@sendgrid/mail';
import { createHash } from 'node:crypto';
import { storage } from './storage';
import { db } from './db';
import { bookingEmailEvents } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { Booking, Experience } from '@shared/schema';
import { renderMasterEmailTemplate, type EmailReceiptRow, type GrowthFooterContext, type GrowthFooterData } from './emailTemplates';
import { createEmailPreferenceToken } from './emailPreferenceTokens';
import { isEmailCategoryEnabled, type EmailCategory } from './emailPreferences';
import { claimImmediateEmailEvent, completeEmailEvent, retryOrFailEmailJob } from './emailDeliveryLedger';
import { resolveBookingEmailDecision } from './emailRules';
import { getConfiguredPublicAppBaseUrl } from './publicUrl';

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Production delivery uses a verified Resend sender. SendGrid remains only as a
// backward-compatible development fallback for existing environments.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'noreply@great.com';
const FROM_NAME = process.env.RESEND_FROM_NAME || process.env.SENDGRID_FROM_NAME || 'Great. Experiences';

// Public base URL used for links inside emails (View Event Details, dashboards).
const APP_BASE_URL = getConfiguredPublicAppBaseUrl();
const STRIPE_DASHBOARD_URL = process.env.STRIPE_DASHBOARD_URL || 'https://dashboard.stripe.com/';

export function assertEmailConfiguration(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const errors: string[] = [];
  if (!process.env.RESEND_API_KEY) {
    errors.push('RESEND_API_KEY must be configured');
  }
  if (!process.env.RESEND_FROM_EMAIL) {
    errors.push('RESEND_FROM_EMAIL must be configured');
  }
  if (!process.env.EMAIL_PREFERENCES_SECRET || process.env.EMAIL_PREFERENCES_SECRET.length < 32) {
    errors.push('EMAIL_PREFERENCES_SECRET must be at least 32 characters');
  }
  if (!process.env.VITE_APP_BASE_URL && !process.env.APP_BASE_URL) {
    errors.push('APP_BASE_URL or VITE_APP_BASE_URL must be configured');
  }
  if (/yourdomain\.com|example\.com/i.test(FROM_EMAIL)) {
    errors.push('RESEND_FROM_EMAIL must be a verified production sender');
  }
  if (/yourwebsite\.com|localhost|greatapp\.replit\.app/i.test(APP_BASE_URL)) {
    errors.push('APP_BASE_URL must use the canonical production domain');
  }
  if (errors.length) {
    throw new Error(`Invalid production email configuration: ${errors.join('; ')}`);
  }
}

function experienceDetailsUrl(slugOrId: string): string {
  return `${APP_BASE_URL}/experience/${slugOrId}`;
}

function experienceSlugOrId(experience: Experience | any): string {
  return String(experience?.slug || experience?.id || '');
}

function notificationEventKey(type: string, ...parts: Array<string | number | null | undefined>): string {
  const digest = createHash('sha256')
    .update(parts.map((part) => String(part ?? '').trim().toLowerCase()).join('|'))
    .digest('hex');
  return `${type}:${digest}`;
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

export interface EmailSendResult {
  success: boolean;
  skipped?: boolean;
  duplicate?: boolean;
  simulated?: boolean;
  error?: string;
}

interface EmailSendOptions {
  category?: EmailCategory;
  preferencesToken?: string;
}

async function sendEmail(
  to: string,
  subject: string,
  textContent: string,
  htmlContent?: string,
  options: EmailSendOptions = {},
): Promise<EmailSendResult> {
  const category = options.category || 'transactional';
  if (!(await isEmailCategoryEnabled(to, category))) {
    console.log(`[EMAIL SKIPPED] Recipient preferences disabled ${category} email for ${to}`);
    return { success: true, skipped: true };
  }

  const preferencesToken = options.preferencesToken || createEmailPreferenceToken(to);
  const unsubscribeUrl = `${APP_BASE_URL}/api/email-preferences/unsubscribe?token=${encodeURIComponent(preferencesToken)}`;
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
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
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
    if (process.env.NODE_ENV === 'production') {
      const error = 'No email provider API key is configured';
      console.error(`[EMAIL CONFIG] ${error}`);
      return { success: false, error };
    }
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

async function sendEmailOnce(opts: {
  eventKey: string;
  emailType: string;
  category?: EmailCategory;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailSendResult> {
  const category = opts.category || 'transactional';
  const claimed = await claimImmediateEmailEvent({
    eventKey: opts.eventKey,
    emailType: opts.emailType,
    category,
    recipientEmail: opts.to,
    payload: {
      kind: 'rendered_email',
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html || null,
      category,
    },
  });
  if (!claimed) return { success: true, skipped: true, duplicate: true };

  const result = await sendEmail(opts.to, opts.subject, opts.text, opts.html, { category });
  if (result.success) await completeEmailEvent(opts.eventKey, result);
  else await retryOrFailEmailJob(opts.eventKey, 1, result.error || 'Email provider delivery failed');
  return result;
}

export async function sendQueuedRenderedEmail(payload: Record<string, unknown>): Promise<EmailSendResult> {
  const to = String(payload.to || '');
  const subject = String(payload.subject || '');
  const text = String(payload.text || '');
  const html = typeof payload.html === 'string' ? payload.html : undefined;
  const category = String(payload.category || 'transactional') as EmailCategory;
  if (!to || !subject || !text || !['transactional', 'community', 'reminder', 'marketing'].includes(category)) {
    return { success: false, error: 'Invalid queued email payload' };
  }
  return sendEmail(to, subject, text, html, { category });
}

function renderBaseEmail(opts: {
  to: string;
  bodyText: string;
  receiptRows?: EmailReceiptRow[];
  cta?: { label: string; href: string };
  preheader?: string;
  growthFooterContext?: GrowthFooterContext;
  growthFooterData?: GrowthFooterData;
}) {
  return renderMasterEmailTemplate({
    recipientEmail: opts.to,
    preferencesToken: createEmailPreferenceToken(opts.to),
    bodyText: opts.bodyText,
    receiptRows: opts.receiptRows,
    cta: opts.cta,
    preheader: opts.preheader,
    growthFooterContext: opts.growthFooterContext,
    growthFooterData: opts.growthFooterData,
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

function creatorDashboardUrl(): string {
  return `${APP_BASE_URL}/creator-dashboard`;
}

function partnerDashboardUrl(): string {
  return `${APP_BASE_URL}/promoter`;
}

function venueDashboardUrl(): string {
  return `${APP_BASE_URL}/venue-dashboard`;
}

function bookingTotalPaid(booking: Booking): string | number | null | undefined {
  if (booking.balancePaid || !booking.isDepositOnly) {
    return booking.totalPrice || booking.depositAmount;
  }

  return booking.depositAmount || booking.totalPrice;
}

function participantPerkSummary(experience: Experience | any): string {
  if (experience?.participantReferralDealType === 'commission_per_ticket') {
    const pct = Number(experience.participantReferralCommissionPct || 0);
    return pct > 0 ? `${pct}% cashback` : 'cashback';
  }
  if (experience?.participantReferralDealType === 'milestone_barter') {
    return experience.participantReferralMilestoneRewardDescription || 'a creator-set reward';
  }
  return 'your reward';
}

function promotionDealValue(dealType?: string | null, terms?: Record<string, any> | null, currency?: string | null): string {
  const summary = formatPromotionDealSummary(dealType, terms, currency);
  return summary.replace(/^Commission per Ticket\s+(?:—|â€”)\s+/, '');
}

async function participantGrowthFooterData(userId: string, experience: Experience): Promise<GrowthFooterData> {
  const referralCode = await storage.ensureUserReferralCode(userId);
  const trackedPromotion = await storage.promoteExperience(userId, experience.id, {
    referralAudience: 'participant',
  });
  const params = new URLSearchParams({ ref: referralCode });
  if (trackedPromotion?.shareToken) {
    params.set('share', trackedPromotion.shareToken);
  }
  return {
    b2cPerk: participantPerkSummary(experience),
    participantRefLink: `${APP_BASE_URL}/experience/${experienceSlugOrId(experience)}?${params.toString()}`,
  };
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

    const result = await sendEmailOnce({
      eventKey: notificationEventKey('welcome_verify', opts.to, opts.verifyUrl),
      emailType: 'welcome_verify',
      to: opts.to,
      subject,
      text: email.text,
      html: email.html,
    });
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

    const result = await sendEmailOnce({
      eventKey: notificationEventKey('password_reset', opts.to, opts.resetUrl),
      emailType: 'password_reset',
      to: opts.to,
      subject,
      text: email.text,
      html: email.html,
    });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send password reset email');
    }
  }

  async sendEventSubmittedForReviewEmail(opts: {
    to: string;
    creatorName?: string | null;
    eventName: string;
    eventKey?: string;
  }): Promise<void> {
    const subject = 'Your experience is under review! 🚀';
    const bodyText = `Hey ${opts.creatorName || 'there'}, we received your submission for ${opts.eventName}. Our team is reviewing the details to ensure everything looks perfect. We'll notify you the moment it goes live!`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'View My Dashboard', href: creatorDashboardUrl() },
      preheader: `${opts.eventName} is under review.`,
      growthFooterContext: 'creator',
    });

    const result = await sendEmailOnce({
      eventKey: opts.eventKey || notificationEventKey('event_submitted', opts.to, opts.eventName),
      emailType: 'event_submitted',
      to: opts.to,
      subject,
      text: email.text,
      html: email.html,
    });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send event submitted email');
    }
  }

  async sendEventPublishedEmail(opts: {
    to: string;
    creatorName?: string | null;
    eventName: string;
    eventSlugOrId: string;
    eventKey?: string;
  }): Promise<void> {
    const subject = `You are Live! ${opts.eventName} is ready for bookings`;
    const bodyText = `Great news, ${opts.creatorName || 'there'}. ${opts.eventName} is officially live on the platform! It's time to start bringing in your squad.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'View Public Page', href: experienceDetailsUrl(opts.eventSlugOrId) },
      preheader: `${opts.eventName} is live and ready for bookings.`,
      growthFooterContext: 'creator_venue',
      growthFooterData: { mainEventUrl: experienceDetailsUrl(opts.eventSlugOrId) },
    });

    const result = await sendEmailOnce({
      eventKey: opts.eventKey || notificationEventKey('event_published', opts.to, opts.eventSlugOrId),
      emailType: 'event_published',
      to: opts.to,
      subject,
      text: email.text,
      html: email.html,
    });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send event published email');
    }
  }

  async sendCreatorCommunityHubNudgeEmail(opts: {
    to: string;
    creatorName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    experience?: Experience;
  }): Promise<EmailSendResult> {
    const subject = `Your attendees are chatting in the ${opts.experienceTitle} Hub!`;
    const bodyText = `Hey ${opts.creatorName || 'there'}, your community is coming alive. There are new messages in the ${opts.experienceTitle} chat. As the host, jumping in to answer questions and welcome new members is the best way to keep the momentum going and hit your minimum group size!`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'Join the Conversation', href: communityHubUrl() },
      preheader: `New messages are waiting in the ${opts.experienceTitle} Hub.`,
      growthFooterContext: 'creator_venue',
      growthFooterData: { mainEventUrl: experienceDetailsUrl(opts.experienceSlugOrId) },
    });

    const result = await sendEmail(opts.to, subject, email.text, email.html, { category: 'community' });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send creator hub nudge email');
    }
    return result;
  }

  async sendAffiliateSaleMadeEmail(opts: {
    to: string;
    eventName: string;
    earnedAmount: string;
    eventKey?: string;
  }): Promise<void> {
    const subject = 'Cha-ching! Someone booked using your link 💸';
    const bodyText = `Great work! Someone just booked a spot for ${opts.eventName} using your referral link. You have earned ${opts.earnedAmount}. This will be routed to your connected Stripe account based on the event's payout schedule.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'View My Impact Dashboard', href: `${APP_BASE_URL}/my-impact` },
      preheader: `You earned ${opts.earnedAmount} from a referral booking.`,
      growthFooterContext: 'none',
    });

    const result = opts.eventKey
      ? await sendEmailOnce({
          eventKey: opts.eventKey,
          emailType: 'affiliate_sale',
          to: opts.to,
          subject,
          text: email.text,
          html: email.html,
        })
      : await sendEmail(opts.to, subject, email.text, email.html);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send affiliate sale email');
    }
  }

  async sendPayoutInitiatedEmail(opts: {
    to: string;
    eventName: string;
    payoutAmount: string;
    stripeDashboardUrl?: string | null;
    eventKey?: string;
  }): Promise<void> {
    const subject = `Your payout for ${opts.eventName} is on its way!`;
    const bodyText = `Your final payout of ${opts.payoutAmount} for ${opts.eventName} has been successfully initiated and is en route to your connected bank account.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'View Stripe Dashboard', href: opts.stripeDashboardUrl || STRIPE_DASHBOARD_URL },
      preheader: `${opts.payoutAmount} payout initiated for ${opts.eventName}.`,
      growthFooterContext: 'none',
    });

    const result = opts.eventKey
      ? await sendEmailOnce({
          eventKey: opts.eventKey,
          emailType: 'payout_initiated',
          to: opts.to,
          subject,
          text: email.text,
          html: email.html,
        })
      : await sendEmail(opts.to, subject, email.text, email.html);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send payout initiated email');
    }
  }

  private renderBookingConfirmedEmail(opts: {
    to: string;
    userFirstName?: string | null;
    experience: Experience;
    booking: Booking;
    growthFooterData?: GrowthFooterData;
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
      growthFooterData: opts.growthFooterData,
    });

    return { subject, text: email.text, html: email.html };
  }

  async sendCommunityHubUnreadEmail(opts: {
    to: string;
    userId?: string | null;
    userFirstName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    experience?: Experience;
  }): Promise<EmailSendResult> {
    const subject = `You have unread messages in the ${opts.experienceTitle} Hub 💬`;
    const bodyText = `Hey ${opts.userFirstName || 'there'}, the squad is talking! There are new messages waiting for you in the ${opts.experienceTitle} Community Hub. Catch up on the conversation and get to know your fellow attendees before the experience begins.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'Reply in the Hub', href: communityHubUrl() },
      preheader: `New messages are waiting in the ${opts.experienceTitle} Hub.`,
      growthFooterContext: 'confirmed_participant',
      growthFooterData: opts.userId
        ? await participantGrowthFooterData(opts.userId, opts.experience || {
            id: opts.experienceSlugOrId,
            slug: opts.experienceSlugOrId,
          } as Experience)
        : undefined,
    });

    const result = await sendEmail(opts.to, subject, email.text, email.html, { category: 'community' });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send unread hub email');
    }
    return result;
  }

  async sendEvent24HourReminderEmail(opts: {
    to: string;
    userId?: string | null;
    userFirstName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    experience?: Experience;
    startTime: Date | string;
    eventKey?: string;
  }): Promise<EmailSendResult> {
    const subject = `Get ready! ${opts.experienceTitle} starts tomorrow ⏳`;
    const bodyText = `Hey ${opts.userFirstName || 'there'}, your experience is almost here! ${opts.experienceTitle} kicks off tomorrow at ${formatTime(opts.startTime)}. Double-check the location details and jump into the Community Hub if you need to coordinate with the squad.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'View Event Details', href: experienceDetailsUrl(opts.experienceSlugOrId) },
      preheader: `${opts.experienceTitle} starts tomorrow at ${formatTime(opts.startTime)}.`,
      growthFooterContext: 'confirmed_participant',
      growthFooterData: opts.userId
        ? await participantGrowthFooterData(opts.userId, opts.experience || {
            id: opts.experienceSlugOrId,
            slug: opts.experienceSlugOrId,
          } as Experience)
        : undefined,
    });

    const result = opts.eventKey
      ? await sendEmailOnce({
          eventKey: opts.eventKey,
          emailType: 'event_24h_reminder',
          category: 'reminder',
          to: opts.to,
          subject,
          text: email.text,
          html: email.html,
        })
      : await sendEmail(opts.to, subject, email.text, email.html, { category: 'reminder' });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send 24-hour event reminder email');
    }
    return result;
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

      const bookingDecision = resolveBookingEmailDecision(experience);
      if (bookingDecision.kind === 'awaiting_confirmation') {
        console.log(`[EMAIL DEFERRED] Booking ${booking.id} reached MVG but the experience transition is not complete yet`);
        return;
      }
      if (
        bookingDecision.kind === 'confirmed'
        && experience.requireMinimumParticipants
        && await hasEmailBeenSentSuccessfully(booking.id, 'mvg_confirmed')
      ) {
        console.log(`[EMAIL SKIPPED] Booking ${booking.id} already received its MVG confirmation`);
        return;
      }
      const remainingMvgSpots = bookingDecision.remainingMvgSpots;
      const growthFooterData = await participantGrowthFooterData(userId, experience);

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

      if (bookingDecision.kind === 'pre_mvg') {
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
          growthFooterData,
        });
        textContent = email.text;
        htmlContent = email.html;
      } else {
        const email = this.renderBookingConfirmedEmail({
          to: user.email,
          userFirstName: user.firstName,
          experience,
          booking,
          growthFooterData,
        });
        subject = email.subject;
        textContent = email.text;
        htmlContent = email.html;
      }

      const result = await sendEmailOnce({
        eventKey: `booking_created:${booking.id}`,
        emailType: 'booking_created',
        to: user.email,
        subject,
        text: textContent,
        html: htmlContent,
      });
      if (!result.duplicate) {
        await recordEmailSent(booking.id, 'booking_created', user.email, result.success, result.error);
      }

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
          growthFooterData: await participantGrowthFooterData(booking.userId, experience),
        });

        const result = await sendEmailOnce({
          eventKey: `mvg_confirmed:${booking.id}`,
          emailType: 'mvg_confirmed',
          to: user.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
        if (result.duplicate) {
          emailsSkipped++;
          continue;
        }
        await recordEmailSent(booking.id, 'mvg_confirmed', user.email, result.success, result.error);
        if (result.success) emailsSent++;

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

        const result = await sendEmailOnce({
          eventKey: `mvg_failed:${booking.id}`,
          emailType: 'mvg_failed',
          to: user.email,
          subject,
          text: textContent,
          html: htmlContent,
        });
        if (result.duplicate) {
          emailsSkipped++;
          return;
        }
        await recordEmailSent(booking.id, 'mvg_failed', user.email, result.success, result.error);
        if (result.success) emailsSent++;

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

  async sendCreatorNewMemberNotification(creatorId: string, experience: Experience, newUserId: string, bookingId?: string): Promise<void> {
    try {
      const creator = await storage.getUser(creatorId);
      if (!creator || !creator.email) {
        console.warn(`Cannot send creator new-member email: no email for creator ${creatorId}`);
        return;
      }
      const newUser = await storage.getUser(newUserId);
      const newUserName = newUser?.firstName ? `${newUser.firstName}${newUser.lastName ? ' ' + newUser.lastName[0] + '.' : ''}` : 'Someone new';

      const currentCount = experience.currentParticipants ?? 0;
      const targetCapacity = experience.maxParticipants || experience.minimumParticipants || currentCount;
      const subject = `Cha-ching! New booking for ${experience.title} 🎉`;
      const bodyText = `Hey ${creator.firstName || 'there'}, ${newUserName} just secured their spot for ${experience.title}. Head over to the Community Hub to welcome them!`;
      const email = renderBaseEmail({
        to: creator.email,
        bodyText,
        receiptRows: [
          { label: 'Progress', value: `${currentCount} / ${targetCapacity}` },
        ],
        cta: { label: 'Welcome Them in the Hub', href: communityHubUrl() },
        preheader: `${newUserName} just booked ${experience.title}.`,
        growthFooterContext: 'creator_venue',
      });

      const result = bookingId
        ? await sendEmailOnce({
            eventKey: `creator_new_booking:${bookingId}`,
            emailType: 'creator_new_booking',
            to: creator.email,
            subject,
            text: email.text,
            html: email.html,
          })
        : await sendEmail(creator.email, subject, email.text, email.html);
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
    const result = await sendEmailOnce({
      eventKey: notificationEventKey(
        'role_application_received',
        opts.experience.id,
        opts.applicantId,
        opts.roleName,
      ),
      emailType: 'role_application_received',
      to: creator.email,
      subject,
      text: textContent,
    });
    if (!result.success) throw new Error(result.error || 'Failed to send role application email');
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
    const result = await sendEmailOnce({
      eventKey: notificationEventKey(
        'role_application_resolved',
        opts.experience.id,
        opts.applicantId,
        opts.roleName,
        opts.status,
      ),
      emailType: 'role_application_resolved',
      to: applicant.email,
      subject,
      text: textContent,
    });
    if (!result.success) throw new Error(result.error || 'Failed to send role resolution email');
  }

  async sendExternalVenueInvitation(event: {
    creatorId?: string | null;
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

    const creator = event.creatorId ? await storage.getUser(event.creatorId) : undefined;
    const partnerName = event.manualVenueContactName?.trim() || event.manualVenueName?.trim() || 'there';
    const creatorName = [creator?.firstName, creator?.lastName].filter(Boolean).join(' ') || 'the creator';
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

    await this.sendExternalPartnerInviteEmail({
      to: event.manualVenueEmail,
      partnerName,
      creatorName,
      eventName: event.title || 'A Great. experience',
      eventSlugOrId: (event as any).slug || (event as any).id || '',
      proposedTerms: `${deal}${value ? ` (${value})` : ''}`,
      reviewUrl: experienceDetailsUrl(String((event as any).slug || (event as any).id || '')),
      eventKey: notificationEventKey('external_venue_invite', (event as any).id, event.manualVenueEmail),
    });
  }

  async sendExternalPartnerInviteEmail(opts: {
    to: string;
    partnerName?: string | null;
    creatorName?: string | null;
    eventName: string;
    eventSlugOrId?: string | null;
    proposedTerms?: string | null;
    reviewUrl?: string | null;
    eventKey?: string;
  }): Promise<void> {
    const subject = `Private Invite: Partner with us on ${opts.eventName}`;
    const bodyText = `Hello ${opts.partnerName?.trim() || 'there'}, you've been invited by ${opts.creatorName?.trim() || 'the creator'} to partner on an upcoming experience: ${opts.eventName}. They have proposed a specific collaboration deal and would love to work with you. Click below to view the event details and review the offer!`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      receiptRows: opts.proposedTerms ? [{ label: 'Deal Summary', value: opts.proposedTerms }] : undefined,
      cta: { label: 'Review the Offer', href: opts.reviewUrl || (opts.eventSlugOrId ? experienceDetailsUrl(String(opts.eventSlugOrId)) : partnerDashboardUrl()) },
      preheader: `Private invite to partner on ${opts.eventName}.`,
      growthFooterContext: 'none',
    });

    const result = await sendEmailOnce({
      eventKey: opts.eventKey || notificationEventKey('external_partner_invite', opts.to, opts.eventSlugOrId, opts.proposedTerms),
      emailType: 'external_partner_invite',
      category: 'marketing',
      to: opts.to,
      subject,
      text: email.text,
      html: email.html,
    });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send external partner invitation');
    }
  }

  async sendPromotionExternalInvitations(event: {
    creatorId?: string | null;
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

    const creator = event.creatorId ? await storage.getUser(event.creatorId) : undefined;
    const creatorName = [creator?.firstName, creator?.lastName].filter(Boolean).join(' ') || 'the creator';
    let sentCount = 0;
    for (const invite of invites) {
      await this.sendExternalPartnerInviteEmail({
        to: invite.email!,
        partnerName: invite.name,
        creatorName,
        eventName: event.title || 'A Great. experience',
        eventSlugOrId: (event as any).slug || (event as any).id || '',
        proposedTerms: dealSummary,
        eventKey: notificationEventKey('external_promotion_invite', (event as any).id, invite.email),
      });
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

    const result = await sendEmailOnce({
      eventKey: notificationEventKey(
        'digital_handshake',
        opts.to,
        opts.subject,
        opts.experienceSlugOrId,
        details,
        opts.ctaNote,
      ),
      emailType: 'digital_handshake',
      to: opts.to,
      subject: opts.subject,
      text: textContent,
    });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send handshake email');
    }
  }

  private async sendDealEngineEmail(opts: {
    to: string;
    subject: string;
    bodyText: string;
    experienceTitle: string;
    dealSummary?: string | null;
    message?: string | null;
    cta?: { label: string; href: string };
    growthFooterContext?: GrowthFooterContext;
  }): Promise<void> {
    const receiptRows: EmailReceiptRow[] = [
      { label: 'Event', value: opts.experienceTitle },
    ];
    if (opts.dealSummary) {
      receiptRows.push({ label: 'Deal Summary', value: opts.dealSummary });
    }
    if (opts.message) {
      receiptRows.push({ label: 'Message', value: `"${opts.message}"` });
    }

    const email = renderBaseEmail({
      to: opts.to,
      bodyText: opts.bodyText,
      receiptRows,
      cta: opts.cta || { label: 'View & Respond to Offer', href: partnerDashboardUrl() },
      preheader: `${opts.experienceTitle} has a pending deal update.`,
      growthFooterContext: opts.growthFooterContext || 'none',
    });

    const result = await sendEmailOnce({
      eventKey: notificationEventKey(
        'deal_engine',
        opts.to,
        opts.subject,
        opts.bodyText,
        opts.dealSummary,
        opts.message,
      ),
      emailType: 'deal_engine',
      to: opts.to,
      subject: opts.subject,
      text: email.text,
      html: email.html,
    });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send deal engine email');
    }
  }

  // Direct offer (Options A & B) landed in a partner's Offers tab.
  async sendPromotionOfferReceivedEmail(opts: {
    to: string;
    recipientName?: string | null;
    senderName?: string | null;
    experienceTitle: string;
    experienceSlugOrId: string;
    dealType?: string | null;
    terms?: Record<string, any> | null;
    currency?: string | null;
    message?: string | null;
  }): Promise<void> {
    const senderName = opts.senderName?.trim() || 'the creator';
    await this.sendDealEngineEmail({
      to: opts.to,
      subject: `Action Required: New offer received for ${opts.experienceTitle}`,
      bodyText: `You have a new pending deal on the table for ${opts.experienceTitle} from ${senderName}.`,
      dealSummary: formatPromotionDealSummary(opts.dealType, opts.terms, opts.currency),
      message: opts.message,
      experienceTitle: opts.experienceTitle,
      cta: { label: 'View & Respond to Offer', href: partnerDashboardUrl() },
      growthFooterContext: 'none',
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
    await this.sendDealEngineEmail({
      to: opts.to,
      subject: opts.action === 'accepted'
        ? `Action Required: New offer received for ${opts.experienceTitle}`
        : `${partner} declined your promotion deal for ${opts.experienceTitle}`,
      bodyText: opts.action === 'accepted'
        ? `You have a new pending deal on the table for ${opts.experienceTitle} from ${partner}.`
        : `${partner} declined the Digital Handshake deal for ${opts.experienceTitle}.`,
      dealSummary: formatPromotionDealSummary(opts.dealType, opts.terms, opts.currency),
      experienceTitle: opts.experienceTitle,
      cta: { label: 'View & Respond to Offer', href: creatorDashboardUrl() },
      growthFooterContext: 'creator_venue',
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
    await this.sendDealEngineEmail({
      to: opts.to,
      subject: `Action Required: New offer received for ${opts.experienceTitle}`,
      bodyText: `You have a new pending deal on the table for ${opts.experienceTitle} from ${partner}.`,
      dealSummary: formatPromotionDealSummary(opts.dealType, opts.terms, opts.currency),
      message: opts.message,
      experienceTitle: opts.experienceTitle,
      cta: { label: 'View & Respond to Offer', href: creatorDashboardUrl() },
      growthFooterContext: 'creator_venue',
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
    if (opts.action === 'accepted') {
      await this.sendPartnershipConfirmedEmail({
        to: opts.to,
        partnerName: opts.recipientName,
        eventName: opts.experienceTitle,
        dealSummary: promotionDealValue(opts.dealType, opts.terms, opts.currency),
      });
      return;
    }

    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `Your counter offer was ${opts.action} — ${opts.experienceTitle}`,
      headline: `The creator has ${opts.action} your counter offer for "${opts.experienceTitle}".`,
      detailLines: [`🤝 Deal: ${formatPromotionDealSummary(opts.dealType, opts.terms, opts.currency)}`],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: String(opts.action) === 'accepted'
        ? opts.dealType === 'financial_sponsorship'
          ? 'Your terms are approved. Open the Experience Pool to complete the sponsorship payment.'
          : 'Your tracking link is ready in your dashboard — you can start promoting now.'
        : 'You can accept the original baseline terms or browse other experiences in the pool.',
    });
  }

  async sendPartnershipConfirmedEmail(opts: {
    to: string;
    partnerName?: string | null;
    eventName: string;
    dealSummary?: string | null;
    dashboardUrl?: string | null;
    trackingLink?: string | null;
    eventKey?: string;
  }): Promise<void> {
    const subject = 'Partnership Confirmed! Here is your tracking link 🔗';
    const bodyText = `It's official! Your partnership terms for ${opts.eventName} have been locked in. You are all set to start promoting and earning.`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      receiptRows: opts.dealSummary ? [{ label: 'Deal Summary', value: opts.dealSummary }] : undefined,
      cta: { label: 'View My Dashboard', href: opts.dashboardUrl || partnerDashboardUrl() },
      preheader: `Your partnership for ${opts.eventName} is confirmed.`,
      growthFooterContext: 'partner',
      growthFooterData: {
        b2bDealValue: opts.dealSummary || 'agreed',
        brandRefLink: opts.trackingLink || opts.dashboardUrl || partnerDashboardUrl(),
      },
    });

    const result = await sendEmailOnce({
      eventKey: opts.eventKey || notificationEventKey('partnership_confirmed', opts.to, opts.eventName, opts.dealSummary),
      emailType: 'partnership_confirmed',
      to: opts.to,
      subject,
      text: email.text,
      html: email.html,
    });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send partnership confirmation email');
    }
  }

  async sendOpenRoleReferralAlertEmail(opts: {
    to: string;
    userFirstName?: string | null;
    roleName: string;
    city: string;
    eventName: string;
    eventSlugOrId: string;
    referralUrl: string;
    eventKey?: string;
  }): Promise<EmailSendResult> {
    const subject = `We're looking for a ${opts.roleName} in ${opts.city} 📍 (Know someone?)`;
    const bodyText = `Hey ${opts.userFirstName || 'there'}, a new experience (${opts.eventName}) is happening in ${opts.city} and the host is looking for a ${opts.roleName} to join the crew! Got the skills? Check out the details and submit your offer to take the gig. Not your thing? Share your personal tracking link with a friend who fits the bill—if they take the gig or book a ticket, you'll earn your reward!`;
    const email = renderBaseEmail({
      to: opts.to,
      bodyText,
      cta: { label: 'View Role & Event Details', href: opts.referralUrl },
      preheader: `${opts.eventName} needs a ${opts.roleName} in ${opts.city}.`,
      growthFooterContext: 'participant',
    });

    const result = opts.eventKey
      ? await sendEmailOnce({
          eventKey: opts.eventKey,
          emailType: 'open_role_referral',
          category: 'marketing',
          to: opts.to,
          subject,
          text: email.text,
          html: email.html,
        })
      : await sendEmail(opts.to, subject, email.text, email.html, { category: 'marketing' });
    if (!result.success) {
      throw new Error(result.error || 'Failed to send open role referral alert');
    }
    return result;
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
    const venueName = opts.venueName || 'A venue';
    await this.sendDealEngineEmail({
      to: opts.to,
      subject: `Action Required: New offer received for ${opts.experienceTitle}`,
      bodyText: `You have a new pending deal on the table for ${opts.experienceTitle} from ${venueName}.`,
      dealSummary: formatVenueDealSummary(opts.model, opts.terms, opts.currency),
      message: opts.message,
      experienceTitle: opts.experienceTitle,
      cta: { label: 'View & Respond to Offer', href: creatorDashboardUrl() },
      growthFooterContext: 'creator_venue',
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
    if (opts.action === 'accepted') {
      await this.sendDealEngineEmail({
        to: opts.to,
        subject: `Your venue offer was accepted for ${opts.experienceTitle}`,
        bodyText: `It's official! Your partnership terms for ${opts.experienceTitle} have been locked in.`,
        experienceTitle: opts.experienceTitle,
        dealSummary: formatVenueDealSummary(opts.model, opts.terms, opts.currency),
        cta: { label: 'View My Dashboard', href: venueDashboardUrl() },
        growthFooterContext: 'partner',
      });
      return;
    }

    await this.sendHandshakeEmail({
      to: opts.to,
      recipientName: opts.recipientName,
      subject: `Your venue offer was ${opts.action} — ${opts.experienceTitle}`,
      headline: `The creator has ${opts.action} ${opts.venueName ? `${opts.venueName}'s` : 'your'} Offer to Host "${opts.experienceTitle}".`,
      detailLines: [`🏛️ Deal: ${formatVenueDealSummary(opts.model, opts.terms, opts.currency)}`],
      experienceTitle: opts.experienceTitle,
      experienceSlugOrId: opts.experienceSlugOrId,
      ctaNote: String(opts.action) === 'accepted'
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
    await this.sendDealEngineEmail({
      to: opts.to,
      subject: `Action Required: New offer received for ${opts.experienceTitle}`,
      bodyText: `You have a new pending deal on the table for ${opts.experienceTitle} from the creator.`,
      dealSummary: formatVenueDealSummary(opts.model, opts.terms, opts.currency),
      experienceTitle: opts.experienceTitle,
      cta: { label: 'View & Respond to Offer', href: venueDashboardUrl() },
      growthFooterContext: 'partner',
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
