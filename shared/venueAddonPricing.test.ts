import { describe, it, expect } from "vitest";
import {
  MAX_ADDON_DISCOUNT_PCT,
  discountedVenuePrice,
  normalizeAddonDiscountPct,
  priceAddonFromCatalog,
  syncSkuAddonsWithCatalog,
} from "./venueAddonPricing";
import { getTicketAddon } from "./ticketAddons";
import { addonItemsFromMetadata, addonMetadata, getTicketAddons, quoteAddonChoices, venuePricedAddonCents } from "./addonChoices";
import { bookingPlatformFeeCents } from "./platformFees";
import { summariseTicketRevenue } from "./ticketRevenue";
import { calculateEventEconomics } from "./eventEconomics";
import { validateExperienceVenueDeal } from "./venueDealModels";
import { summarizeCreatorEarnings } from "../server/creatorEarnings";

// What the builder writes when an organiser ticks a product on the venue's list.
const picked = (item: { id: string; venuePrice: number; discountPct?: number }) =>
  priceAddonFromCatalog({
    id: item.id,
    addonName: "Coffee",
    addonVenuePrice: item.venuePrice,
    addonChargeAmount: item.venuePrice,
    addonDiscountPct: normalizeAddonDiscountPct(item.discountPct),
    addonMarkup: 0,
  }, item);

describe("the venue's discount", () => {
  it("is a percentage off the counter price", () => {
    expect(discountedVenuePrice(6.5, 20)).toBe(5.2);
    expect(discountedVenuePrice(7.45, 10)).toBe(6.71);
    expect(discountedVenuePrice(6.5, 0)).toBe(6.5);
    expect(discountedVenuePrice(6.5, undefined)).toBe(6.5);
  });

  it("stops short of giving the product away", () => {
    // A free add-on reads as no add-on, which would take it off the ticket.
    expect(normalizeAddonDiscountPct(100)).toBe(MAX_ADDON_DISCOUNT_PCT);
    expect(normalizeAddonDiscountPct(-5)).toBe(0);
    expect(normalizeAddonDiscountPct("abc")).toBe(0);
    expect(discountedVenuePrice(0.05, 99)).toBe(0.01);
  });
});

describe("an add-on picked from the venue's list", () => {
  it("charges the participant the discounted price, and pays the venue that", () => {
    const coffee = picked({ id: "coffee", venuePrice: 6.5, discountPct: 20 });

    expect(coffee).toMatchObject({
      addonVenuePrice: 6.5, addonDiscountPct: 20, addonGroupRate: 5.2, addonMarkup: 0, addonChargeAmount: 5.2,
    });
    expect(getTicketAddon({ ...coffee, addonEnabled: true })).toMatchObject({
      unitPrice: 5.2, venueAmount: 5.2, creatorAmount: 0, venuePrice: 6.5, aboveCounterPrice: false,
    });
  });

  it("charges the counter price where the venue offers no discount", () => {
    expect(picked({ id: "coffee", venuePrice: 6.5 })).toMatchObject({
      addonDiscountPct: 0, addonGroupRate: 6.5, addonChargeAmount: 6.5,
    });
  });

  it("adds the organiser's markup on top of the discounted price", () => {
    const coffee = priceAddonFromCatalog(
      { ...picked({ id: "coffee", venuePrice: 6.5, discountPct: 20 }), addonMarkup: 0.8 },
      { id: "coffee", venuePrice: 6.5, discountPct: 20 },
    );

    expect(coffee.addonChargeAmount).toBe(6);
    expect(getTicketAddon({ ...coffee, addonEnabled: true })).toMatchObject({
      unitPrice: 6, venueAmount: 5.2, creatorAmount: 0.8,
    });
  });

  it("never charges more than the venue's own counter", () => {
    const coffee = priceAddonFromCatalog(
      { ...picked({ id: "coffee", venuePrice: 6.5, discountPct: 20 }), addonMarkup: 3 },
      { id: "coffee", venuePrice: 6.5, discountPct: 20 },
    );

    expect(coffee.addonChargeAmount).toBe(6.5);
    // The markup is kept as chosen, so it has room again if the discount grows.
    expect(coffee.addonMarkup).toBe(3);
    expect(getTicketAddon({ ...coffee, addonEnabled: true })?.aboveCounterPrice).toBe(false);
  });
});

