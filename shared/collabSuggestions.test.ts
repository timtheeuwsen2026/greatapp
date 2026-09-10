import { describe, it, expect } from "vitest";
import { matchesStandingPreferences } from "./collabSuggestions";

const barcelonaCafe = {
  role: "venue_provider",
  city: "Barcelona",
  region: "Catalonia",
  categories: ["coffee_shop", "daytime"],
  capacity: 40,
};

describe("matchesStandingPreferences", () => {
  it("suggests a nearby event that fits the space", () => {
    const match = matchesStandingPreferences(barcelonaCafe, {
      kind: "open_event",
      id: "exp-1",
      title: "Saturday Social Sweat",
      city: "Barcelona",
      groupSize: 30,
    });

    expect(match.matched).toBe(true);
    expect(match.reasons).toContain("In Barcelona");
    expect(match.reasons).toContain("30 people — fits your space");
  });

  it("never suggests a group the space cannot hold", () => {
    const match = matchesStandingPreferences(barcelonaCafe, {
      kind: "open_event",
      id: "exp-2",
      title: "Warehouse Rave",
      city: "Barcelona",
      groupSize: 400,
    });

    expect(match.matched).toBe(false);
  });

  it("does not suggest something in another city", () => {
    const match = matchesStandingPreferences(barcelonaCafe, {
      kind: "open_event",
      id: "exp-3",
      title: "Lisbon Supper Club",
      city: "Lisbon",
      groupSize: 20,
    });

    expect(match.matched).toBe(false);
  });

  // "Costa Brava area, flexible" will never equal a venue's town name.
  it("matches a loosely stated area against a town", () => {
    const match = matchesStandingPreferences(
      { role: "creator", city: "Costa Brava", categories: [] },
      { kind: "venue", id: "v-1", title: "Casa Verde", city: "Costa Brava Nord" },
    );

    expect(match.matched).toBe(true);
  });

  it("needs at least one real reason before suggesting anything", () => {
    const match = matchesStandingPreferences(
      { role: "creator", city: null, region: null, categories: [] },
      { kind: "venue", id: "v-2", title: "Somewhere" },
    );

    expect(match.matched).toBe(false);
    expect(match.reasons).toEqual([]);
  });

  it("counts a category overlap on its own", () => {
    const match = matchesStandingPreferences(
      { role: "creator", categories: ["yoga"] },
      { kind: "venue", id: "v-3", title: "Studio Uno", categories: ["yoga_studio"] },
    );

    expect(match.matched).toBe(true);
    expect(match.reasons.some((reason) => reason.includes("yoga"))).toBe(true);
  });
});
