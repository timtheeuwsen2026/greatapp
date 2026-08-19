/**
 * The publishable key, cleaned before Stripe.js ever sees it.
 *
 * Vite bakes `VITE_STRIPE_PUBLIC_KEY` into the browser bundle at *build* time,
 * so the server-side sanitiser in server/env.ts cannot reach it - by the time
 * the server starts, the value is already a string literal inside the compiled
 * JavaScript.
 *
 * That matters because the same copy-paste that breaks the secret key breaks
 * this one: a key pasted into a hosting dashboard with the line break attached
 * gets embedded as "pk_live_...\n", and every Stripe.js call then fails with an
 * invalid-API-key error that names a key which looks perfectly correct in the
 * dashboard.
 *
 * Trimming here costs nothing and removes the whole class of failure.
 */

/** Whitespace, control characters and the UTF-8 BOM at either end of a value. */
const EDGE_NOISE = new RegExp(
  '^[\\s\\u0000-\\u001f\\u007f-\\u009f\\ufeff]+|[\\s\\u0000-\\u001f\\u007f-\\u009f\\ufeff]+$',
  'g',
);

/** Strip edge whitespace/control characters and any wrapping quotes. */
export function sanitizeStripeKey(raw: string | undefined | null): string {
  if (!raw) return '';
  let value = raw.replace(EDGE_NOISE, '');

  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      value = value.slice(1, -1).replace(EDGE_NOISE, '');
    }
  }

  return value;
}

/**
 * The configured publishable key, or '' when it is missing or unusable.
 * Callers treat '' as "Stripe is not configured".
 */
export function getStripePublishableKey(): string {
  const key = sanitizeStripeKey(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
  if (!key) return '';

  if (!key.startsWith('pk_test_') && !key.startsWith('pk_live_')) {
    // A secret key here would be a serious mistake - never send it to Stripe.js.
    console.error(
      '[Stripe] VITE_STRIPE_PUBLIC_KEY does not look like a publishable key ' +
      '(expected it to start with pk_test_ or pk_live_). Checkout is disabled.',
    );
    return '';
  }

  return key;
}