describe("when the venue changes its catalog", () => {
  const event = [{
    id: "rsvp",
    addonEnabled: true,
    addons: [
      { ...picked({ id: "coffee", venuePrice: 6.5, discountPct: 20 }), addonMarkup: 0.5, addonChargeAmount: 5.7, addonInventory: 30 },
      { id: "gone", addonName: "Old special", addonVenuePrice: 4, addonChargeAmount: 4 },
    ],
  }];

  it("follows a new retail price, which a typed group rate never did", () => {
    const { skus, changed } = syncSkuAddonsWithCatalog(event, [{ id: "coffee", venuePrice: 7, discountPct: 20 }]);

    expect(changed).toBe(true);
    expect(skus[0].addons[0]).toMatchObject({
      addonVenuePrice: 7, addonGroupRate: 5.6, addonMarkup: 0.5, addonChargeAmount: 6.1, addonInventory: 30,
    });
    // And checkout, which reads the ticket, now quotes the new price.
    expect(quoteAddonChoices(skus[0], [{ id: "coffee", quantity: 1 }], 1)[0])
      .toMatchObject({ unitPrice: 6.1, venueAmount: 5.6 });
  });

  it("follows a new discount", () => {
    const { skus } = syncSkuAddonsWithCatalog(event, [{ id: "coffee", venuePrice: 6.5, discountPct: 0 }]);

    // The discount is withdrawn, so the markup no longer fits under the counter price.
    expect(skus[0].addons[0]).toMatchObject({
      addonDiscountPct: 0, addonGroupRate: 6.5, addonChargeAmount: 6.5, addonMarkup: 0.5,
    });
  });

  it("leaves a product the venue no longer lists exactly as it was", () => {
    const { skus } = syncSkuAddonsWithCatalog(event, [{ id: "coffee", venuePrice: 7, discountPct: 20 }]);
    expect(skus[0].addons[1]).toBe(event[0].addons[1]);
  });

  it("reports no change, and returns the same tickets, when nothing moved", () => {
    const result = syncSkuAddonsWithCatalog(event, [{ id: "coffee", venuePrice: 6.5, discountPct: 20 }]);
    expect(result.changed).toBe(false);
    expect(result.skus).toBe(event);

    expect(syncSkuAddonsWithCatalog(event, []).changed).toBe(false);
    expect(syncSkuAddonsWithCatalog(null, [{ id: "coffee", venuePrice: 7 }])).toEqual({ skus: [], changed: false });
  });
});

describe("an add-on saved before venues set their own discount", () => {
  // The organiser typed the venue's cost and the participant's price by hand.
  const agreed = { id: "latte", addonName: "Latte + loaf", addonVenuePrice: 7.45, addonGroupRate: 6, addonChargeAmount: 7 };
  const tickets = [{ id: "rsvp", addonEnabled: true, addons: [agreed] }];

  it("does not change price on a selling event until the venue sets a discount", () => {
    const untouched = syncSkuAddonsWithCatalog(tickets, [{ id: "latte", venuePrice: 7.45, discountPct: 0 }]);
    expect(untouched.changed).toBe(false);

    // Not even when the retail price moves: the typed amounts were the deal.
    expect(syncSkuAddonsWithCatalog(tickets, [{ id: "latte", venuePrice: 8 }]).changed).toBe(false);
    expect(getTicketAddons(tickets[0])[0]).toMatchObject({ unitPrice: 7, venueAmount: 6 });
  });

  it("moves onto the venue's discount once there is one, keeping the organiser's margin", () => {
    const { skus, changed } = syncSkuAddonsWithCatalog(tickets, [{ id: "latte", venuePrice: 7.45, discountPct: 20 }]);

    expect(changed).toBe(true);
    expect(skus[0].addons[0]).toMatchObject({
      addonDiscountPct: 20, addonGroupRate: 5.96, addonMarkup: 1, addonChargeAmount: 6.96,
    });
  });

  it("keeps the agreed cost when only the organiser's markup is changed", () => {
    const repriced = priceAddonFromCatalog({ ...agreed, addonMarkup: 0.5 }, { id: "latte", venuePrice: 7.45, discountPct: 0 });

    expect(repriced).toMatchObject({ addonGroupRate: 6, addonMarkup: 0.5, addonChargeAmount: 6.5 });
    expect(repriced.addonDiscountPct).toBeUndefined();
  });

  it("follows the counter price from then on where no cost had been agreed", () => {
    const atCounterPrice = { id: "matcha", addonName: "Matcha + loaf", addonVenuePrice: 7.75, addonChargeAmount: 7.75 };
    const repriced = priceAddonFromCatalog({ ...atCounterPrice, addonMarkup: 0 }, { id: "matcha", venuePrice: 8 });

    expect(repriced).toMatchObject({ addonDiscountPct: 0, addonVenuePrice: 8, addonGroupRate: 8, addonChargeAmount: 8 });
  });
});

