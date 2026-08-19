import { describe, expect, it } from "vitest";
import http from "node:http";
import {
  sanitizeEnvValue,
  isHeaderSafe,
  describeUnsafeChars,
} from "../env";

/**
 * Regression cover for the production outage where every Stripe call failed with
 *
 *   StripeConnectionError: An error occurred with our connection to Stripe.
 *   Request was retried 2 times.
 *   detail: TypeError [ERR_INVALID_CHAR]: Invalid character in header content ["Authorization"]
 *
 * The cause was a secret key stored with a trailing line break. Node will not
 * put a control character into a header, so the request never left the process.
 */

/**
 * Does Node accept this value as an Authorization header? Uses Node's own
 * validator, so the test asserts against the real rule rather than a
 * re-implementation of it. No socket is opened.
 */
function nodeAcceptsAsHeader(value: string): boolean {
  try {
    http.validateHeaderValue("Authorization", `Bearer ${value}`);
    return true;
  } catch {
    return false;
  }
}

describe("environment value sanitisation", () => {
  it("strips the trailing line break that broke every Stripe request", () => {
    expect(sanitizeEnvValue("sk_live_abc123\n")).toBe("sk_live_abc123");
    expect(sanitizeEnvValue("sk_live_abc123\r")).toBe("sk_live_abc123");
    expect(sanitizeEnvValue("sk_live_abc123\r\n")).toBe("sk_live_abc123");
  });

  it("strips surrounding whitespace, tabs and a UTF-8 BOM", () => {
    expect(sanitizeEnvValue("  sk_live_abc123  ")).toBe("sk_live_abc123");
    expect(sanitizeEnvValue("\tsk_live_abc123\t")).toBe("sk_live_abc123");
    expect(sanitizeEnvValue("\ufeffsk_live_abc123")).toBe("sk_live_abc123");
  });

  it("removes quotes left behind by pasting KEY=\"value\" into a dashboard", () => {
    expect(sanitizeEnvValue('"sk_live_abc123"')).toBe("sk_live_abc123");
    expect(sanitizeEnvValue("'sk_live_abc123'")).toBe("sk_live_abc123");
    expect(sanitizeEnvValue('"sk_live_abc123"\n')).toBe("sk_live_abc123");
  });

  it("leaves an already-clean value untouched", () => {
    expect(sanitizeEnvValue("sk_live_abc123")).toBe("sk_live_abc123");
  });

  it("preserves genuinely multi-line values such as PEM keys", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIBVgIBADA\n-----END PRIVATE KEY-----\n";
    expect(sanitizeEnvValue(pem)).toBe(pem);
  });

  it("does not strip a quote that is only on one end", () => {
    expect(sanitizeEnvValue('"sk_live_abc123')).toBe('"sk_live_abc123');
    expect(sanitizeEnvValue("sk_live_abc123'")).toBe("sk_live_abc123'");
  });
});

describe("header safety", () => {
  it("agrees with Node about which values are valid header content", () => {
    const poisoned = ["sk_live_abc\n", "sk_live_abc\r", "sk_live_abc\r\n", "sk_live_abc\u0000"];
    for (const value of poisoned) {
      expect(isHeaderSafe(value), `${JSON.stringify(value)} should be unsafe`).toBe(false);
      expect(nodeAcceptsAsHeader(value), `Node should reject ${JSON.stringify(value)}`).toBe(false);
    }

    const accepted = ["sk_live_abc", "sk_test_51ABCdef", "Bearer-ish_value.123", "sk live"];
    for (const value of accepted) {
      expect(isHeaderSafe(value), `${JSON.stringify(value)} should be safe`).toBe(true);
      expect(nodeAcceptsAsHeader(value), `Node should accept ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it("makes a poisoned key usable again after sanitisation", () => {
    const poisoned = "sk_live_51ABCdefGHI\r\n";
    expect(nodeAcceptsAsHeader(poisoned)).toBe(false);
    expect(nodeAcceptsAsHeader(sanitizeEnvValue(poisoned))).toBe(true);
  });

  it("names the offending character without revealing the secret", () => {
    const description = describeUnsafeChars("sk_live_secret\n");
    expect(description).toContain("newline");
    expect(description).not.toContain("sk_live_secret");
  });
});
