import { describe, it, expect } from "vitest";
import {
  COMMITMENT_FEE_BENCHMARK,
  formatBenchmarkHint,
  getBenchmarkOutlierNote,
  getDealBenchmark,
  getVenueSpaceLabel,
  isVenueSpaceType,
} from "./dealBenchmarks";

// Point 6: an organiser proposing terms usually has had no prior conversation
// with the venue, so a blank field is where they give up and settle something
// off-platform instead.

describe("a starting number by kind of venue", () => {
  it("differs by space, because the ask genuinely differs", () => {
    // A gym is the product; a café is the backdrop.
    const cafe = getDealBenchmark("revenue_share", "coffee_shop");
    const gym = getDealBenchmark("revenue_share", "fitness_studio");

    // The gym's range sits entirely above the café's, touching at the top.
    expect(cafe!.high).toBeLessThanOrEqual(gym!.low);
    expect(gym!.high).toBeGreaterThan(cafe!.high);
    expect(cafe?.unit).toBe("percent");
  });

  it("falls back to a general range for a space with no entry of its own", () => {
    const fallback = getDealBenchmark("revenue_share", "other");

    expect(fallback).not.toBeNull();
    expect(fallback?.low).toBe(15);
  });

  it("reports nothing where there is no convention to report", () => {
    expect(getDealBenchmark("manual_counter_revenue", "coffee_shop")).toBeNull();
    expect(getDealBenchmark("access_only", "coffee_shop")).toBeNull();
    expect(getDealBenchmark(null, "coffee_shop")).toBeNull();
  });

  it("quotes multi-day deals per room or per head, not as a percentage", () => {
    expect(getDealBenchmark("per_room_night", "retreat_center")?.unit).toBe("amount");
    expect(getDealBenchmark("per_head", "private_villa")?.unit).toBe("amount");
  });
});

describe("the hint an organiser reads", () => {
  it("names the venue kind, the range, and why", () => {
    const hint = formatBenchmarkHint("revenue_share", "coffee_shop", "€");

    expect(hint).toContain("Coffee shops and cafés");
    expect(hint).toContain("10–20%");
    expect(hint).toMatch(/footfall/i);
  });

  it("uses the event currency for money ranges", () => {
    expect(formatBenchmarkHint("upfront_rental", "coworking", "$")).toContain("$50–$250");
  });

  it("shows nothing rather than inventing a range", () => {
    expect(formatBenchmarkHint("manual_counter_revenue", "coffee_shop")).toBeNull();
  });

  it("gives the commitment fee one range everywhere, since it is a gesture", () => {
    expect(COMMITMENT_FEE_BENCHMARK.low).toBe(25);
    expect(COMMITMENT_FEE_BENCHMARK.unit).toBe("amount");
  });
});

describe("flagging a number that looks wrong", () => {
  it("questions a figure far above what similar venues agree", () => {
    const note = getBenchmarkOutlierNote("revenue_share", "coffee_shop", 60);

    expect(note).toMatch(/well above/i);
    expect(note).toContain("10%–20%");
  });

  it("questions a figure far below it too", () => {
    // Underselling is as much a problem as overreaching.
    expect(getBenchmarkOutlierNote("revenue_share", "fitness_studio", 3)).toMatch(/well below/i);
  });

  it("says nothing about a number inside, or merely near, the range", () => {
    expect(getBenchmarkOutlierNote("revenue_share", "coffee_shop", 15)).toBeNull();
    expect(getBenchmarkOutlierNote("revenue_share", "coffee_shop", 30)).toBeNull();
    expect(getBenchmarkOutlierNote("revenue_share", "coffee_shop", 0)).toBeNull();
  });

  // It is a nudge, not a rule: the organiser may simply know their venue.
  it("never blocks anything — it only ever returns a note", () => {
    expect(typeof getBenchmarkOutlierNote("revenue_share", "coffee_shop", 90)).toBe("string");
  });
});

describe("space types", () => {
  it("recognises the ones the builder offers", () => {
    expect(isVenueSpaceType("coffee_shop")).toBe(true);
    expect(isVenueSpaceType("nightclub")).toBe(false);
    expect(getVenueSpaceLabel("nonsense")).toBe("Most venues");
  });
});
