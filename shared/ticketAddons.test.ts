import { describe, expect, it } from "vitest";
import {
  buildBookingAddonRecord,
  calculateAddonTotal,
  calculateBookingTotal,
  clampAddonQuantity,
  getRemainingAddonStock,
  getTicketAddon,
  hasTicketAddon,
} from "./ticketAddons";

// A ticket saved before the modular toggle: the Combi-Ticket format carried the
// same meaning, so it still reads as an add-on.
const combi = { pricingMode: "combi", addonName: "Coffee + Medialuna", addonPrice: 5.5 };

describe("reading an add-on off a ticket", () => {
  it("still reads a legacy Combi-Ticket, treating the whole price as the venue's", () => {
    expect(getTicketAddon(combi)).toEqual({
      name: "Coffee + Medialuna",
      unitPrice: 5.5,
      venueAmount: 5.5,
      creatorAmount: 0,
    });
    expect(getTicketAddon({ pricingMode: "combi", addonName: "Coffee", addonPrice: 0 })).toBeNull();
    expect(getTicketAddon(null)).toBeNull();
  });

  it("names an unnamed add-on rather than showing the buyer a blank line", () => {
    expect(getTicketAddon({ pricingMode: "combi", addonPrice: "3" })?.name).toBe("Add-on");
  });
});

describe("the add-on attaches to any ticket type", () => {
  // It used to be a ticket *format*, which meant a separate format for every
  // combination — paid + add-on, pay-what-you-want + add-on, and so on.
  it("works on a paid ticket, a free RSVP and pay-what-you-want alike", () => {
    for (const pricingMode of ["fixed", "free_rsvp", "pwyw"]) {
      expect(hasTicketAddon({
        pricingMode,
        addonEnabled: true,
        addonName: "Coffee",
        addonVenuePrice: 5,
        addonMargin: 1.5,
      })).toBe(true);
    }
  });

  it("offers nothing when the toggle is off, whatever prices are left behind", () => {
    expect(getTicketAddon({
      pricingMode: "fixed",
      addonEnabled: false,
      addonName: "Coffee",
      addonVenuePrice: 5,
      addonMargin: 1.5,
    })).toBeNull();
    // An explicit false beats the legacy combi reading.
    expect(getTicketAddon({ ...combi, addonEnabled: false })).toBeNull();
  });
});

describe("the organiser's margin is a flat amount, never a percentage", () => {
  // Venue prices are usually already a discounted collab rate — a €5 coffee and
  // medialuna that is €6.50 at the counter — so a percentage would cut into a
  // margin the venue deliberately made thin.
  const modular = {
    pricingMode: "free_rsvp",
    addonEnabled: true,
    addonName: "Coffee + Medialuna",
    addonVenuePrice: 5,
    addonMargin: 1.5,
  };

  it("adds the margin on top and says who keeps what", () => {
    expect(getTicketAddon(modular)).toEqual({
      name: "Coffee + Medialuna",
      unitPrice: 6.5,
      venueAmount: 5,
      creatorAmount: 1.5,
    });
  });

  it("passes the venue's price straight through when the organiser takes nothing", () => {
    expect(getTicketAddon({ ...modular, addonMargin: 0 })).toEqual({
      name: "Coffee + Medialuna",
      unitPrice: 5,
      venueAmount: 5,
      creatorAmount: 0,
    });
  });

  it("keeps the split exact rather than drifting on floating point", () => {
    const addon = getTicketAddon({ ...modular, addonVenuePrice: 4.35, addonMargin: 1.15 });
    expect(addon?.unitPrice).toBe(5.5);
    expect(addon!.venueAmount + addon!.creatorAmount).toBe(5.5);
  });
});

