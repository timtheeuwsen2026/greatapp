import { describe, expect, it } from "vitest";
import {
  discountAmountForUnitPrice,
  discountLinkUrl,
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
