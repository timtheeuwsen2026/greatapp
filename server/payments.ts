import Stripe from 'stripe';
import { storage } from './storage';
import { stripe, stripeKeyMode } from './stripeClient';
import { isHeaderSafe, describeUnsafeChars } from './env';

/**
 * Validate the Stripe environment at boot and log a clear report. This turns the
 * single most common "payment fails / 4242 throws an error" cause — a secret key
 * and publishable key that belong to different modes or accounts — into a loud,
 * obvious startup error instead of a cryptic failure the buyer hits at checkout.
 *
 * Run once on startup. It never throws (so a misconfig doesn't crash the server),
 * it just makes the problem impossible to miss in the logs.
 */
export async function validateStripeConfig(): Promise<void> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  // Vite exposes the publishable key to the browser at BUILD time. The same value
  // is available to this server process via process.env when it's in the env file.
  const publishableKey = process.env.VITE_STRIPE_PUBLIC_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const secretMode = stripeKeyMode(secretKey);
  const publishableMode = stripeKeyMode(publishableKey);

  console.log('[Stripe] ── configuration check ─────────────────────────────');
  console.log(`[Stripe] secret key      : ${secretKey ? secretMode.toUpperCase() : 'MISSING'}`);
  console.log(`[Stripe] publishable key : ${publishableKey ? publishableMode.toUpperCase() : 'MISSING (VITE_STRIPE_PUBLIC_KEY)'}`);
  console.log(`[Stripe] webhook secret  : ${webhookSecret ? 'set' : 'MISSING (STRIPE_WEBHOOK_SECRET)'}`);

  // A credential carrying a line break cannot go into an Authorization header:
  // Node throws ERR_INVALID_CHAR, the SDK retries twice, and the failure is
  // reported as "An error occurred with our connection to Stripe" — which sends
  // you looking for a network fault that isn't there. Name it precisely instead.
  for (const [label, value] of [
    ['STRIPE_SECRET_KEY', secretKey],
    ['VITE_STRIPE_PUBLIC_KEY', publishableKey],
    ['STRIPE_WEBHOOK_SECRET', webhookSecret],
  ] as const) {
    if (value && !isHeaderSafe(value)) {
      console.error(
        `[Stripe] ❌ ${label} contains ${describeUnsafeChars(value)}. ` +
        `Every Stripe request will fail with ERR_INVALID_CHAR / StripeConnectionError. ` +
        `Re-paste the value in the hosting dashboard as a single line with no trailing newline.`,
      );
    }
  }

  if (publishableKey && secretMode !== 'unknown' && publishableMode !== 'unknown' && secretMode !== publishableMode) {
    console.error(
      `[Stripe] ❌ KEY MODE MISMATCH: secret key is ${secretMode.toUpperCase()} but publishable key is ${publishableMode.toUpperCase()}. ` +
      `Checkout WILL fail ("No such payment_intent") because the browser confirms against a different mode than the server created the PaymentIntent in. ` +
      `Use a matching pk_/sk_ pair (both test, or both live), then rebuild the client so Vite bakes in the correct VITE_STRIPE_PUBLIC_KEY.`
    );
  }

  if (!webhookSecret) {
    console.warn(
      '[Stripe] ⚠️  STRIPE_WEBHOOK_SECRET is not set. Webhook events (payment confirmation, refunds, deposit capture, auto-refund) will be rejected. ' +
      'Set it from the Stripe Dashboard → Developers → Webhooks (or `stripe listen` for local testing).'
    );
  }

  // Live probe: confirm the secret key actually authenticates and the account can charge.
  try {
    const account = await stripe.accounts.retrieve();
    console.log(
      `[Stripe] account         : ${account.id} (${account.country}) charges_enabled=${account.charges_enabled}`
    );
    if (!account.charges_enabled) {
      console.warn('[Stripe] ⚠️  charges_enabled=false on this account — payments will be declined until the account is activated.');
    }
  } catch (err: any) {
    console.error(`[Stripe] ❌ secret key failed to authenticate: ${err?.message || err}. Payments cannot be created.`);
  }
  console.log('[Stripe] ────────────────────────────────────────────────────');
}

export interface PaymentLog {
  timestamp: string;
  action: string;
  bookingId?: string;
  experienceId?: string;
  userId?: string;
  amount?: number;
  paymentIntentId?: string;
  status?: string;
  error?: string;
  captured?: boolean;
  metadata?: Record<string, any>;
}

const paymentLogs: PaymentLog[] = [];

function logPayment(log: PaymentLog) {
  paymentLogs.push(log);
  console.log('[PAYMENT LOG]', JSON.stringify(log, null, 2));
}

export function getPaymentLogs(): PaymentLog[] {
  return paymentLogs;
}

export interface CreateDepositIntentParams {
  userId: string;
  experienceId: string;
  amount: number;
  metadata?: Record<string, any>;
}

export interface CreateDepositIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
}

