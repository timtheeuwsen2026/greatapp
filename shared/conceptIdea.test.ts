import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { experienceDrafts, insertExperienceDraftSchema } from "./schema";
import {
  EMPTY_IDEA,
  GROUP_SIZE_MAX,
  buildConcept,
  buildIdeaDraftFields,
  describeEventDate,
  hasErrors,
  isConceptDraft,
  localToday,
  parseGroupSize,
  sanitiseConcept,
  validateIdeaAudience,
  validateIdeaBasics,
  withSanitisedConcept,
  type IdeaInput,
} from "./conceptIdea";

const TODAY = "2026-10-14";
const idea = (changes: Partial<IdeaInput> = {}): IdeaInput => ({ ...EMPTY_IDEA, title: "Halloween coffee rave", ...changes });

describe("idea screen 1 — only the title is required", () => {
  it("accepts a title with no date at all when the date is left open", () => {
    expect(hasErrors(validateIdeaBasics(idea({ dateMode: "open" }), TODAY))).toBe(false);
  });

  it("asks for a title", () => {
    expect(validateIdeaBasics(idea({ title: "   ", dateMode: "open" }), TODAY).title).toBeTruthy();
  });

  it("holds the title to a short length", () => {
    expect(validateIdeaBasics(idea({ title: "x".repeat(121), dateMode: "open" }), TODAY).title).toBeTruthy();
    expect(validateIdeaBasics(idea({ title: "x".repeat(120), dateMode: "open" }), TODAY).title).toBeUndefined();
  });

  it("needs a start date in Exact date mode, and none in the other modes", () => {
    expect(validateIdeaBasics(idea({ dateMode: "exact" }), TODAY).exactStart).toBeTruthy();
    expect(validateIdeaBasics(idea({ dateMode: "open" }), TODAY).exactStart).toBeUndefined();
    expect(validateIdeaBasics(idea({ dateMode: "period" }), TODAY).exactStart).toBeUndefined();
  });

  it("makes the exact end and the start time optional, but not nonsense", () => {
    expect(hasErrors(validateIdeaBasics(idea({ exactStart: "2026-10-31" }), TODAY))).toBe(false);
    expect(validateIdeaBasics(idea({ exactStart: "2026-10-31", exactEnd: "2026-10-30" }), TODAY).exactEnd).toBeTruthy();
    expect(validateIdeaBasics(idea({ exactStart: "2026-10-31", startTime: "25:99" }), TODAY).startTime).toBeTruthy();
    expect(hasErrors(validateIdeaBasics(idea({ exactStart: "2026-10-31", startTime: "18:30" }), TODAY))).toBe(false);
  });

  it("does not take a date in the past, but takes today", () => {
    expect(validateIdeaBasics(idea({ exactStart: "2026-10-13" }), TODAY).exactStart).toMatch(/past/);
    expect(validateIdeaBasics(idea({ exactStart: TODAY }), TODAY).exactStart).toBeUndefined();
  });

  it("rejects a day that does not exist", () => {
    expect(validateIdeaBasics(idea({ exactStart: "2026-02-31" }), TODAY).exactStart).toBeTruthy();
  });

  it("needs both ends of a period, in order", () => {
    const period = (changes: Partial<IdeaInput>) => idea({ dateMode: "period", ...changes });
    expect(validateIdeaBasics(period({}), TODAY)).toMatchObject({ periodStart: expect.any(String), periodEnd: expect.any(String) });
    expect(validateIdeaBasics(period({ periodStart: "2026-10-25" }), TODAY).periodEnd).toBeTruthy();
    expect(validateIdeaBasics(period({ periodStart: "2026-11-01", periodEnd: "2026-10-25" }), TODAY).periodEnd).toBeTruthy();
    expect(hasErrors(validateIdeaBasics(period({ periodStart: "2026-10-25", periodEnd: "2026-11-01" }), TODAY))).toBe(false);
  });

  it("ignores a period's fields while another mode is selected", () => {
    // They stay in the form when someone flips the toggle; they must not block.
    expect(hasErrors(validateIdeaBasics(idea({ dateMode: "open", periodStart: "2020-01-01", periodEnd: "bad" }), TODAY))).toBe(false);
  });
});

