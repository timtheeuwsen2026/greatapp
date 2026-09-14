import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { insertCreatorProfileSchema } from "@shared/schema";

/**
 * Saving a creator profile must not un-approve the creator.
 *
 * Three handlers wrote `creator_profiles`, and Express takes the first match —
 * so the one that ran was an older duplicate that hardcoded `approved: false`.
 * Every profile save therefore revoked the creator's approval: they edited
 * something, met "Your profile is with our team", an admin approved them, they
 * edited again, and round it went. The same handler built its payload from an
 * explicit field list, so the matching fields added later were dropped on the
 * way past — which is the "my information is not saved" half of the same bug.
 *
 * Approval is a decision an admin makes about a creator. Nothing the creator
 * sends should be able to change it in either direction.
 */

const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");

describe("the creator profile write path", () => {
  it("has exactly one handler, so nothing can shadow the validated one", () => {
    const writes = routes.match(
      /app\.(post|put)\(\s*['"]\/api\/creator-profile['"]/g,
    ) ?? [];
    expect(writes).toHaveLength(1);
  });

  it("goes through the schema rather than a hand-built payload", () => {
    const start = routes.indexOf('app.post("/api/creator-profile"');
    const handler = routes.slice(start, start + 1_200);
    expect(handler).toContain("insertCreatorProfileSchema.safeParse");
    expect(handler).not.toContain("approved:");
  });

  it("does not leave an unauthenticated write on the path", () => {
    // The removed PUT had no `isAuthenticated` and wrote to a hardcoded id.
    // Scoped to this path on purpose: the dev-fallback id is a convention
    // across roughly twenty other handlers in this file and is not this
    // change's to sweep. What matters here is that every route which can write
    // a creator profile sits behind the auth middleware.
    expect(routes).not.toContain("app.put('/api/creator-profile', async");

    const writes = routes.matchAll(
      /app\.(post|put)\(\s*['"]\/api\/creator-profile['"]\s*,\s*([A-Za-z]+)/g,
    );
    for (const match of writes) {
      expect(match[2], `${match[1]} /api/creator-profile is not authenticated`)
        .toBe("isAuthenticated");
    }
  });

  it("keeps the onboarding step behind auth and the schema too", () => {
    // Same table, a second door: POST /api/creator/onboard passed `data`
    // straight to the storage layer, so posting
    // { step: 'profile', data: { approved: true } } was a self-approval.
    const start = routes.indexOf('app.post("/api/creator/onboard"');
    expect(start).toBeGreaterThan(-1);
    const handler = routes.slice(start, start + 1_800);
    expect(handler).toContain('app.post("/api/creator/onboard", isAuthenticated');
    expect(handler).toContain("insertCreatorProfileSchema");
  });
});

describe("insertCreatorProfileSchema", () => {
  const valid = {
    displayName: "Chris",
    bio: "Breathwork and cold exposure, every Sunday.",
    location: "Barcelona",
    experienceLevel: "Experienced",
    payoutEmail: "chris@example.test",
    termsAccepted: true,
  };

  it("strips `approved`, so a creator cannot approve or un-approve themselves", () => {
    const parsed = insertCreatorProfileSchema.parse({ ...valid, approved: true });
    expect(parsed).not.toHaveProperty("approved");

    const unapproving = insertCreatorProfileSchema.parse({ ...valid, approved: false });
    expect(unapproving).not.toHaveProperty("approved");
  });

  it("carries the matching fields that the old handler dropped", () => {
    const parsed = insertCreatorProfileSchema.parse({
      ...valid,
      city: "Barcelona",
      category: "sports_wellness",
      lookingFor: ["venue", "sponsor"],
      openToPerks: true,
      openToPromoters: true,
    }) as any;

    expect(parsed.city).toBe("Barcelona");
    expect(parsed.category).toBe("sports_wellness");
    expect(parsed.lookingFor).toEqual(["venue", "sponsor"]);
    expect(parsed.openToPerks).toBe(true);
    expect(parsed.openToPromoters).toBe(true);
  });

  it("leaves stripeVerificationStatus alone when the caller does not send one", () => {
    // The old handler forced it back to "pending" on every save, undoing a
    // completed Stripe onboarding.
    const parsed = insertCreatorProfileSchema.parse(valid) as any;
    expect(parsed.stripeVerificationStatus).toBeUndefined();
  });
});
