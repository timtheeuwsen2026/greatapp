import { describe, expect, it } from "vitest";
import {
  buildVenueDealHistory,
  describeBarterPayout,
  describeVenueDealTerms,
  euro,
  placeAfterVenueAccepted,
  readBarterTerms,
  venueDealAddons,
  venueDealRows,
} from "./venueDealCard";

// TEST 1 from Tim's 9 Nov run: €1.00 ticket, coffee €1.25 of which €1.00 is the venue's.
const coffeeTicket = {
  pricePerPerson: 1,
  addonEnabled: true,
  addonName: "Coffee",
  addonVenuePrice: 1,
  addonChargeAmount: 1.25,
};

describe("venueDealAddons", () => {
  it("lists what the venue is paid per add-on, whatever the ticket deal", () => {
    expect(venueDealAddons([coffeeTicket])).toEqual([
      { name: "Coffee", unitPrice: 1.25, venueAmount: 1, organiserMargin: 0.25 },
    ]);
  });

  it("lists a product once when two tickets offer it", () => {
    expect(venueDealAddons([coffeeTicket, { ...coffeeTicket, pricePerPerson: 0 }])).toHaveLength(1);
  });

  it("is empty without add-ons", () => {
    expect(venueDealAddons([{ pricePerPerson: 2 }])).toEqual([]);
    expect(venueDealAddons(null)).toEqual([]);
  });
});

describe("barter terms", () => {
  it("reads the organiser's words from the contract first, then the event", () => {
    expect(readBarterTerms({ barterTerms: "We bring 50 runners" }, { venueBarterTerms: "old" })).toBe("We bring 50 runners");
    expect(readBarterTerms({}, { venueBarterTerms: "  We bring 50 runners " })).toBe("We bring 50 runners");
  });

  it("ignores the 0 an old venue counter stored in place of text", () => {
    expect(readBarterTerms({ barterTerms: "0" }, { venueBarterTerms: "Free coffee" })).toBe("Free coffee");
  });

  it("says what a barter venue receives instead of €0.00 (57.3)", () => {
    expect(describeBarterPayout(venueDealAddons([coffeeTicket]))).toBe("Tickets €0.00, add-ons €1.00 per Coffee (paid to you)");
    expect(describeBarterPayout([])).toBe("Tickets €0.00, no add-ons on this event");
  });
});

describe("venueDealRows", () => {
  it("puts the barter text and the add-on pay in the venue's mail, never the platform fee", () => {
    const rows = venueDealRows({
      model: "venue_barter",
      terms: {},
      barterTerms: "We bring 50 runners, could you make us a deal",
      addons: venueDealAddons([coffeeTicket]),
      price: 1,
      capacity: 5,
      minimumGroup: null,
    });
    expect(rows).toContainEqual({ label: "What the organiser proposes", value: "We bring 50 runners, could you make us a deal" });
    expect(rows).toContainEqual({ label: "The venue receives", value: "Tickets €0.00, add-ons €1.00 per Coffee (paid to you)" });
    expect(rows).toContainEqual({ label: "Tickets", value: "5 spots, €1.00 per person" });
    expect(JSON.stringify(rows)).not.toMatch(/platform|15%|\$/i);
  });

  it("counts a per-ticket deal over every spot (66.3: €0.50 x 5 = €2.50)", () => {
    const rows = venueDealRows({ model: "fixed_fee", terms: { fixedFee: 0.5 }, addons: [], price: 2, capacity: 5, minimumGroup: 3 });
    expect(rows).toContainEqual({ label: "Venue payout if sold out", value: "€2.50 for tickets" });
    expect(rows).toContainEqual({ label: "Minimum group", value: "3 people, otherwise everyone is refunded and the deal ends" });
  });
});

describe("describeVenueDealTerms", () => {
  it("writes amounts as €0.50, never EUR 0.5", () => {
    expect(describeVenueDealTerms("fixed_fee", { fixedFee: 0.5 })).toBe("Per ticket: the venue gets €0.50 for every ticket sold");
    expect(describeVenueDealTerms("revenue_share", { revenueSharePct: 20 })).toBe("Revenue split: the venue gets 20% of ticket sales");
  });

  it("formats euro with the sign in front", () => {
    expect(euro(2)).toBe("€2.00");
    expect(euro("x")).toBe("€0.00");
  });
});

describe("buildVenueDealHistory", () => {
  it("starts with the organiser's own text, then each counter with its message", () => {
    const history = buildVenueDealHistory({
      experience: { venueCompensationModel: "venue_barter", venueBarterTerms: "We bring 50 runners" },
      contract: { venueId: "v1", status: "accepted", model: "fixed_fee", terms: { fixedFee: 0.5 }, createdAt: "2026-11-09T10:00:00Z", acceptedAt: "2026-11-09T12:00:00Z" },
      counters: [
        { venueId: "v1", model: "fixed_fee", terms: { fixedFee: 0.5 }, message: "We prefer 50 cents a ticket", createdAt: "2026-11-09T11:00:00Z" },
        { venueId: "other", model: "fixed_fee", terms: {}, message: "not this venue", createdAt: "2026-11-09T11:30:00Z" },
      ],
    });
    expect(history.map((entry) => entry.kind)).toEqual(["proposal", "counter", "accepted"]);
    expect(history[0]).toMatchObject({ by: "organiser", model: "venue_barter", message: "We bring 50 runners" });
    expect(history[1]).toMatchObject({ by: "venue", message: "We prefer 50 cents a ticket" });
  });

  it("credits a decline of a counter to the organiser", () => {
    const history = buildVenueDealHistory({
      contract: { venueId: "v1", status: "declined", model: "fixed_fee", declineReason: "Creator declined venue counter offer" },
    });
    expect(history.at(-1)).toMatchObject({ kind: "declined", by: "organiser" });
  });
});

describe("placeAfterVenueAccepted (66.32c, 66.34k)", () => {
  const venue = { name: "Test Venue", location: "Carrer de Test 1, 08001 Barcelona", city: "Barcelona" };

  it("puts the venue's name and address on an event that only had a city", () => {
    expect(placeAfterVenueAccepted({ venue: "", location: "Barcelona", city: "Barcelona" }, venue))
      .toEqual({ venue: "Test Venue", location: "Carrer de Test 1, 08001 Barcelona" });
  });

  it("never overwrites an address the organiser typed", () => {
    expect(placeAfterVenueAccepted({ venue: "", location: "Passeig de Gràcia 5, Barcelona", city: "Barcelona" }, venue))
      .toEqual({ venue: "Test Venue" });
  });

  it("changes nothing when both are already there", () => {
    expect(placeAfterVenueAccepted({ venue: "Test Venue", location: venue.location, city: "Barcelona" }, venue)).toEqual({});
  });
});
