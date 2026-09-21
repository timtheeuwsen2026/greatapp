import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Nobody who signed up can be locked out for good.
 *
 * Thirteen production accounts signed up, never verified, and never got in —
 * mostly a verification email lost to a spam filter or a mistyped address.
 * There was no exit from that state:
 *
 *   log in    → "Email not confirmed"             (no way to get a new link)
 *   sign up   → "This email already has an account. Please log in instead."
 *   log in    → "Email not confirmed" …
 *
 * and an expired link told them to "create your account again", which is the
 * second line above. These pin the way out.
 */

const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
const authPage = readFileSync(join(process.cwd(), "client/src/pages/auth.tsx"), "utf8");

function handler(signature: string, length = 4_000): string {
  const start = routes.indexOf(signature);
  expect(start, `${signature} is missing`).toBeGreaterThan(-1);
  return routes.slice(start, start + length);
}

describe("the server side", () => {
  it("can send a fresh link to somebody who never verified", () => {
    const resend = handler("app.post('/api/auth/resend-verification'", 1_200);
    expect(resend).toContain("sendFreshSignInLink(");
    // The same answer whether or not the account exists, so this cannot be
    // used to find out who has one.
    expect(resend).toContain("If that address has an account waiting");
  });

  it("builds the fresh link on a recovery link, which cannot create an account", () => {
    const helper = handler("const sendFreshSignInLink = async", 2_200);
    expect(helper).toContain("type: 'recovery'");
    expect(helper).not.toContain("type: 'magiclink'");
    // Throttled per address.
    expect(helper).toContain("60_000");
  });

  it("answers a repeat sign-up with a fresh link instead of 'log in instead'", () => {
    const signup = handler("app.post('/api/auth/signup'", 5_000);
    const alreadyBranch = signup.slice(signup.indexOf("includes('already')"));
    const resend = alreadyBranch.indexOf("sendFreshSignInLink(");
    const conflict = alreadyBranch.indexOf("status(409)");
    expect(resend).toBeGreaterThan(-1);
    // The 409 is only the fallback when no link could be sent.
    expect(resend).toBeLessThan(conflict);
  });

  it("carries the page the person came from through the verification email", () => {
    expect(routes).toContain("const safeReturnTo = (value: unknown): string | null =>");
    // Never an open redirect: a protocol-relative path is refused.
    expect(routes).toContain("path.startsWith('//')");
    const signup = handler("app.post('/api/auth/signup'", 5_000);
    expect(signup).toContain("verifiedLoginUrl(appBaseUrl, returnTo)");
  });
});

describe("the login page", () => {
  it("offers a new link when the email is not confirmed", () => {
    expect(authPage).toMatch(/email_not_confirmed/);
    expect(authPage).toContain("data-testid=\"button-resend-verification\"");
    expect(authPage).toContain("/api/auth/resend-verification");
  });

  it("verifies and signs in from the fresh link, not only from the first one", () => {
    expect(authPage).toContain('linkType !== "signup" && linkType !== "recovery"');
    expect(authPage).toContain("verifyOtp({ token_hash: tokenHash, type: linkType })");
  });

  it("no longer tells anybody to create their account again", () => {
    expect(authPage).not.toContain("Please create your account again");
  });

  it("stops an address that cannot receive mail before the account is made", () => {
    expect(authPage).toContain("checkEmailForTypos(email)");
    expect(authPage).toContain("returnTo }");
  });
});
