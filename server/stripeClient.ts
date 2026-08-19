/**
 * The one Stripe client for the whole server.
 *
 * Five modules used to call `new Stripe(process.env.STRIPE_SECRET_KEY, ...)`
 * independently (routes, payments, payout-scheduler, mvg-scheduler,
 * payment-reconciler). That meant five copies of the API version to keep in
 * sync, five chances to skip a validation step, and - when the key was
 * malformed - five separate places producing the same unreadable
 * `StripeConnectionError`.
 *
 * Constructing it here means the key is sanitised and checked exactly once, and
 * a bad key produces a message that names the actual problem at boot instead of
 * a "connection error" at checkout time.
 */

import Stripe from 'stripe';
// Importing ./env runs its sanitiser before anything here reads a secret - it
// strips the stray newline/quote characters that make a pasted key unusable as
// an Authorization header.
import { requireEnv, isHeaderSafe, describeUnsafeChars } from './env';

/** Pinned once, shared by every caller. */
export const STRIPE_API_VERSION = '2025-07-30.basil' as const;

/** 'test' | 'live' | 'unknown' - derived from a Stripe key prefix. */
export function stripeKeyMode(key: string | undefined): 'test' | 'live' | 'unknown' {
  if (!key) return 'unknown';
  if (key.startsWith('sk_test') || key.startsWith('pk_test') || key.startsWith('rk_test')) return 'test';
  if (key.startsWith('sk_live') || key.startsWith('pk_live') || key.startsWith('rk_live')) return 'live';
  return 'unknown';
}

/**
 * Validate the secret key's shape before handing it to the SDK.
 *
 * Throws with an actionable message. The alternative - letting a malformed key
 * through - surfaces two layers away as `StripeConnectionError: An error
 * occurred with our connection to Stripe. Request was retried 2 times.`, which
 * describes a network fault that is not happening.
 */
function readSecretKey(): string {
  // requireEnv already rejects a missing value and any value carrying
  // characters that Node will not put in a header.
  const key = requireEnv('STRIPE_SECRET_KEY');

  if (!isHeaderSafe(key)) {
    // Unreachable in practice (requireEnv checks the same thing) but kept as a
    // hard stop: this is the exact failure that took checkout down.
    throw new Error(
      `STRIPE_SECRET_KEY contains characters that cannot be sent in an HTTP ` +
      `header: ${describeUnsafeChars(key)}.`,
    );
  }

  if (!/^(sk|rk)_(test|live)_/.test(key)) {
    const shape = `${key.slice(0, 8)}... (length ${key.length})`;
    throw new Error(
      `STRIPE_SECRET_KEY does not look like a Stripe secret key. Expected it to ` +
      `start with sk_test_, sk_live_, rk_test_ or rk_live_, but got ${shape}. ` +
      `A publishable key (pk_...) or a truncated paste will fail every API call.`,
    );
  }

  return key;
}

export const stripeSecretKey = readSecretKey();

// Options are deliberately limited to the API version — the same configuration
// the five separate clients used before. The SDK's defaults (80s timeout, 2
// network retries) are left alone so this change fixes the key handling without
// altering request behaviour.
export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: STRIPE_API_VERSION,
});

export default stripe;
