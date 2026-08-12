import { describe, it, expect } from "vitest";
import {
  summariseTicketTypes,
  resolveEventCapacity,
  describeEventCapacity,
  formatInviteMoney,
} from "./inviteContext";

// A venue invited to take 40% of ticket sales could not tell what 40% was worth:
// the invite carried the percentage and nothing else.

describe("invite context", () => {
  it("lists each ticket type at the price an attendee pays", () => {
    const lines = summariseTicketTypes(
      [
        { ticketName: "The Run & Coffee Pass", pricePerPerson: 10 },
        { ticketName: "The Run & Smoothie Pass", pricePerPerson: 12.5 },
      ],
      "eur",
    );

    expect(lines).toEqual([
      { name: "The Run & Coffee Pass", price: "€10.00" },
      { name: "The Run & Smoothie Pass", price: "€12.50" },
    ]);
  });

  it("prices free, pay-what-you-want and combi tickets honestly", () => {
    expect(summariseTicketTypes([{ ticketName: "RSVP", pricingMode: "free_rsvp", pricePerPerson: 20 }], "eur"))
      .toEqual([{ name: "RSVP", price: "Free" }]);

    expect(summariseTicketTypes([{ ticketName: "Support us", pricingMode: "pwyw", minPrice: 8 }], "eur"))
      .toEqual([{ name: "Support us", price: "From €8.00" }]);

    // The add-on is part of what each attendee pays, so it belongs in the price.
    expect(summariseTicketTypes(
      [{ ticketName: "Run", pricingMode: "combi", pricePerPerson: 10, addonPrice: 2.5, addonName: "Smoothie" }],
      "eur",
    )).toEqual([{ name: "Run (incl. Smoothie)", price: "€12.50" }]);
  });

  it("reads figures that arrive from the builder as strings", () => {
    expect(summariseTicketTypes([{ ticketName: "Day pass", pricePerPerson: "12.50" }], "eur"))
      .toEqual([{ name: "Day pass", price: "€12.50" }]);
  });

  it("names an unnamed ticket rather than showing a blank row", () => {
    expect(summariseTicketTypes([{ pricePerPerson: 15 }], "eur"))
      .toEqual([{ name: "Ticket 1", price: "€15.00" }]);
  });

  it("returns nothing when the event has no tickets yet", () => {
    expect(summariseTicketTypes(null, "eur")).toEqual([]);
    expect(summariseTicketTypes(undefined, "eur")).toEqual([]);
    expect(summariseTicketTypes([], "eur")).toEqual([]);
  });

  it("prices in the event's own currency", () => {
    expect(formatInviteMoney(10, "gbp")).toBe("£10.00");
    expect(formatInviteMoney(10, "usd")).toBe("$10.00");
    expect(formatInviteMoney(10, "chf")).toBe("CHF 10.00");
    expect(formatInviteMoney(1000, "jpy")).toBe("¥1000");
  });

  it("takes the capacity the creator set", () => {
    expect(resolveEventCapacity({ maxParticipants: 60 })).toBe(60);
    expect(resolveEventCapacity({ maxParticipants: "60" })).toBe(60);
  });

  it("falls back to the ticket capacities when no event capacity was set", () => {
    expect(resolveEventCapacity({
      maxParticipants: 0,
      ticketSkus: [{ ticketCapacity: 40 }, { ticketCapacity: 20 }],
    })).toBe(60);
  });

  it("reports no capacity rather than zero spots", () => {
    expect(resolveEventCapacity({})).toBeNull();
    expect(resolveEventCapacity(null)).toBeNull();
    expect(describeEventCapacity(null)).toBeNull();
    expect(describeEventCapacity(0)).toBeNull();
  });

  it("counts spots in plain English", () => {
    expect(describeEventCapacity(60)).toBe("60 spots");
    expect(describeEventCapacity(1)).toBe("1 spot");
  });
});
