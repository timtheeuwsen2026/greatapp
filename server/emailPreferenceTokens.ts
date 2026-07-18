import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

interface EmailPreferenceTokenPayload {
  v: number;
  email: string;
  exp: number;
}

interface EmailPreferenceSecretEnvironment {
  EMAIL_PREFERENCES_SECRET?: string;
  SESSION_SECRET?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function resolveEmailPreferenceSecret(
  environment: EmailPreferenceSecretEnvironment,
): string | undefined {
  return [
    environment.EMAIL_PREFERENCES_SECRET,
    environment.SESSION_SECRET,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    environment.RESEND_API_KEY,
  ].find((candidate) => typeof candidate === "string" && candidate.length >= 32);
}

export function getConfiguredEmailPreferenceSecret(): string | undefined {
  return resolveEmailPreferenceSecret(process.env);
}

function tokenSecret(explicitSecret?: string): string {
  if (explicitSecret) return explicitSecret;
  const configured = getConfiguredEmailPreferenceSecret();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "great-local-email-preferences-secret";
  throw new Error("A stable server secret of at least 32 characters must be configured in production");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createEmailPreferenceToken(
  email: string,
  options: { now?: Date; expiresInSeconds?: number; secret?: string } = {},
): string {
  const now = options.now || new Date();
  const payload: EmailPreferenceTokenPayload = {
    v: TOKEN_VERSION,
    email: normalizeEmail(email),
    exp: Math.floor(now.getTime() / 1000) + (options.expiresInSeconds || DEFAULT_TOKEN_LIFETIME_SECONDS),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, tokenSecret(options.secret))}`;
}

export function verifyEmailPreferenceToken(
  token: string,
  options: { now?: Date; secret?: string } = {},
): { email: string } {
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) {
    throw new Error("Invalid email preference token");
  }

  const expectedSignature = sign(encodedPayload, tokenSecret(options.secret));
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Invalid email preference token");
  }

  let payload: EmailPreferenceTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid email preference token");
  }

  const nowSeconds = Math.floor((options.now || new Date()).getTime() / 1000);
  if (payload.v !== TOKEN_VERSION || !payload.email || payload.exp < nowSeconds) {
    throw new Error("Expired or invalid email preference token");
  }

  return { email: normalizeEmail(payload.email) };
}
