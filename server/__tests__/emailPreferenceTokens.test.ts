import { describe, expect, it } from "vitest";
import { createEmailPreferenceToken, verifyEmailPreferenceToken } from "../emailPreferenceTokens";

const secret = "test-email-preference-secret";
const now = new Date("2026-07-18T12:00:00.000Z");

describe("email preference tokens", () => {
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
