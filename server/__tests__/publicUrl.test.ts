import { describe, expect, it } from "vitest";
import { normalizePublicAppBaseUrl, setAuthActionRedirect } from "../publicUrl";

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

  it("forces Supabase action links to the configured application destination", () => {
    const result = setAuthActionRedirect(
      "https://project.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=http%3A%2F%2Flocalhost%3A3000",
      "https://app.great.example/reset-password",
    );
    const parsed = new URL(result);

    expect(parsed.searchParams.get("redirect_to"))
      .toBe("https://app.great.example/reset-password");
    expect(parsed.searchParams.get("token")).toBe("abc");
  });
});