export async function createDepositIntent(
  params: CreateDepositIntentParams
): Promise<CreateDepositIntentResult> {
  const { userId, experienceId, amount, metadata = {} } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive finite number');
  }

  logPayment({
    timestamp: new Date().toISOString(),
    action: 'create_deposit_intent',
    experienceId,
    userId,
    amount,
    metadata,
  });

  try {
    const experience = await storage.getExperience(experienceId);
    if (!experience) {
      throw new Error('Experience not found');
    }

    const amountInCents = Math.round(amount * 100);
    const idempotencyKey = `deposit_${userId}_${experienceId}_${Date.now()}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: String(experience.currency || 'usd').toLowerCase(),
      capture_method: 'manual',
      metadata: {
        userId,
        experienceId,
        experienceTitle: experience.title,
        type: 'deposit',
        ...metadata,
      },
      description: `Deposit for ${experience.title}`,
    }, {
      idempotencyKey,
    });

    logPayment({
      timestamp: new Date().toISOString(),
      action: 'deposit_intent_created',
      paymentIntentId: paymentIntent.id,
      experienceId,
      userId,
      amount,
      status: paymentIntent.status,
    });

    if (!paymentIntent.client_secret) {
      throw new Error('Failed to create payment intent: no client secret returned');
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount,
    };
  } catch (error: any) {
    logPayment({
      timestamp: new Date().toISOString(),
      action: 'deposit_intent_error',
      experienceId,
      userId,
      amount,
      error: error.message,
    });
    throw error;
  }
}

export interface CapturePaymentParams {
  paymentIntentId: string;
  bookingId?: string;
  experienceId?: string;
  metadata?: Record<string, any>;
}

export interface CapturePaymentResult {
  paymentIntentId: string;
  amount: number;
  status: string;
  captured: boolean;
}

export async function capturePayment(
  params: CapturePaymentParams
): Promise<CapturePaymentResult> {
  const { paymentIntentId, bookingId, experienceId, metadata = {} } = params;

  logPayment({
    timestamp: new Date().toISOString(),
    action: 'capture_payment_start',
    paymentIntentId,
    bookingId,
    experienceId,
    metadata,
  });

  try {
    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId, {
      metadata: {
        bookingId: bookingId || '',
        experienceId: experienceId || '',
        captureReason: 'mvg_reached',
        ...metadata,
      },
    });

    const captured = paymentIntent.status === 'succeeded';
    const amount = paymentIntent.amount / 100;

    logPayment({
      timestamp: new Date().toISOString(),
      action: 'payment_captured',
      paymentIntentId: paymentIntent.id,
      bookingId,
      experienceId,
      amount,
      status: paymentIntent.status,
      captured,
    });

    return {
      paymentIntentId: paymentIntent.id,
      amount,
      status: paymentIntent.status,
      captured,
    };
  } catch (error: any) {
    logPayment({
      timestamp: new Date().toISOString(),
      action: 'capture_payment_error',
      paymentIntentId,
      bookingId,
      experienceId,
      error: error.message,
    });
    throw error;
  }
}

export interface RefundPaymentParams {
  paymentIntentId: string;
  bookingId?: string;
  experienceId?: string;
  amount?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface RefundPaymentResult {
  refundId: string;
  paymentIntentId: string;
  amount: number;
  status: string;
  reason?: string;
}

export async function refundPayment(
  params: RefundPaymentParams
): Promise<RefundPaymentResult> {
  const { paymentIntentId, bookingId, experienceId, amount, reason = 'mvg_failed', metadata = {} } = params;

  logPayment({
    timestamp: new Date().toISOString(),
    action: 'refund_payment_start',
    paymentIntentId,
    bookingId,
    experienceId,
    amount,
    metadata: { reason, ...metadata },
  });

  try {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
      metadata: {
        bookingId: bookingId || '',
        experienceId: experienceId || '',
        refundReason: reason,
        ...metadata,
      },
    };

    if (amount !== undefined) {
      refundParams.amount = Math.round(amount * 100);
    }

    const refund = await stripe.refunds.create(refundParams);

    const refundedAmount = refund.amount / 100;
    const refundStatus = refund.status || 'unknown';

    logPayment({
      timestamp: new Date().toISOString(),
      action: 'payment_refunded',
      paymentIntentId,
      bookingId,
      experienceId,
      amount: refundedAmount,
      status: refundStatus,
      metadata: { refundId: refund.id, reason },
    });

    return {
      refundId: refund.id,
      paymentIntentId,
      amount: refundedAmount,
      status: refundStatus,
      reason,
    };
  } catch (error: any) {
    logPayment({
      timestamp: new Date().toISOString(),
      action: 'refund_payment_error',
      paymentIntentId,
      bookingId,
      experienceId,
      amount,
      error: error.message,
    });
    throw error;
  }
}

export async function createSandboxCharge(params: {
  userId: string;
  experienceId: string;
  amount: number;
  paymentMethodNonce: string;
}): Promise<{ success: boolean; paymentIntentId: string }> {
  const { userId, experienceId, amount, paymentMethodNonce } = params;

  logPayment({
    timestamp: new Date().toISOString(),
    action: 'sandbox_charge',
    userId,
    experienceId,
    amount,
    metadata: { paymentMethodNonce },
  });

  if (paymentMethodNonce === 'sandbox_test') {
    const mockPaymentIntentId = `pi_sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logPayment({
      timestamp: new Date().toISOString(),
      action: 'sandbox_charge_success',
      paymentIntentId: mockPaymentIntentId,
      userId,
      experienceId,
      amount,
      status: 'requires_capture',
    });

    return {
      success: true,
      paymentIntentId: mockPaymentIntentId,
    };
  }

  return createDepositIntent({ userId, experienceId, amount }).then(result => ({
    success: true,
    paymentIntentId: result.paymentIntentId,
  }));
}

export const paymentService = {
  createDepositIntent,
  capturePayment,
  refundPayment,
  createSandboxCharge,
  getPaymentLogs,
  stripe,
};