describe("idea screen 2 — everything optional, but a range has to make sense", () => {
  it("accepts nothing", () => {
    expect(hasErrors(validateIdeaAudience(idea()))).toBe(false);
  });

  it("accepts a range and a single bound", () => {
    expect(hasErrors(validateIdeaAudience(idea({ groupSizeMin: "10", groupSizeMax: "60" })))).toBe(false);
    expect(hasErrors(validateIdeaAudience(idea({ groupSizeMax: 60 })))).toBe(false);
    expect(hasErrors(validateIdeaAudience(idea({ groupSizeMin: 10 })))).toBe(false);
  });

  it("rejects a top lower than the bottom", () => {
    expect(validateIdeaAudience(idea({ groupSizeMin: "60", groupSizeMax: "10" })).groupSizeMax).toBeTruthy();
  });

  it("rejects zero, negatives, decimals and words", () => {
    for (const bad of ["0", "-5", "2.5", "lots"]) {
      expect(validateIdeaAudience(idea({ groupSizeMin: bad })).groupSizeMin).toBeTruthy();
    }
  });

  it("refuses a group the builder would then reject", () => {
    expect(validateIdeaAudience(idea({ groupSizeMax: "201" })).groupSizeMax).toMatch(/200/);
    expect(validateIdeaAudience(idea({ groupSizeMin: "500" })).groupSizeMin).toMatch(/200/);
    expect(hasErrors(validateIdeaAudience(idea({ groupSizeMax: "200" })))).toBe(false);
  });

  it("holds the audience to a sensible length", () => {
    expect(validateIdeaAudience(idea({ audience: "x".repeat(161) })).audience).toBeTruthy();
  });
});

describe("parseGroupSize", () => {
  it("reads typed text and numbers, and treats the rest as blank", () => {
    expect(parseGroupSize("12")).toBe(12);
    expect(parseGroupSize(" 12 ")).toBe(12);
    expect(parseGroupSize(12)).toBe(12);
    for (const blank of ["", null, undefined, "0", "-1", "1.5", "abc", NaN]) expect(parseGroupSize(blank)).toBeNull();
  });

  it("caps at the most the builder accepts", () => {
    expect(GROUP_SIZE_MAX).toBe(200);
    expect(parseGroupSize("99999999")).toBe(200);
    expect(parseGroupSize(200)).toBe(200);
  });
});