describe("add-on stock is counted apart from attendance", () => {
  const stocked = {
    pricingMode: "free_rsvp",
    addonEnabled: true,
    addonName: "Coffee",
    addonVenuePrice: 5,
    addonInventory: 32,
  };

  it("caps at the stock the organiser set, not at how many are coming", () => {
    // 32 combos at an event 80 people may attend.
    expect(clampAddonQuantity(40, 40, stocked, 0)).toBe(32);
    expect(clampAddonQuantity(10, 10, stocked, 0)).toBe(10);
  });

  it("counts what has already been sold against the cap", () => {
    expect(clampAddonQuantity(5, 5, stocked, 30)).toBe(2);
    expect(clampAddonQuantity(5, 5, stocked, 32)).toBe(0);
    expect(clampAddonQuantity(5, 5, stocked, 99)).toBe(0);
  });

  it("reports what is left, or nothing when no cap was set", () => {
    expect(getRemainingAddonStock(stocked, 30)).toBe(2);
    expect(getRemainingAddonStock(stocked, 0)).toBe(32);
    expect(getRemainingAddonStock({ ...stocked, addonInventory: 0 })).toBeNull();
    expect(getRemainingAddonStock(combi)).toBeNull();
  });
});

describe("how many add-ons a booking may carry", () => {
  it("caps the count at one per attendee", () => {
    expect(clampAddonQuantity(5, 2, combi)).toBe(2);
    expect(clampAddonQuantity(2, 2, combi)).toBe(2);
    expect(clampAddonQuantity(1, 2, combi)).toBe(1);
  });

  it("treats anything that is not a whole positive count as declining the add-on", () => {
    expect(clampAddonQuantity(0, 2, combi)).toBe(0);
    expect(clampAddonQuantity(-1, 2, combi)).toBe(0);
    expect(clampAddonQuantity(1.5, 2, combi)).toBe(0);
    expect(clampAddonQuantity("yes", 2, combi)).toBe(0);
    expect(clampAddonQuantity(undefined, 2, combi)).toBe(0);
  });

  it("refuses to attach an add-on to a ticket that offers none", () => {
    expect(clampAddonQuantity(3, 3, { pricingMode: "free_rsvp" })).toBe(0);
    expect(clampAddonQuantity(3, 3, { pricingMode: "combi", addonPrice: 0 })).toBe(0);
  });
});

describe("pricing a booking that carries an add-on", () => {
  it("charges a free RSVP nothing but still charges for the add-on", () => {
    expect(
      calculateBookingTotal({ unitPrice: 0, ticketQuantity: 1, addonUnitPrice: 5.5, addonQuantity: 1 }),
    ).toEqual({ ticketTotal: 0, addonTotal: 5.5, fullPrice: 5.5 });
  });

  it("leaves a declined add-on out of the total", () => {
    expect(
      calculateBookingTotal({ unitPrice: 0, ticketQuantity: 1, addonUnitPrice: 5.5, addonQuantity: 0 }),
    ).toEqual({ ticketTotal: 0, addonTotal: 0, fullPrice: 0 });
  });

  it("adds the add-on on top of a paid ticket", () => {
    expect(
      calculateBookingTotal({ unitPrice: 12, ticketQuantity: 2, addonUnitPrice: 5.5, addonQuantity: 2 }),
    ).toEqual({ ticketTotal: 24, addonTotal: 11, fullPrice: 35 });
  });

  it("rounds to whole cents so the intent and the confirmation cannot drift", () => {
    // 0.1 + 0.2 arithmetic on a three-ticket order must still land on a payable
    // amount — Stripe rejects a confirmation whose total drifts from the intent.
    expect(calculateAddonTotal(5.55, 3)).toBe(16.65);
    expect(calculateBookingTotal({
      unitPrice: 1.1,
      ticketQuantity: 3,
      addonUnitPrice: 2.2,
      addonQuantity: 3,
    })).toEqual({ ticketTotal: 3.3, addonTotal: 6.6, fullPrice: 9.9 });
  });
});

describe("what gets written onto the booking", () => {
  it("copies the name and price the buyer actually agreed to", () => {
    expect(buildBookingAddonRecord(getTicketAddon(combi), 2)).toEqual({
      addonName: "Coffee + Medialuna",
      addonUnitPrice: "5.50",
      addonQuantity: 2,
      addonTotal: "11.00",
    });
  });

  it("writes a blank record when the buyer declined", () => {
    expect(buildBookingAddonRecord(getTicketAddon(combi), 0)).toEqual({
      addonName: null,
      addonUnitPrice: "0.00",
      addonQuantity: 0,
      addonTotal: "0.00",
    });
    expect(hasTicketAddon({ pricingMode: "fixed" })).toBe(false);
  });
});