// ── Who is paid what on a sale priced from the venue's discount ─────────────
describe("the division of a sale priced from the venue's discount", () => {
  // Retail 7.75, the venue's discount 20% (6.20), the organiser's markup 1.55.
  const catalog = [{ id: "coffee", venuePrice: 7.75, discountPct: 20 }];
  const ticket = {
    id: "rsvp", pricingMode: "free_rsvp", pricePerPerson: 0, ticketCapacity: 10, addonEnabled: true,
    addons: [priceAddonFromCatalog({ ...picked(catalog[0]), addonMarkup: 1.55 }, catalog[0])],
  };

  it("records the markup on the booking line, so the division is fixed at purchase", () => {
    const [line] = quoteAddonChoices(ticket, [{ id: "coffee", quantity: 2 }], 2);
    expect(line).toMatchObject({ unitPrice: 7.75, venueAmount: 6.2, markup: 1.55, total: 15.5 });
    expect(venuePricedAddonCents([line])).toEqual({ gross: 1550, venue: 1240, markup: 310 });
    // And it survives the trip through the payment's metadata.
    expect(addonItemsFromMetadata(addonMetadata([line]))).toEqual([line]);
  });

  it("records no markup on an add-on the organiser priced by hand", () => {
    const byHand = { id: "rsvp", addonEnabled: true,
      addons: [{ id: "latte", addonName: "Latte", addonVenuePrice: 7.45, addonGroupRate: 6, addonChargeAmount: 7 }] };
    const [line] = quoteAddonChoices(byHand, [{ id: "latte", quantity: 1 }], 1);
    expect(line.markup).toBeUndefined();
    expect(venuePricedAddonCents([line])).toEqual({ gross: 0, venue: 0, markup: 0 });
    // Nor on the single add-on typed into a ticket for a venue with no list:
    // the platform has no venue account to pay a discounted price to.
    const typed = { addonEnabled: true, addonName: "Coffee", addonVenuePrice: 5, addonDiscountPct: 20, addonGroupRate: 4, addonChargeAmount: 5 };
    expect(quoteAddonChoices(typed, undefined, 1, 1)[0].markup).toBeUndefined();
  });

  it("charges Great's fee on the markup only, never on the venue's price", () => {
    const [line] = quoteAddonChoices(ticket, [{ id: "coffee", quantity: 1 }], 1);
    const booking = { totalPrice: 7.75, amount: 7.75, addonTotal: 7.75, addonItems: [line],
      ticketPlatformFeePct: 15, addonPlatformFeePct: 15 };
    // 15% of 1.55, not 15% of 7.75.
    expect(bookingPlatformFeeCents(booking)).toBe(23);
    expect(bookingPlatformFeeCents({ ...booking, addonPlatformFeePct: 0 })).toBe(0);
    // No markup, no fee: the venue's discounted price is the whole sale.
    const atVenuePrice = quoteAddonChoices({ ...ticket, addons: [picked(catalog[0])] }, [{ id: "coffee", quantity: 1 }], 1);
    expect(bookingPlatformFeeCents({ totalPrice: 6.2, addonTotal: 6.2, addonItems: atVenuePrice,
      ticketPlatformFeePct: 15, addonPlatformFeePct: 15 })).toBe(0);
  });

  it("shows the organiser the same division while they set the event up, under any venue deal", () => {
    const summary = summariseTicketRevenue([{ ...ticket, ticketCapacity: 1 }]);
    expect(summary).toMatchObject({ addOnGross: 7.75, venuePricedAddOnVenueGross: 6.2, venuePricedAddOnCreatorGross: 1.55 });

    for (const [venueDealModel, venueDealValue] of [["revenue_share", 80], ["per_head", 3], ["venue_barter", 0]] as const) {
      const estimate = calculateEventEconomics({
        ticketGross: 0, paidTickets: 0, platformPct: 15, addonPlatformPct: 15, venueDealModel, venueDealValue,
        addOnVenueGross: summary.addOnVenueGross, addOnCreatorGross: summary.addOnCreatorGross,
        venuePricedAddOnVenueGross: summary.venuePricedAddOnVenueGross,
        venuePricedAddOnCreatorGross: summary.venuePricedAddOnCreatorGross,
      });
      // Venue 6.20 in full, Great 0.23 from the markup, organiser 1.32.
      expect(estimate).toMatchObject({ addOnVenueRevenue: 6.2, platformFee: 0.23, net: 1.32 });
    }
  });

  it("agrees with the organiser's earnings once the sale is real", () => {
    const [line] = quoteAddonChoices(ticket, [{ id: "coffee", quantity: 1 }], 1);
    const earnings = summarizeCreatorEarnings([{ status: "fully_paid", totalPrice: "7.75", amount: "7.75", addonTotal: "7.75",
      addonItems: [line], ticketPlatformFeePct: 15, addonPlatformFeePct: 15, ticketQuantity: 1,
      experience: { venueCompensationModel: "revenue_share", venueRevenuePercentage: 80 } }], { defaultPlatformFeePct: 15 });
    expect(earnings.summary).toMatchObject({ totalPlatformFees: 0.23, totalSpaceShare: 6.2, totalEarnings: 1.32 });
  });

  it("does not let a large revenue share block an event whose add-ons the venue discounted", () => {
    const event = { venueType: "catalog", selectedVenueId: "venue", venueCompensationModel: "revenue_share",
      venueRevenueSharePct: 90, ticketPlatformFeePct: 15, addonPlatformFeePct: 15, ticketSkus: [ticket] };
    expect(validateExperienceVenueDeal(event)).toEqual([]);
  });
});
