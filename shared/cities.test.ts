import { describe, expect, it } from "vitest";
import {
  cityOfEvent,
  cityPath,
  countEventsByCity,
  detectLiveCity,
  inCity,
  liveCityForCountry,
  normalizeCityName,
} from "./cities";

describe("cities (66.24)", () => {
  it("reads the city from the addresses we have today", () => {
    expect(detectLiveCity("Carrer del Rec, 26, Ciutat Vella, 08003 Barcelona")?.name).toBe("Barcelona");
    expect(detectLiveCity("Noor Coffee, Placa de la llana, Born")).toBeUndefined();
    expect(detectLiveCity("Bandido Cafe Raval")?.name).toBe("Barcelona");
    expect(detectLiveCity("Pangea, Sant Marti")?.name).toBe("Barcelona");
    expect(detectLiveCity("Beethovenstraat")?.name).toBe("Amsterdam");
    expect(detectLiveCity("Vondelstraat 1, 1054 GE")?.name).toBe("Amsterdam");
    expect(detectLiveCity("Mallorca")).toBeUndefined();
  });

  it("stores one spelling per live city and keeps other places as typed", () => {
    expect(normalizeCityName("barcelona")).toBe("Barcelona");
    expect(normalizeCityName("  Raval ")).toBe("Barcelona");
    expect(normalizeCityName("AMSTERDAM")).toBe("Amsterdam");
    expect(normalizeCityName("ubud")).toBe("Ubud");
    expect(normalizeCityName("")).toBeNull();
  });

  it("finds an event's city from its own field, its venue, then its address or title", () => {
    expect(cityOfEvent({ city: "Amsterdam", location: "Barcelona" })).toBe("Amsterdam");
    expect(cityOfEvent({ venueCity: "Barcelona", location: "Somewhere" })).toBe("Barcelona");
    expect(cityOfEvent({ title: "Run Club Amsterdam Oud Zuid", location: "Beethovenstraat" })).toBe("Amsterdam");
    // A word in a title is not a neighbourhood.
    expect(cityOfEvent({ title: "Born to run", location: "Online" })).toBeNull();
  });

  it("offers the visitor the city of their country, or nothing", () => {
    expect(liveCityForCountry("nl")?.name).toBe("Amsterdam");
    expect(liveCityForCountry("ES")?.name).toBe("Barcelona");
    expect(liveCityForCountry("PK")).toBeUndefined();
    expect(liveCityForCountry(null)).toBeUndefined();
  });

  it("filters by city, with All cities matching everything", () => {
    expect(inCity("Barcelona", "barcelona")).toBe(true);
    expect(inCity("Barcelona", "Amsterdam")).toBe(false);
    expect(inCity(null, "Amsterdam")).toBe(false);
    expect(inCity("Ubud", "all")).toBe(true);
  });

  it("gives each live city its own address", () => {
    expect(cityPath("Amsterdam")).toBe("/amsterdam");
    expect(cityPath("Barcelona")).toBe("/barcelona");
    expect(cityPath("all")).toBe("/");
  });
});

describe("city menu counts (66.24)", () => {
  it("counts upcoming events per live city, and everything under All cities", () => {
    const events = [
      { city: "Barcelona", title: "Sunday Social 5K" },
      { city: null, location: "Carrer del Rec, 26, 08003 Barcelona" },
      { city: "Amsterdam", title: "Run Club Amsterdam Oud Zuid" },
      { city: "Ubud", title: "Bali retreat" },
      { city: "Amsterdam", title: "Past event", past: true },
    ];
    const counts = countEventsByCity(events as any, (event: any) => !event.past);
    expect(counts.cities).toEqual([
      { name: "Barcelona", slug: "barcelona", count: 2 },
      { name: "Amsterdam", slug: "amsterdam", count: 1 },
    ]);
    expect(counts.total).toBe(4);
  });
});
