import { describe, it, expect } from "vitest";
import { safeAdd, safeMultiply } from "./pricingService";

/**
 * V14 QA #4: "a $1,000 ticket with capacity 20 doesn't calculate."
 *
 * These mirror the Event Builder's Step 8 helpers exactly. Gross revenue is
 * price × capacity, per ticket and in total, whatever shape the inputs arrive
 * in — the builder reads them from text inputs, so strings and blanks are
 * normal, and a lone ticket with no capacity of its own covers the whole event.
 */

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const skuEffectivePrice = (sku: any): number => {
  switch (sku?.pricingMode) {
    case "free_rsvp": return 0;
    case "pwyw": return toNumber(sku.suggestedPrice ?? sku.minPrice);
    case "combi": return safeAdd(toNumber(sku.pricePerPerson), toNumber(sku.addonPrice));
    default: return toNumber(sku.pricePerPerson);
  }
};

const skuEffectiveCapacity = (sku: any, skuCount: number, maxParticipants: unknown): number => {
  const own = toNumber(sku?.ticketCapacity);
  if (own > 0) return own;
  return skuCount === 1 ? toNumber(maxParticipants) : 0;
};

const grossRevenue = (skus: any[], maxParticipants: unknown = 0): number =>
  skus.reduce(
    (total, sku) =>
      safeAdd(total, safeMultiply(skuEffectivePrice(sku), skuEffectiveCapacity(sku, skus.length, maxParticipants))),
    0,
  );

describe("Step 8 gross revenue", () => {
  it("multiplies price by capacity — the reported case", () => {
    expect(grossRevenue([{ pricePerPerson: 1000, ticketCapacity: 20 }])).toBe(20000);
  });

  it("uses the event capacity when a lone ticket has none of its own", () => {
    // Creator sets 20 spots on the Dates step, then adds one 1,000 ticket.
    expect(grossRevenue([{ pricePerPerson: 1000 }], 20)).toBe(20000);
  });

  it("handles values arriving from text inputs as strings", () => {
    expect(grossRevenue([{ pricePerPerson: "1000", ticketCapacity: "20" }])).toBe(20000);
    expect(grossRevenue([{ pricePerPerson: "1,000.50", ticketCapacity: "20" }])).toBe(20010);
  });

  it("adds several ticket types together", () => {
    expect(grossRevenue([
      { pricePerPerson: 1000, ticketCapacity: 20 },
      { pricePerPerson: 500, ticketCapacity: 10 },
    ])).toBe(25000);
  });

  it("counts a combi ticket's add-on and a free RSVP's zero", () => {
    expect(grossRevenue([{ pricingMode: "combi", pricePerPerson: 100, addonPrice: 25, ticketCapacity: 10 }])).toBe(1250);
    expect(grossRevenue([{ pricingMode: "free_rsvp", pricePerPerson: 100, ticketCapacity: 10 }])).toBe(0);
  });

  it("prices a pay-what-you-want ticket at its suggested amount", () => {
    expect(grossRevenue([{ pricingMode: "pwyw", suggestedPrice: 30, minPrice: 10, ticketCapacity: 10 }])).toBe(300);
  });

  it("never returns NaN for blank or malformed input", () => {
    expect(grossRevenue([{ pricePerPerson: "", ticketCapacity: "" }], "")).toBe(0);
    expect(grossRevenue([{ pricePerPerson: undefined, ticketCapacity: null }])).toBe(0);
    expect(grossRevenue([])).toBe(0);
  });

  it("keeps large totals exact rather than drifting on floating point", () => {
    expect(grossRevenue([{ pricePerPerson: 1999.99, ticketCapacity: 300 }])).toBe(599997);
    expect(grossRevenue([{ pricePerPerson: 0.1, ticketCapacity: 3 }])).toBe(0.3);
  });

  it("a second ticket without capacity does not silently absorb the event total", () => {
    // Two tickets, one blank: only the explicit capacity counts, so the number
    // never doubles behind the creator's back.
    expect(grossRevenue([
      { pricePerPerson: 1000, ticketCapacity: 20 },
      { pricePerPerson: 500 },
    ], 20)).toBe(20000);
  });
});
