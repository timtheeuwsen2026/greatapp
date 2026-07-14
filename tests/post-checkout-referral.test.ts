import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensurePostCheckoutReferral, readPostCheckoutReferral } from "../client/src/lib/postCheckoutReferral";

describe("post-checkout referral handoff", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("passes a generated referral link through the user-scoped session cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      referralCode: "FRIEND10",
      referralLink: "https://greatapp.test/experience/trip?ref=FRIEND10&share=abc",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = await ensurePostCheckoutReferral("trip-1", "user-1");

    expect(result.referralLink).toContain("ref=FRIEND10");
    expect(readPostCheckoutReferral("trip-1", "user-1")).toEqual(result);
    expect(readPostCheckoutReferral("trip-1", "user-2")).toBeUndefined();
  });

  it("rejects incomplete API data instead of rendering a broken link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      referralCode: "FRIEND10",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(ensurePostCheckoutReferral("trip-1", "user-1"))
      .rejects.toThrow("incomplete link");
  });
});
