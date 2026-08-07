import { describe, it, expect } from "vitest";
import { venueFlashDealInputSchema } from "./schema";

const valid = {
  venueId: "venue-1",
  startDate: "2026-08-12",
  endDate: "2026-08-16",
  headline: "Late cancellation — whole villa free",
  description: "A group dropped out. Ten rooms, full board, pool and yoga shala for the week.",
};

describe("venueFlashDealInputSchema", () => {
  it("accepts a plain-words deal", () => {
    const parsed = venueFlashDealInputSchema.parse(valid);
    expect(parsed.headline).toBe(valid.headline);
    expect(parsed.startDate.toISOString().slice(0, 10)).toBe("2026-08-12");
  });

  it("accepts a single-day deal", () => {
    const parsed = venueFlashDealInputSchema.parse({ ...valid, endDate: valid.startDate });
    expect(parsed.endDate.getTime()).toBe(parsed.startDate.getTime());
  });

  it("rejects an end date before the start", () => {
    const result = venueFlashDealInputSchema.safeParse({ ...valid, endDate: "2026-08-01" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/end date cannot be before/i);
    }
  });

  it("rejects a headline too short to tell a creator anything", () => {
    const result = venueFlashDealInputSchema.safeParse({ ...valid, headline: "Free!" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty description", () => {
    const result = venueFlashDealInputSchema.safeParse({ ...valid, description: "  " });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace off the text", () => {
    const parsed = venueFlashDealInputSchema.parse({
      ...valid,
      headline: `  ${valid.headline}  `,
      description: `\n${valid.description}\n`,
    });
    expect(parsed.headline).toBe(valid.headline);
    expect(parsed.description).toBe(valid.description);
  });

  it("carries no discount, percentage or price field", () => {
    // A flash deal is a lead, not an offer. If a pricing field ever appears
    // here it means the discount-calculator idea crept back in.
    const parsed: Record<string, unknown> = venueFlashDealInputSchema.parse({
      ...valid,
      discountPct: 40,
      price: 6000,
      wasPrice: 10000,
    } as any);

    expect(Object.keys(parsed).sort()).toEqual(
      ["description", "endDate", "headline", "startDate", "venueId"],
    );
  });

  it("keeps numbers a venue types into its own words", () => {
    // Writing "we'd take €6,000 instead of our usual €10k" is the whole point;
    // it is prose, not a calculated discount.
    const parsed = venueFlashDealInputSchema.parse({
      ...valid,
      description: "We'd take a flat €6,000 for the week instead of our usual €10k.",
    });
    expect(parsed.description).toContain("€6,000");
  });
});
