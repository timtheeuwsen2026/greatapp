import { describe, expect, it } from "vitest";
import {
  createEmailPreferenceToken,
  resolveEmailPreferenceSecret,
  verifyEmailPreferenceToken,
} from "../emailPreferenceTokens";

const secret = "test-email-preference-secret";
const now = new Date("2026-07-18T12:00:00.000Z");

describe("email preference tokens", () => {
  it("uses an existing stable server secret when a dedicated secret is absent", () => {
    expect(resolveEmailPreferenceSecret({
      SESSION_SECRET: "s".repeat(32),
      SUPABASE_SERVICE_ROLE_KEY: "k".repeat(64),
    })).toBe("s".repeat(32));
  });

  it("can use the required provider key as the final stable fallback", () => {
    expect(resolveEmailPreferenceSecret({ RESEND_API_KEY: "r".repeat(40) }))
      .toBe("r".repeat(40));
  });

  it("round-trips a normalized address", () => {
    const token = createEmailPreferenceToken(" Person@Example.COM ", { now, secret });
    expect(verifyEmailPreferenceToken(token, { now, secret })).toEqual({ email: "person@example.com" });
  });

  it("rejects tampered signatures", () => {
    const token = createEmailPreferenceToken("person@example.com", { now, secret });
    expect(() => verifyEmailPreferenceToken(`${token}x`, { now, secret })).toThrow("Invalid email preference token");
  });

  it("rejects expired tokens", () => {
    const token = createEmailPreferenceToken("person@example.com", {
      now,
      secret,
      expiresInSeconds: 60,
    });
    const later = new Date(now.getTime() + 61_000);
    expect(() => verifyEmailPreferenceToken(token, { now: later, secret })).toThrow("Expired or invalid");
  });
});
