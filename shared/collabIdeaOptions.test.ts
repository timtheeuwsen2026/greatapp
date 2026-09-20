import { describe, it, expect } from "vitest";
import {
  collabSeekingLabel,
  describeDealPreferences,
  sanitiseDealPreferences,
  sanitiseSeekingTypes,
  sanitiseTypeDetails,
  suggestedDealTypeFor,
} from "./collabIdeaOptions";

describe("sanitiseSeekingTypes — multi-select, over a column that used to be single", () => {
  it("keeps several types at once", () => {
    expect(sanitiseSeekingTypes(["venue", "sponsor"])).toEqual(["venue", "sponsor"]);
  });

  it("accepts a bare string, which is what an old posting stored", () => {
    expect(sanitiseSeekingTypes("venue")).toEqual(["venue"]);
  });

  it("drops ids the list does not know", () => {
    expect(sanitiseSeekingTypes(["venue", "unicorn"])).toEqual(["venue"]);
  });

  it("de-duplicates", () => {
    expect(sanitiseSeekingTypes(["venue", "venue"])).toEqual(["venue"]);
  });

  it("returns nothing for nothing, so the caller can refuse the post", () => {
    expect(sanitiseSeekingTypes(null)).toEqual([]);
    expect(sanitiseSeekingTypes([])).toEqual([]);
  });
});

describe("sanitiseTypeDetails — answers follow the types that are selected", () => {
  it("keeps only the fields belonging to a selected type", () => {
    const details = sanitiseTypeDetails(
      {
        venue: { area: "Barceloneta", kindOfSpace: "Beach spot", nonsense: "x" },
        sponsor: { need: "Power on site" },
      },
      ["venue"],
    );
    // `area` is no longer one of the venue block's fields — it is the
    // posting's own Area, asked once of everyone — so it is dropped here like
    // any other key the type does not own.
    expect(details).toEqual({ venue: { kindOfSpace: "Beach spot" } });
  });

  it("drops a type's answers once that type is unticked", () => {
    // Otherwise a stale "kind of space" stays behind for the matcher to read.
    expect(sanitiseTypeDetails({ venue: { area: "Barceloneta" } }, ["sponsor"])).toEqual({});
  });

  it("leaves out a selected type that was not filled in", () => {
    expect(sanitiseTypeDetails({}, ["venue"])).toEqual({});
  });

  it("survives a payload that is not an object", () => {
    expect(sanitiseTypeDetails("nope", ["venue"])).toEqual({});
    expect(sanitiseTypeDetails(null, ["venue"])).toEqual({});
  });
});

describe("deal preferences", () => {
  it("keeps only known ids", () => {
    expect(sanitiseDealPreferences(["revenue_split", "barter", "gold_bars"]))
      .toEqual(["revenue_split", "barter"]);
  });

  it("describes them as a readable list", () => {
    expect(describeDealPreferences({ dealPreferences: ["revenue_split", "barter"] }))
      .toBe("Revenue split (tickets), Barter");
  });

  it("falls back to the old free-text field for a posting made before the buttons", () => {
    expect(describeDealPreferences({ dealPreference: "Revenue split, open to discuss" }))
      .toBe("Revenue split, open to discuss");
  });

  it("says something rather than nothing when neither is set", () => {
    expect(describeDealPreferences({})).toBe("Open to discuss");
  });
});

describe("suggestedDealTypeFor — a suggestion, never a lock", () => {
  it("maps revenue split onto commission per ticket", () => {
    expect(suggestedDealTypeFor({ dealPreferences: ["revenue_split"] })).toBe("commission_per_ticket");
  });

  it("prefers the more specific preference when several are selected", () => {
    // Revenue split is the one with a mechanism behind it; "open to discuss"
    // beside it is not a reason to suggest nothing.
    expect(suggestedDealTypeFor({ dealPreferences: ["open_to_discuss", "revenue_split"] }))
      .toBe("commission_per_ticket");
  });

  it("maps the others onto their deal types", () => {
    expect(suggestedDealTypeFor({ dealPreferences: ["content_for_exposure"] })).toBe("content_license");
    expect(suggestedDealTypeFor({ dealPreferences: ["upfront_fee"] })).toBe("financial_sponsorship");
    expect(suggestedDealTypeFor({ dealPreferences: ["barter"] })).toBe("brand_barter");
  });

  it("suggests nothing when the stated preference is only 'open to discuss'", () => {
    expect(suggestedDealTypeFor({ dealPreferences: ["open_to_discuss"] })).toBeNull();
  });

  it("reads the old free text only where it is unambiguous", () => {
    expect(suggestedDealTypeFor({ dealPreference: "Revenue split please" })).toBe("commission_per_ticket");
    expect(suggestedDealTypeFor({ dealPreference: "whatever works" })).toBeNull();
  });
});

describe("collabSeekingLabel", () => {
  it("labels the current types", () => {
    expect(collabSeekingLabel("venue")).toBe("A venue or space");
    expect(collabSeekingLabel("sponsor")).toBe("A sponsor");
  });

  it("still renders the ids older postings stored", () => {
    // "organizer" and "promoter" were options on the old single-select.
    expect(collabSeekingLabel("organizer")).toBe("An organiser");
    expect(collabSeekingLabel("promoter")).toBe("An affiliate");
  });
});