describe("localToday", () => {
  it("is the day on the clock, not the day in UTC", () => {
    // 00:30 on 14 Oct local time is still 13 Oct in UTC for anyone east of it.
    expect(localToday(new Date(2026, 9, 14, 0, 30))).toBe("2026-10-14");
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("buildIdeaDraftFields — where each answer goes", () => {
  it("writes an exact date into the draft's own date columns, ready for the builder", () => {
    const fields = buildIdeaDraftFields(idea({
      oneLiner: " Short run in costume ",
      exactStart: "2026-10-31", startTime: "16:00",
      place: "Barceloneta", groupSizeMin: "10", groupSizeMax: "60", audience: "Runners",
    }));
    expect(fields).toMatchObject({
      title: "Halloween coffee rave",
      description: "Short run in costume",
      startDate: "2026-10-31T12:00:00.000Z",
      endDate: "2026-10-31T12:00:00.000Z",
      startTime: "16:00",
      location: "Barceloneta",
      maxParticipants: 60,
      type: "one-day",
    });
    expect(fields.concept).toMatchObject({ stage: "concept", dateMode: "exact", audience: "Runners", groupSizeMin: 10, groupSizeMax: 60 });
  });

  it("leaves the date columns empty for a period, keeping the period in the concept", () => {
    const fields = buildIdeaDraftFields(idea({
      dateMode: "period", periodStart: "2026-10-25", periodEnd: "2026-11-01", dayPreference: "weekends",
      exactStart: "2026-12-01", // left over from before the toggle was flipped
    }));
    expect(fields.startDate).toBeNull();
    expect(fields.endDate).toBeNull();
    expect(fields.startTime).toBeNull();
    expect(fields.concept).toMatchObject({ dateMode: "period", periodStart: "2026-10-25", periodEnd: "2026-11-01", dayPreference: "weekends" });
    expect(fields.type).toBe("one-day");
  });

  it("leaves the date columns empty when there is no idea yet", () => {
    const fields = buildIdeaDraftFields(idea({ dateMode: "open", exactStart: "2026-12-01" }));
    expect(fields.startDate).toBeNull();
    expect(fields.concept).toMatchObject({ dateMode: "open", periodStart: null, dayPreference: null });
  });

  it("opens an exact range that spans days as a multi-day trip", () => {
    const fields = buildIdeaDraftFields(idea({ exactStart: "2026-11-12", exactEnd: "2026-11-16" }));
    expect(fields.type).toBe("multi-day");
    expect(fields.endDate).toBe("2026-11-16T12:00:00.000Z");
  });

  it("sends days as midday instants, so no timezone can move them to the neighbouring day", () => {
    const { startDate, endDate } = buildIdeaDraftFields(idea({ exactStart: "2026-10-31", exactEnd: "2026-11-02" }));
    for (const sent of [startDate, endDate]) {
      const instant = new Date(sent!);
      expect(instant.getUTCHours()).toBe(12);
      // Midday UTC is still the same calendar day anywhere from UTC-11 to UTC+11.
      for (const offsetHours of [-11, -5, 0, 2, 11]) {
        const local = new Date(instant.getTime() + offsetHours * 3_600_000);
        expect(local.getUTCDate()).toBe(instant.getUTCDate());
      }
    }
    expect(startDate).toBe("2026-10-31T12:00:00.000Z");
    expect(endDate).toBe("2026-11-02T12:00:00.000Z");
  });

  it("treats an end on the start day as a single day", () => {
    expect(buildIdeaDraftFields(idea({ exactStart: "2026-11-12", exactEnd: "2026-11-12" })).type).toBe("one-day");
  });

  it("does not carry a start time without a date", () => {
    expect(buildIdeaDraftFields(idea({ dateMode: "open", startTime: "18:00" })).startTime).toBeNull();
  });

  it("links a Great venue when one was picked", () => {
    const linked = buildIdeaDraftFields(idea({ place: "Jardinet del Mar, Barcelona", linkedVenueId: "venue-1" }));
    expect(linked).toMatchObject({ selectedVenueId: "venue-1", location: "Jardinet del Mar, Barcelona" });
    expect(buildIdeaDraftFields(idea({ place: "Barceloneta" })).selectedVenueId).toBeNull();
  });

  it("carries what a draft started in the builder carries, instead of table defaults", () => {
    // Left out, the draft table fills in a category nobody chose
    // ('sports_wellness') and no venue type, so the Venue step shows no
    // selected card until the first autosave.
    for (const fields of [
      buildIdeaDraftFields(idea({ place: "Barceloneta" })),
      buildIdeaDraftFields(idea({ linkedVenueId: "venue-1" })),
      buildIdeaDraftFields(idea({ dateMode: "open" })),
    ]) {
      expect(fields.category).toBe("");
      expect(fields.venueType).toBe("catalog");
    }
  });

  it("sends a null for every cleared answer, so going back can undo an earlier save", () => {
    const cleared = buildIdeaDraftFields(idea({ dateMode: "open" }));
    for (const key of ["startDate", "endDate", "startTime", "selectedVenueId", "maxParticipants"] as const) {
      expect(cleared[key]).toBeNull();
    }
    expect(cleared.location).toBe("");
    expect(cleared.description).toBe("");
  });
});

describe("sanitiseConcept — the boundary for the concept column", () => {
  it("round-trips what the client builds", () => {
    const built = buildConcept(idea({
      dateMode: "period", periodStart: "2026-10-25", periodEnd: "2026-11-01", dayPreference: "weekends",
      audience: "Runners", groupSizeMin: 10, groupSizeMax: 60, place: "Barceloneta", linkedVenueId: "v1",
    }));
    expect(sanitiseConcept(built)).toEqual(built);
  });

  it("returns null for anything that is not an object", () => {
    for (const bad of [null, undefined, "x", 5, [], true]) expect(sanitiseConcept(bad)).toBeNull();
  });

  it("drops unknown keys", () => {
    const result = sanitiseConcept({ stage: "concept", dateMode: "open", approved: true, __proto__: { admin: true }, status: "published" });
    expect(Object.keys(result!).sort()).toEqual([
      "audience", "dateMode", "dayPreference", "groupSizeMax", "groupSizeMin",
      "linkedVenueId", "periodEnd", "periodStart", "place", "stage",
    ]);
  });

  it("falls back to an open date for an unknown mode, and ignores a period it was not given", () => {
    expect(sanitiseConcept({ stage: "concept", dateMode: "whenever", periodStart: "2026-10-25" })).toMatchObject({
      dateMode: "open", periodStart: null,
    });
  });

  it("rejects malformed days and unknown day preferences", () => {
    const result = sanitiseConcept({ stage: "concept", dateMode: "period", periodStart: "tomorrow", periodEnd: "2026-13-40", dayPreference: "mondays" });
    expect(result).toMatchObject({ periodStart: null, periodEnd: null, dayPreference: "any" });
  });

  it("clamps text and numbers", () => {
    const result = sanitiseConcept({
      stage: "concept", dateMode: "open", audience: "x".repeat(500), place: "y".repeat(500), groupSizeMin: -3, groupSizeMax: 1e12,
    });
    expect(result!.audience).toHaveLength(160);
    expect(result!.place).toHaveLength(255);
    expect(result!.groupSizeMin).toBeNull();
    expect(result!.groupSizeMax).toBe(200);
  });

  it("stores non-string text as nothing rather than as an object", () => {
    expect(sanitiseConcept({ stage: "concept", dateMode: "open", audience: { $ne: "" }, linkedVenueId: 7 })).toMatchObject({
      audience: null, linkedVenueId: null,
    });
  });
});

describe("only a concept becomes a concept", () => {
  it("rejects an object that does not say it is one", () => {
    // Anything that posts an empty object or a stray one to a draft must not
    // flip a normal draft into a concept draft.
    for (const bad of [{}, { dateMode: "open" }, { stage: "other", dateMode: "open" }, { stage: 1 }]) {
      expect(sanitiseConcept(bad)).toBeNull();
    }
  });
});

describe("withSanitisedConcept — the net under every draft write", () => {
  it("rebuilds a concept that was written", () => {
    const written = withSanitisedConcept({ title: "x", concept: { stage: "concept", dateMode: "open", audience: { $ne: "" }, evil: 1 } });
    expect(written.title).toBe("x");
    expect(written.concept).toMatchObject({ stage: "concept", audience: null });
    expect(written.concept).not.toHaveProperty("evil");
  });

  it("clears a concept that was posted as junk", () => {
    expect(withSanitisedConcept({ concept: "junk" }).concept).toBeNull();
    expect(withSanitisedConcept({ concept: {} }).concept).toBeNull();
  });

  it("leaves a write that does not mention a concept exactly as it was", () => {
    const write = { title: "x", maxParticipants: 5 };
    expect(withSanitisedConcept(write)).toBe(write);
    expect(withSanitisedConcept(write)).not.toHaveProperty("concept");
  });

  it("keeps an explicit null, which is how a concept is cleared", () => {
    expect(withSanitisedConcept({ concept: null }).concept).toBeNull();
  });
});

describe("isConceptDraft", () => {
  it("is true only for a draft carrying a concept", () => {
    expect(isConceptDraft({ concept: buildConcept(idea()) })).toBe(true);
    expect(isConceptDraft({ concept: null })).toBe(false);
    expect(isConceptDraft({})).toBe(false);
    expect(isConceptDraft(null)).toBe(false);
    expect(isConceptDraft({ concept: { stage: "other" } })).toBe(false);
  });
});

describe("describeEventDate — a date that may not be a date yet", () => {
  it("shows a single day", () => {
    expect(describeEventDate({ startDate: "2026-10-31T12:00:00.000Z", endDate: "2026-10-31T12:00:00.000Z" })).toBe("Sat 31 Oct");
  });

  it("shows a range", () => {
    expect(describeEventDate({ startDate: "2026-08-12T12:00:00.000Z", endDate: "2026-08-16T12:00:00.000Z" })).toBe("12 Aug to 16 Aug");
  });

  it("shows a period with its day preference", () => {
    const concept = buildConcept(idea({ dateMode: "period", periodStart: "2026-10-25", periodEnd: "2026-11-01", dayPreference: "weekends" }));
    expect(describeEventDate({ concept })).toBe("25 Oct to 1 Nov, weekends");
    expect(describeEventDate({ concept: { ...concept, dayPreference: "any" } })).toBe("25 Oct to 1 Nov, any day");
  });

  it("says so when there is no date", () => {
    expect(describeEventDate({ concept: buildConcept(idea({ dateMode: "open" })) })).toBe("Date not decided yet");
    expect(describeEventDate({})).toBe("Date not decided yet");
    expect(describeEventDate({ startDate: null, concept: null })).toBe("Date not decided yet");
  });

  it("lets an exact date win over the period it grew out of", () => {
    const concept = buildConcept(idea({ dateMode: "period", periodStart: "2026-10-25", periodEnd: "2026-11-01" }));
    expect(describeEventDate({ startDate: "2026-10-31T12:00:00.000Z", endDate: "2026-10-31T12:00:00.000Z", concept })).toBe("Sat 31 Oct");
  });

  it("falls back for a period with a missing end", () => {
    expect(describeEventDate({ concept: { dateMode: "period", periodStart: "2026-10-25", periodEnd: null } })).toBe("Date not decided yet");
  });
});

describe("the draft table carries the concept", () => {
  it("has a concept column", () => {
    expect(Object.keys(getTableColumns(experienceDrafts))).toContain("concept");
  });

  it("accepts a concept through the draft insert schema, so no save path 400s on it", () => {
    const concept = buildConcept(idea({ dateMode: "open" }));
    expect(insertExperienceDraftSchema.partial().safeParse({ concept }).success).toBe(true);
    expect(insertExperienceDraftSchema.partial().safeParse({ concept: null }).success).toBe(true);
  });
});
