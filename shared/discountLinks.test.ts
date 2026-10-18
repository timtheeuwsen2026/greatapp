import { describe, expect, it } from "vitest";
import {
  discountAmountForUnitPrice,
  discountBannerText,
  discountLinkUrl,
  discountSpotsLeft,
  discountedUnitPrice,
  formatDiscount,
  resolveDiscountLink,
} from "./discountLinks";

const link = {
  id: "link-1",
  experienceId: "exp-1",
  discountId: "d1",
  token: "abc123",
  active: true,
  redemptionCount: 0,
  maxRedemptions: null,
};

const percentage = { id: "d1", type: "percentage", value: 20, active: true };
const fixed = { id: "d1", type: "fixed", value: 5, active: true };

describe("discount arithmetic", () => {
  it("takes a percentage off the ticket", () => {
    expect(discountAmountForUnitPrice(percentage, 25)).toBe(5);
    expect(discountedUnitPrice(percentage, 25)).toBe(20);
  });

  it("takes a fixed amount off the ticket", () => {
    expect(discountAmountForUnitPrice(fixed, 25)).toBe(5);
    expect(discountedUnitPrice(fixed, 25)).toBe(20);
  });

  it("never takes more off than the ticket costs", () => {
    expect(discountAmountForUnitPrice({ id: "d1", type: "fixed", value: 20 }, 15)).toBe(15);
    expect(discountedUnitPrice({ id: "d1", type: "fixed", value: 20 }, 15)).toBe(0);
  });

  it("caps a percentage at 100", () => {
    expect(discountedUnitPrice({ id: "d1", type: "percentage", value: 150 }, 30)).toBe(0);
  });

  it("leaves a free ticket alone", () => {
    expect(discountAmountForUnitPrice(percentage, 0)).toBe(0);
    expect(discountedUnitPrice(percentage, 0)).toBe(0);
  });

  it("is zero for a missing or valueless discount", () => {
    expect(discountAmountForUnitPrice(null, 25)).toBe(0);
    expect(discountAmountForUnitPrice({ id: "d1", type: "fixed", value: 0 }, 25)).toBe(0);
  });

  it("rounds to the currency's minor unit", () => {
    expect(discountAmountForUnitPrice({ id: "d1", type: "percentage", value: 33 }, 10)).toBe(3.3);
    expect(discountAmountForUnitPrice({ id: "d1", type: "percentage", value: 15 }, 9.99)).toBe(1.5);
  });
});

