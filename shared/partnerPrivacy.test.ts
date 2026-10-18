import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicPartnerEntry, redactPartnerSecrets } from "./partnerPrivacy";

// A published event's partner list — as mirrored onto the experience row —
// carried each partner's invite token, email and account id to anyone who
// loaded the public events API. Found live on 18 Oct 2026 on the yoga event:
// AMUNT's invite token, referral code and account id were public.

const amunt = {
  id: "entry-1",
  name: "AMUNT",
  partnerType: "community",
  dealType: "commission_per_ticket",
  status: "invited",
  source: "platform",
  partnerUserId: "user-amunt",
  email: "hello@amunt.example",
  inviteToken: "secret-invite-token",
  refCode: "amunt-yoga",
  terms: { commissionPct: 20, assignedAffiliateId: "user-amunt", showInExperiencePool: false },
};

const event = (overrides: Record<string, unknown> = {}) => ({
  id: "yoga",
  title: "Immersive Yoga and Breathwork",
  creatorId: "organiser",
  eventPartners: [amunt],
  ...overrides,
});

describe("one partner entry, as the public sees it", () => {
  it("drops the invite token, email, account id and referral code", () => {
    const shown = publicPartnerEntry(amunt) as Record<string, unknown>;
    for (const key of ["inviteToken", "email", "partnerUserId", "refCode"]) expect(shown).not.toHaveProperty(key);
  });

  it("drops a hand-picked affiliate from the terms, and keeps the rest of the deal", () => {
    const shown = publicPartnerEntry(amunt) as any;
    expect(shown.terms).toEqual({ commissionPct: 20, showInExperiencePool: false });
  });

  it("keeps what a participant page uses: who, what kind, which deal, and whether they said yes", () => {
    expect(publicPartnerEntry(amunt)).toMatchObject({
      id: "entry-1", name: "AMUNT", partnerType: "community", dealType: "commission_per_ticket", status: "invited",
    });
  });

  it("does not change the entry it was given", () => {
    publicPartnerEntry(amunt);
    expect(amunt.inviteToken).toBe("secret-invite-token");
    expect(amunt.terms.assignedAffiliateId).toBe("user-amunt");
  });

  it("passes through anything that is not an entry", () => {
    for (const odd of [null, "x", 3, ["a"]]) expect(publicPartnerEntry(odd)).toBe(odd);
  });
});

describe("a whole response", () => {
  it("hides the secrets from a signed-out visitor", () => {
    const shown = redactPartnerSecrets(event(), null) as any;
    expect(shown.eventPartners[0]).not.toHaveProperty("inviteToken");
    expect(shown.eventPartners[0]).not.toHaveProperty("email");
    expect(JSON.stringify(shown)).not.toContain("secret-invite-token");
  });

  it("hides them from a signed-in account that does not own the event", () => {
    const shown = redactPartnerSecrets(event(), "someone-else") as any;
    expect(JSON.stringify(shown)).not.toContain("secret-invite-token");
    expect(JSON.stringify(shown)).not.toContain("hello@amunt.example");
  });

  it("hides them from the partner too: their own link comes from Partner Home, not the event row", () => {
    const shown = redactPartnerSecrets(event(), "user-amunt") as any;
    expect(JSON.stringify(shown)).not.toContain("secret-invite-token");
  });

  it("leaves them for the organiser, who edits and re-sends them", () => {
    const original = event();
    const shown = redactPartnerSecrets(original, "organiser") as any;
    expect(shown.eventPartners[0].inviteToken).toBe("secret-invite-token");
    expect(shown).toBe(original);
  });

  it("covers every event in a list, and only the events the viewer does not own", () => {
    const mine = event({ id: "mine", creatorId: "me" });
    const theirs = event({ id: "theirs" });
    const shown = redactPartnerSecrets([mine, theirs], "me") as any[];
    expect(shown[0].eventPartners[0].inviteToken).toBe("secret-invite-token");
    expect(shown[1].eventPartners[0]).not.toHaveProperty("inviteToken");
  });

  it("finds an event nested inside another object", () => {
    const booking = { id: "booking-1", experience: event(), items: [{ experience: event() }] };
    expect(JSON.stringify(redactPartnerSecrets(booking, "buyer"))).not.toContain("secret-invite-token");
  });

  it("does not change what the route handed it", () => {
    const original = event();
    redactPartnerSecrets(original, null);
    expect(original.eventPartners[0].inviteToken).toBe("secret-invite-token");
  });

  it("returns the very same response when there is nothing to remove", () => {
    const plain = { id: "x", title: "No partners", nested: [{ a: 1 }], when: new Date(0) };
    expect(redactPartnerSecrets(plain, null)).toBe(plain);
    const noPartners = event({ eventPartners: [] });
    expect((redactPartnerSecrets(noPartners, null) as any).eventPartners).toEqual([]);
  });

  it("leaves dates, numbers and strings alone", () => {
    const when = new Date(0);
    const shown = redactPartnerSecrets({ ...event(), startDate: when, price: 35 }, null) as any;
    expect(shown.startDate).toBe(when);
    expect(shown.price).toBe(35);
    expect(redactPartnerSecrets("text", null)).toBe("text");
    expect(redactPartnerSecrets(null, null)).toBe(null);
  });

  it("treats a record with no owner field as not the viewer's", () => {
    const shown = redactPartnerSecrets({ eventPartners: [amunt] }, "organiser") as any;
    expect(shown.eventPartners[0]).not.toHaveProperty("inviteToken");
  });
});

describe("the server applies it to every API response", () => {
  const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8").replace(/\r\n/g, "\n");

  it("wraps res.json for all of /api, right after the viewer is known", () => {
    const auth = routes.indexOf('app.use("/api", optionalAuth);');
    const redact = routes.indexOf("redactPartnerSecrets(body,");
    expect(auth).toBeGreaterThan(-1);
    expect(redact).toBeGreaterThan(auth);
    // Before any route is registered after the auth middleware.
    const between = routes.slice(auth, redact);
    expect(between).not.toMatch(/app\.(get|post|put|patch|delete)\(/);
  });

  it("decides ownership from the signed-in account only, never the development fallback", () => {
    const line = routes.slice(routes.indexOf("redactPartnerSecrets(body,"), routes.indexOf("redactPartnerSecrets(body,") + 120);
    expect(line).toContain("req.user?.claims?.sub || req.user?.id || null");
    expect(line).not.toContain("45788955");
  });
});
