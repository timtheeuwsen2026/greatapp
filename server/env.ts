/**
 * Environment sanitisation - runs before anything reads a secret.
 *
 * Why this exists
 * ---------------
 * Node refuses to put a control character into an HTTP header. If a value ends
 * up with a stray newline or carriage return - which is what happens when a key
 * is pasted into a hosting dashboard (Railway, Heroku, Render) and the paste
 * carries the line break with it - then the very first outbound API call dies
 * with:
 *
 *   TypeError [ERR_INVALID_CHAR]: Invalid character in header content ["Authorization"]
 *
 * The SDK on top of it retries, gives up, and reports a *connection* problem:
 *
 *   StripeConnectionError: An error occurred with our connection to Stripe.
 *   Request was retried 2 times.
 *
 * That message sends you hunting for a network fault that does not exist. One
 * invisible byte takes down every Stripe call in the process: checkout, Connect
 * onboarding, payouts, and the reconciler sweep.
 *
 * The same hazard applies to every other credential we send as a header -
 * Resend, SendGrid, Supabase, OpenAI - and to connection strings like
 * DATABASE_URL, where a trailing newline corrupts the parsed password.
 *
 * What it does
 * ------------
 * Trims leading/trailing whitespace and control characters from every
 * single-line environment value, and removes wrapping quotes left behind by a
 * copy-paste of `KEY="value"`.
 *
 * Genuinely multi-line values (PEM keys, service-account JSON) are left
 * untouched - they are never HTTP header values, and their internal newlines
 * are meaningful.
 *
 * Import this module first, before any module that reads a secret.
 */

/**
 * Whitespace, control characters, and the UTF-8 BOM, at either end of a value.
 * Built from a string so this file stays plain ASCII.
 */
const EDGE_NOISE_CLASS = '[\\s\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\ufeff]';
const EDGE_NOISE = new RegExp(`^${EDGE_NOISE_CLASS}+|${EDGE_NOISE_CLASS}+$`, 'g');

/**
 * Characters Node rejects in a header value. Node permits horizontal tab plus
 * printable ASCII and the extended 8-bit range; everything else - notably \r
 * and \n - throws ERR_INVALID_CHAR.
 */
const HEADER_UNSAFE = new RegExp('[^\\t\\u0020-\\u007e\\u0080-\\u00ff]');

/** Multi-line check, kept separate so the intent reads clearly. */
const HAS_LINE_BREAK = new RegExp('[\\r\\n]');

/**
 * Clean one value the way a hosting dashboard should have stored it.
 * Returns the input unchanged when it is multi-line or already clean.
 */
export function sanitizeEnvValue(value: string): string {
  const trimmed = value.replace(EDGE_NOISE, '');

  // A value that is still multi-line after trimming is a real multi-line value
  // (PEM block, JSON credentials). Leave it exactly as provided.
  if (HAS_LINE_BREAK.test(trimmed)) return value;

  // `KEY="value"` / `KEY='value'` pasted verbatim into a dashboard field.
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return trimmed.slice(1, -1).replace(EDGE_NOISE, '');
    }
  }

  return trimmed;
}

/** True when the value can be sent as an HTTP header without Node throwing. */
export function isHeaderSafe(value: string): boolean {
  return !HEADER_UNSAFE.test(value);
}

/**
 * Describe the offending characters in a value, for error messages.
 * Reports positions and character codes only - never the value itself.
 */
export function describeUnsafeChars(value: string): string {
  const found: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!HEADER_UNSAFE.test(value[i])) continue;
    const code = value.charCodeAt(i);
    const name =
      code === 10 ? 'newline (\\n)' :
      code === 13 ? 'carriage return (\\r)' :
      `control character 0x${code.toString(16).padStart(2, '0')}`;
    found.push(`${name} at position ${i} of ${value.length}`);
  }
  return found.join(', ');
}

let normalized = false;

/**
 * Sanitise every value in process.env, in place. Idempotent - safe to call from
 * several entry points (server boot, scripts, tests).
 *
 * Logs the *names* of the variables it repaired so a misconfigured deploy is
 * visible in the logs. Values are never logged.
 */
export function normalizeEnv(): string[] {
  if (normalized) return [];
  normalized = true;

  const repaired: string[] = [];

  for (const key of Object.keys(process.env)) {
    const value = process.env[key];
    if (typeof value !== 'string') continue;

    const clean = sanitizeEnvValue(value);
    if (clean !== value) {
      process.env[key] = clean;
      repaired.push(key);
    }
  }

  if (repaired.length > 0) {
    console.warn(
      `[env] Cleaned stray whitespace/quotes from ${repaired.length} environment ` +
      `variable(s): ${repaired.join(', ')}. These were fixed automatically, but the ` +
      `stored values should be corrected in the hosting dashboard - a trailing ` +
      `newline in a secret breaks outbound API calls with ERR_INVALID_CHAR.`,
    );
  }

  return repaired;
}

/**
 * Read a required variable, failing loudly and specifically when it is missing
 * or still unusable as an HTTP header.
 */
export function requireEnv(name: string): string {
  normalizeEnv();
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in the hosting ` +
      `dashboard (or .env for local development) and restart.`,
    );
  }

  if (!isHeaderSafe(value)) {
    throw new Error(
      `Environment variable ${name} contains characters that cannot be sent in an ` +
      `HTTP header: ${describeUnsafeChars(value)}. This is almost always a line ` +
      `break captured while copy-pasting the value. Re-paste it as a single line ` +
      `with no leading or trailing whitespace.`,
    );
  }

  return value;
}

/** Read an optional variable, sanitised. Returns undefined when unset or blank. */
export function optionalEnv(name: string): string | undefined {
  normalizeEnv();
  const value = process.env[name];
  return value ? value : undefined;
}

// Run on import so simply importing this module is enough to make the
// environment safe for whatever loads next.
normalizeEnv();