describe("resolveDiscountLink", () => {
  it("resolves a live link", () => {
    const result = resolveDiscountLink({ link, discounts: [percentage] });
    expect(result.ok).toBe(true);
    expect(result.discount?.id).toBe("d1");
  });

  it("refuses an unknown token", () => {
    expect(resolveDiscountLink({ link: null, discounts: [percentage] }).ok).toBe(false);
  });

  it("refuses a withdrawn link, and says so", () => {
    const result = resolveDiscountLink({
      link: { ...link, active: false },
      discounts: [percentage],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/withdrawn/i);
  });

  it("refuses once the cap is reached", () => {
    const result = resolveDiscountLink({
      link: { ...link, maxRedemptions: 5, redemptionCount: 5 },
      discounts: [percentage],
    });
    expect(result.reason).toMatch(/fully claimed/i);
  });

  it("allows the last redemption under the cap", () => {
    expect(
      resolveDiscountLink({
        link: { ...link, maxRedemptions: 5, redemptionCount: 4 },
        discounts: [percentage],
      }).ok,
    ).toBe(true);
  });

  it("refuses an expired discount", () => {
    const result = resolveDiscountLink({
      link,
      discounts: [{ ...percentage, validUntil: "2020-01-01" }],
      now: new Date("2026-09-13"),
    });
    expect(result.reason).toMatch(/expired/i);
  });

  it("refuses a discount switched off by the organiser", () => {
    expect(
      resolveDiscountLink({ link, discounts: [{ ...percentage, active: false }] }).reason,
    ).toMatch(/no longer running/i);
  });

  it("refuses a link used on the wrong ticket type, naming the reason", () => {
    const result = resolveDiscountLink({
      link,
      discounts: [{ ...percentage, skuId: "sku-vip" }],
      ticketSkuId: "sku-standard",
    });
    expect(result.reason).toMatch(/different ticket type/i);
  });

  it("still resolves before a ticket has been chosen", () => {
    expect(
      resolveDiscountLink({ link, discounts: [{ ...percentage, skuId: "sku-vip" }] }).ok,
    ).toBe(true);
  });

  it("refuses when the discount behind the link has been deleted", () => {
    expect(resolveDiscountLink({ link, discounts: [] }).reason).toMatch(/no longer exists/i);
  });
});

describe("presentation", () => {
  it("formats both kinds", () => {
    expect(formatDiscount(percentage)).toBe("20% off");
    expect(formatDiscount(fixed)).toBe("€5.00 off");
    expect(formatDiscount(fixed, "$")).toBe("$5.00 off");
    expect(formatDiscount(null)).toBe("");
  });

  it("builds a shareable URL", () => {
    expect(discountLinkUrl("https://great.example/", "sunrise-yoga", "abc123")).toBe(
      "https://great.example/experiences/sunrise-yoga?discount=abc123",
    );
  });
});

// ── The numbers from the real complaint: €35 tickets, a 100% and a 75% link ──

describe("a €35 ticket with the links that were reported broken", () => {
  const free = { id: "d1", type: "percentage", value: 100, active: true };
  const threeQuarters = { id: "d1", type: "percentage", value: 75, active: true };

  it("is free at 100% and €8.75 at 75%", () => {
    expect(discountedUnitPrice(free, 35)).toBe(0);
    expect(discountAmountForUnitPrice(free, 35)).toBe(35);
    expect(discountedUnitPrice(threeQuarters, 35)).toBe(8.75);
    expect(discountAmountForUnitPrice(threeQuarters, 35)).toBe(26.25);
  });

  it("applies to every ticket when it is tied to none", () => {
    const resolved = (ticketSkuId: string) =>
      resolveDiscountLink({ link, discounts: [{ ...free, skuId: undefined }], ticketSkuId });
    expect(resolved("sku-early").ok).toBe(true);
    expect(resolved("sku-general").ok).toBe(true);
  });

  it("applies to only the ticket it is tied to, and says so for the others", () => {
    const tied = [{ ...free, skuId: "sku-early" }];
    expect(resolveDiscountLink({ link, discounts: tied, ticketSkuId: "sku-early" }).ok).toBe(true);
    const other = resolveDiscountLink({ link, discounts: tied, ticketSkuId: "sku-general" });
    expect(other.ok).toBe(false);
    expect(other.reason).toMatch(/different ticket type/);
  });
});

// ── A link meant for five people is five places, not five bookings ──

describe("a link with a limited number of places", () => {
  const limited = (redemptionCount: number, maxRedemptions: number | null = 5) => ({
    ...link, maxRedemptions, redemptionCount,
  });
  const resolve = (redemptionCount: number, ticketQuantity: number, max: number | null = 5) =>
    resolveDiscountLink({ link: limited(redemptionCount, max), discounts: [percentage], ticketQuantity });

  it("counts the places left", () => {
    expect(discountSpotsLeft(limited(0))).toBe(5);
    expect(discountSpotsLeft(limited(3))).toBe(2);
    expect(discountSpotsLeft(limited(5))).toBe(0);
    expect(discountSpotsLeft(limited(9))).toBe(0);
  });

  it("has no limit when none was set", () => {
    for (const none of [null, 0, undefined]) {
      expect(discountSpotsLeft({ maxRedemptions: none as any, redemptionCount: 4 })).toBeNull();
    }
    expect(resolve(100, 50, null).ok).toBe(true);
  });

  it("lets a buyer take up to the places left", () => {
    expect(resolve(0, 5).ok).toBe(true);
    expect(resolve(3, 2).ok).toBe(true);
  });

  it("refuses one booking that wants more places than are left", () => {
    // The hole: one person buying 10 tickets on a link meant for 5 people.
    const tooMany = resolve(0, 10);
    expect(tooMany.ok).toBe(false);
    expect(tooMany.reason).toMatch(/Only 5 places are left/);
    expect(tooMany.reason).toMatch(/up to 5 tickets/);
  });

  it("speaks in the singular for the last place", () => {
    const last = resolve(4, 2);
    expect(last.ok).toBe(false);
    expect(last.reason).toMatch(/Only 1 place is left/);
    expect(last.reason).toMatch(/Choose 1 ticket/);
  });

  it("says it is fully claimed once nothing is left", () => {
    expect(resolve(5, 1).reason).toMatch(/fully claimed/);
    expect(resolve(7, 1).reason).toMatch(/fully claimed/);
  });

  it("treats a missing or nonsense quantity as one ticket", () => {
    expect(resolveDiscountLink({ link: limited(4), discounts: [percentage] }).ok).toBe(true);
    expect(resolveDiscountLink({ link: limited(4), discounts: [percentage], ticketQuantity: 0 }).ok).toBe(true);
    expect(resolveDiscountLink({ link: limited(4), discounts: [percentage], ticketQuantity: NaN as any }).ok).toBe(true);
  });
});

describe("what the event page says about a link that works", () => {
  it("names the ticket a tied link is for", () => {
    expect(discountBannerText({ summary: "100% off", skuId: "sku-early", ticketName: "Early bird" })).toBe(
      "Your discount link is applied — 100% off on Early bird tickets at checkout.",
    );
  });

  it("still warns when the ticket's name cannot be found", () => {
    expect(discountBannerText({ summary: "75% off", skuId: "gone" })).toMatch(/one ticket type only/);
  });

  it("says nothing about a ticket for a link that works on all of them", () => {
    expect(discountBannerText({ summary: "20% off", skuId: null })).toBe(
      "Your discount link is applied — 20% off at checkout.",
    );
  });

  it("says how many places are left on a limited link", () => {
    expect(discountBannerText({ summary: "100% off", spotsLeft: 3 })).toMatch(/3 places are left on this link\.$/);
    expect(discountBannerText({ summary: "100% off", spotsLeft: 1 })).toMatch(/1 place is left on this link\.$/);
  });

  it("falls back to a plain sentence with no summary", () => {
    expect(discountBannerText({})).toBe("Your discount link is applied — a discount at checkout.");
  });
});
