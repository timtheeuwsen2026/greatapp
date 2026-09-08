import { describe, it, expect } from "vitest";
import {
  formatCollabGroupSize,
  formatCollabPeriod,
  resolveCollabExpiry,
  venueEffectiveCapacity,
  venueMatchesCollabIdea,
} from "./collabMatching";

const retreatIdea = {
  seekingPartnerType: "venue",
  city: "Costa Brava",
  region: "Catalonia",
  venueCategory: "villa",
  groupSizeMin: 12,
  groupSizeMax: 16,
};

const finca = {
  id: "v1",
  name: "Finca Can Roure",
  city: "Costa Brava",
  region: "Catalonia",
  category: "villa",
  capacity: 16,
  status: "approved",
};

describe("who hears about a new collab idea", () => {
  it("notifies a space that fits on place, category and size", () => {
    expect(venueMatchesCollabIdea(retreatIdea, finca)).toBe(true);
  });

  it("never interrupts a venue that cannot hold the group", () => {
    expect(venueMatchesCollabIdea(retreatIdea, { ...finca, capacity: 8 })).toBe(false);
  });

  it("ignores a space that is not approved yet", () => {
    expect(venueMatchesCollabIdea(retreatIdea, { ...finca, status: "pending" })).toBe(false);
    expect(venueMatchesCollabIdea(retreatIdea, { ...finca, status: "draft" })).toBe(false);
  });

  it("skips venues somewhere else entirely", () => {
    expect(venueMatchesCollabIdea(retreatIdea, { ...finca, city: "Berlin", region: "Berlin" })).toBe(false);
  });

  it("matches a loosely worded area against a specific town", () => {
    // "Costa Brava area, flexible" will never equal a venue's own town name.
    expect(venueMatchesCollabIdea(
      { ...retreatIdea, city: "Costa Brava area" },
      { ...finca, city: "Costa Brava" },
    )).toBe(true);
  });

  it("counts a standing capacity when that is the number the venue recorded", () => {
    expect(venueEffectiveCapacity({ id: "v", capacity: null, standingCapacity: 40 })).toBe(40);
    expect(venueMatchesCollabIdea(
      { ...retreatIdea, venueCategory: null },
      { ...finca, capacity: null, standingCapacity: 20 },
    )).toBe(true);
  });
});

describe("an unstated field must not exclude everybody", () => {
  it("reaches any nearby venue when no category was given", () => {
    expect(venueMatchesCollabIdea(
      { ...retreatIdea, venueCategory: null },
      { ...finca, category: "coffee_shop" },
    )).toBe(true);
  });

  it("still reaches a venue that never set a category of its own", () => {
    expect(venueMatchesCollabIdea(retreatIdea, { ...finca, category: null, venueType: null })).toBe(true);
  });

  it("reaches everyone approved when no place was given", () => {
    expect(venueMatchesCollabIdea(
      { ...retreatIdea, city: null, region: null },
      { ...finca, city: "Lisbon", region: "Lisbon" },
    )).toBe(true);
  });

  it("does not apply a size rule the poster never set", () => {
    expect(venueMatchesCollabIdea(
      { ...retreatIdea, groupSizeMin: null, groupSizeMax: null },
      { ...finca, capacity: 2 },
    )).toBe(true);
  });
});

describe("ideas that are not looking for a venue", () => {
  it("does not notify venues when a promoter is wanted", () => {
    expect(venueMatchesCollabIdea({ ...retreatIdea, seekingPartnerType: "promoter" }, finca)).toBe(false);
  });
});

describe("saying when, as a period", () => {
  it("reads as a range of months", () => {
    expect(formatCollabPeriod("2026-10-01", "2026-11-30")).toBe("Oct 2026 – Nov 2026");
  });

  it("collapses a single month", () => {
    expect(formatCollabPeriod("2026-10-01", "2026-10-20")).toBe("Oct 2026");
  });

  it("copes with only one end of the range, or neither", () => {
    expect(formatCollabPeriod("2026-10-01", null)).toBe("From Oct 2026");
    expect(formatCollabPeriod(null, "2026-11-30")).toBe("Before Nov 2026");
    expect(formatCollabPeriod(null, null)).toBe("No date yet");
    expect(formatCollabPeriod("not a date", null)).toBe("No date yet");
  });

  it("describes the group size the poster gave", () => {
    expect(formatCollabGroupSize(12, 16)).toBe("12–16 guests");
    expect(formatCollabGroupSize(16, 16)).toBe("16 guests");
    expect(formatCollabGroupSize(12, null)).toBe("12+ guests");
    expect(formatCollabGroupSize(null, 16)).toBe("Up to 16 guests");
    expect(formatCollabGroupSize(null, null)).toBe("");
  });
});

describe("how long an idea stays open", () => {
  const now = new Date("2026-09-10T00:00:00.000Z");

  it("outlives the period being proposed", () => {
    // A retreat pitched for Oct-Nov 2027 must not expire this year.
    const expiry = resolveCollabExpiry("2027-11-30T00:00:00.000Z", now);
    expect(expiry.toISOString()).toBe("2027-11-30T00:00:00.000Z");
  });

  it("gives a near-term idea a sensible default window", () => {
    const expiry = resolveCollabExpiry("2026-09-20T00:00:00.000Z", now);
    expect(expiry.getTime()).toBe(now.getTime() + 60 * 86_400_000);
  });

  it("falls back to the default when no period was given", () => {
    expect(resolveCollabExpiry(null, now).getTime()).toBe(now.getTime() + 60 * 86_400_000);
  });
});
