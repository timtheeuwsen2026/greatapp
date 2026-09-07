import { describe, it, expect } from "vitest";
import { getSkuEntryPrice, summariseTicketRevenue } from "./ticketRevenue";

/**
 * V14 QA #4: "a $1,000 ticket with capacity 20 doesn't calculate."
 * Sep 2026 points 1 and 3: free tickets were entering venue deduction maths, and
 * add-on money was being counted as ticket revenue.
 *
 * The builder reads these values from text inputs, so strings and blanks are
 * normal, and a lone ticket with no capacity of its own covers the whole event.
 */

const gross = (skus: any[], maxParticipants: unknown = 0) =>
  summariseTicketRevenue(skus, maxParticipants).ticketGross;

describe("gross ticket revenue", () => {
  it("multiplies price by capacity — the reported case", () => {
    expect(gross([{ pricePerPerson: 1000, ticketCapacity: 20 }])).toBe(20000);
  });

  it("uses the event capacity when a lone ticket has none of its own", () => {
    expect(gross([{ pricePerPerson: 1000 }], 20)).toBe(20000);
  });

  it("handles values arriving from text inputs as strings", () => {
    expect(gross([{ pricePerPerson: "1000", ticketCapacity: "20" }])).toBe(20000);
    expect(gross([{ pricePerPerson: "1,000.50", ticketCapacity: "20" }])).toBe(20010);
  });

  it("adds several ticket types together", () => {
    expect(gross([
      { pricePerPerson: 1000, ticketCapacity: 20 },
      { pricePerPerson: 500, ticketCapacity: 10 },
    ])).toBe(25000);
  });

  it("prices a pay-what-you-want ticket at its suggested amount", () => {
    expect(gross([{ pricingMode: "pwyw", suggestedPrice: 30, minPrice: 10, ticketCapacity: 10 }])).toBe(300);
  });

  it("never returns NaN for blank or malformed input", () => {
    expect(gross([{ pricePerPerson: "", ticketCapacity: "" }], "")).toBe(0);
    expect(gross([{ pricePerPerson: undefined, ticketCapacity: null }])).toBe(0);
    expect(gross([])).toBe(0);
  });

  it("keeps large totals exact rather than drifting on floating point", () => {
    expect(gross([{ pricePerPerson: 1999.99, ticketCapacity: 300 }])).toBe(599997);
    expect(gross([{ pricePerPerson: 0.1, ticketCapacity: 3 }])).toBe(0.3);
  });

  it("a second ticket without capacity does not silently absorb the event total", () => {
    expect(gross([
      { pricePerPerson: 1000, ticketCapacity: 20 },
      { pricePerPerson: 500 },
    ], 20)).toBe(20000);
  });
});

describe("free tickets are attendance, never money", () => {
  it("contributes nothing to gross", () => {
    expect(gross([{ pricingMode: "free_rsvp", pricePerPerson: 100, ticketCapacity: 10 }])).toBe(0);
  });

  // The reported bug: 32 free + 32 paid had venue maths applied across all 64.
  it("keeps free seats out of the capacity a venue deal may charge for", () => {
    const summary = summariseTicketRevenue([
      { id: "free", pricingMode: "free_rsvp", pricePerPerson: 0, ticketCapacity: 32 },
      { id: "paid", pricingMode: "fixed", pricePerPerson: 5, ticketCapacity: 32 },
    ]);

    expect(summary.totalCapacity).toBe(64);
    expect(summary.paidCapacity).toBe(32);
    expect(summary.ticketGross).toBe(160);
    expect(summary.hasFreeTickets).toBe(true);

    // A €4 per-ticket deduction is €128 across the paid tickets, not €256.
    expect(summary.paidCapacity * 4).toBe(128);
  });

  it("reports no free tickets when every seat is paid", () => {
    expect(summariseTicketRevenue([
      { pricePerPerson: 5, ticketCapacity: 10 },
    ]).hasFreeTickets).toBe(false);
  });
});

describe("add-on money is separate from ticket money", () => {
  it("leaves the add-on out of the entry price a venue deal is calculated on", () => {
    expect(getSkuEntryPrice({ pricingMode: "combi", pricePerPerson: 100, addonPrice: 25 })).toBe(100);
  });

  it("reports add-on gross on its own, never inside ticket gross", () => {
    const summary = summariseTicketRevenue([
      { pricingMode: "combi", pricePerPerson: 100, addonPrice: 25, addonName: "Dinner", ticketCapacity: 10 },
    ]);

    expect(summary.ticketGross).toBe(1000);
    expect(summary.addOnGross).toBe(250);
    expect(summary.addOnCapacity).toBe(10);
  });

  // The run-club shape: free to turn up, and only the coffee carries money.
  it("counts a free entry with a paid add-on as no ticket revenue at all", () => {
    const summary = summariseTicketRevenue([
      { pricingMode: "combi", pricePerPerson: 0, addonPrice: 5.5, addonName: "Coffee", ticketCapacity: 32 },
    ]);

    expect(summary.ticketGross).toBe(0);
    expect(summary.paidCapacity).toBe(0);
    expect(summary.totalCapacity).toBe(32);
    expect(summary.addOnGross).toBe(176);
  });

  it("ignores an add-on that was never priced", () => {
    const summary = summariseTicketRevenue([
      { pricingMode: "combi", pricePerPerson: 10, addonPrice: 0, ticketCapacity: 5 },
    ]);

    expect(summary.addOnGross).toBe(0);
    expect(summary.addOnCapacity).toBe(0);
    expect(summary.ticketGross).toBe(50);
  });
});
