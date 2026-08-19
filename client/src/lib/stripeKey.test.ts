import { describe, expect, it } from "vitest";
import { sanitizeStripeKey } from "./stripeKey";

/**
 * Vite embeds VITE_STRIPE_PUBLIC_KEY into the browser bundle at build time, so
 * a key pasted into the hosting dashboard with a trailing line break ships to
 * every visitor as "pk_live_...\n" and makes Stripe.js reject a key that looks
 * correct in the dashboard.
 */
describe("publishable key sanitisation", () => {
  it("strips a trailing line break", () => {
    expect(sanitizeStripeKey("pk_live_abc123\n")).toBe("pk_live_abc123");
    expect(sanitizeStripeKey("pk_live_abc123\r\n")).toBe("pk_live_abc123");
  });

  it("strips surrounding whitespace and wrapping quotes", () => {
    expect(sanitizeStripeKey("  pk_live_abc123  ")).toBe("pk_live_abc123");
    expect(sanitizeStripeKey('"pk_live_abc123"')).toBe("pk_live_abc123");
    expect(sanitizeStripeKey("'pk_live_abc123'")).toBe("pk_live_abc123");
  });

  it("leaves a clean key untouched", () => {
    expect(sanitizeStripeKey("pk_test_51ABCdef")).toBe("pk_test_51ABCdef");
  });

  it("returns an empty string for missing values", () => {
    expect(sanitizeStripeKey(undefined)).toBe("");
    expect(sanitizeStripeKey(null)).toBe("");
    expect(sanitizeStripeKey("")).toBe("");
    expect(sanitizeStripeKey("   ")).toBe("");
  });
});
