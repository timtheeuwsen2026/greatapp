import { describe, expect, it } from "vitest";
import {
  buildAppAuthActionUrl,
  normalizePublicAppBaseUrl,
} from "../publicUrl";

describe("public application URLs", () => {
  it("normalizes the configured public URL", () => {
    expect(normalizePublicAppBaseUrl("https://app.great.example/"))
      .toBe("https://app.great.example");
  });

  it("rejects localhost and HTTP URLs in production", () => {
    expect(() => normalizePublicAppBaseUrl("http://localhost:3000", { production: true }))
      .toThrow("public HTTPS URL");
    expect(() => normalizePublicAppBaseUrl("http://great.example", { production: true }))
      .toThrow("public HTTPS URL");
  });

  it("builds an application-hosted recovery link from a Supabase action link", () => {
    const result = buildAppAuthActionUrl(
      "https://project.supabase.co/auth/v1/verify?token=secure-hash&type=recovery&redirect_to=http%3A%2F%2Flocalhost%3A3000",
      "https://app.great.example/reset-password",
      "recovery",
    );
    const parsed = new URL(result);

    expect(parsed.origin).toBe("https://app.great.example");
    expect(parsed.pathname).toBe("/reset-password");
    expect(parsed.searchParams.get("token_hash")).toBe("secure-hash");
    expect(parsed.searchParams.get("type")).toBe("recovery");
    expect(result).not.toContain("localhost");
    expect(result).not.toContain("supabase.co/auth/v1/verify");
  });

  it("keeps signup verification on the configured application domain", () => {
    const result = buildAppAuthActionUrl(
      "https://project.supabase.co/auth/v1/verify?token=signup-hash&type=signup",
      "https://app.great.example/login?verified=1",
      "signup",
    );
    const parsed = new URL(result);

    expect(parsed.origin).toBe("https://app.great.example");
    expect(parsed.searchParams.get("verified")).toBe("1");
    expect(parsed.searchParams.get("token_hash")).toBe("signup-hash");
    expect(parsed.searchParams.get("type")).toBe("signup");
  });

  it("rejects malformed recovery action links", () => {
    expect(() => buildAppAuthActionUrl(
      "https://project.supabase.co/auth/v1/verify?type=signup",
      "https://app.great.example/reset-password",
      "recovery",
    )).toThrow("Invalid Supabase recovery action link");
  });
});
