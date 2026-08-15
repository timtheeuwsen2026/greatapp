import { describe, expect, it } from "vitest";
import { hasDisplayableDiscoveryPrice, resolveDiscoveryPricing } from "./discoveryPricing";

describe("homepage discovery pricing", () => {
  it("keeps a Free RSVP ticket visible at zero", () => {
    expect(resolveDiscoveryPricing(
      [{ pricePerPerson: 0, depositPerPerson: 0 }],
      0,
      0,
    )).toEqual({ price: 0, depositAmount: null });
    expect(hasDisplayableDiscoveryPrice(0)).toBe(true);
  });

  it("uses the lowest valid ticket price, including zero", () => {
    expect(resolveDiscoveryPricing(
      [{ pricePerPerson: 15 }, { pricePerPerson: 0 }, { pricePerPerson: 8 }],
      20,
      null,
    ).price).toBe(0);
  });

  it.each([null, undefined, "", "not-a-price", -1])(
    "keeps a missing or invalid price out of discovery: %s",
    (price) => {
      expect(hasDisplayableDiscoveryPrice(price)).toBe(false);
    },
  );
});
