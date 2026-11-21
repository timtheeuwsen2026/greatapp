import { describe, expect, it } from "vitest";
import { matchesSearch, searchEvents, searchRank, searchTerms, stem } from "./eventSearch";

// Tim, bug 1 (21 Nov 2026): "Running" in Barcelona showed old, ended events and
// irrelevant results. Titles and descriptions below are from the live site.

const NOW = new Date("2026-11-21T10:00:00Z");

const event = (title: string, startDate: string, extra: Record<string, unknown> = {}) => ({
  id: title,
  title,
  city: "Barcelona",
  category: "sports_wellness",
  startDate: `${startDate}T12:00:00.000Z`,
  endDate: `${startDate}T12:00:00.000Z`,
  startTime: "09:30",
  endTime: "11:00",
  description: "",
  hostName: "Good Soles",
  ...extra,
});

const EVENTS = [
  event("Good Soles X Collect Running - Sunday 5km", "2026-09-06", { description: "A 5km run, then coffee." }),
  event("Good Soles X Cloud Coffee | Sunday Social 5k", "2026-11-22", { category: "community_social", description: "Sunday social run of 5k through Gràcia, then coffee." }),
  event("Social Run + Coffee Recovery | Barcelona", "2026-11-28", { description: "Easy run." }),
  event("Run Swim Run - Sprint or Double Distance", "2026-10-03"),
  event("Juice y Rave - Halloween Edition", "2026-12-05", { category: "festivals_events", hostName: "Juice", description: "Dance, juice and a short warm-up." }),
  event("Sunday Brunch Club", "2026-12-06", { category: "food_drink", hostName: "Brunchers", description: "Brunch and good talk." }),
  event("AFTERbreathWORK", "2026-12-07", { hostName: "Breath Barcelona", description: "Breathwork and a sauna." }),
];

describe("stems", () => {
  it("reads running, runs and runners as run, and leaves short words alone", () => {
    expect(["running", "runs", "runners", "Running"].map(stem)).toEqual(["run", "run", "run", "run"]);
    expect(stem("swimming")).toBe("swim");
    expect(stem("workshops")).toBe("workshop");
    expect(stem("yoga")).toBe("yoga");
    expect(stem("5k")).toBe("5k");
  });

  it("drops the small words", () => {
    expect(searchTerms("running in Barcelona")).toEqual(["run", "barcelona"]);
  });
});

describe('Tim\'s test: "Running" in Barcelona', () => {
  const { upcoming, past } = searchEvents(EVENTS, "Running", "all", NOW);

  it("shows the upcoming run events first, soonest first", () => {
    expect(upcoming.map((e) => e.title)).toEqual([
      // A run in its title first...
      "Social Run + Coffee Recovery | Barcelona",
      // ...then the Good Soles run that only says "run" in its description.
      "Good Soles X Cloud Coffee | Sunday Social 5k",
    ]);
  });

  it("puts ended run events last, most recent first", () => {
    expect(past.map((e) => e.title)).toEqual([
      "Run Swim Run - Sprint or Double Distance",
      "Good Soles X Collect Running - Sunday 5km",
    ]);
  });

  it("does not find brunch, raves or breathwork", () => {
    const all = [...upcoming, ...past].map((e) => e.title);
    expect(all).not.toContain("Sunday Brunch Club");
    expect(all).not.toContain("Juice y Rave - Halloween Edition");
    expect(all).not.toContain("AFTERbreathWORK");
  });
});

describe("what a search matches", () => {
  it("matches on the host", () => {
    expect(matchesSearch(EVENTS[6], "breath barcelona")).toBe(true);
    expect(searchEvents(EVENTS, "Good Soles", "all", NOW).upcoming.map((e) => e.title)).toEqual([
      "Good Soles X Cloud Coffee | Sunday Social 5k",
      "Social Run + Coffee Recovery | Barcelona",
    ]);
  });

  it("matches on the category and the city, with accents folded", () => {
    expect(matchesSearch(EVENTS[5], "food")).toBe(true);
    expect(matchesSearch(EVENTS[1], "barcelona")).toBe(true);
    expect(searchRank(EVENTS[1], "gracia")).toBe(1);
  });

  it("needs every word typed, unless it is a chip", () => {
    expect(searchRank(EVENTS[2], "run yoga")).toBe(0);
    expect(searchRank(EVENTS[2], "run yoga", "any")).toBe(2);
  });

  it("finds everything with no search, still upcoming first and ended last", () => {
    const { upcoming, past } = searchEvents(EVENTS, "", "all", NOW);
    expect(upcoming[0].title).toBe("Good Soles X Cloud Coffee | Sunday Social 5k");
    expect(past).toHaveLength(2);
  });

  it("finds nothing for something nobody planned, so the page can offer to post it as an idea", () => {
    const { upcoming, past } = searchEvents(EVENTS, "pottery", "all", NOW);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(0);
  });
});
