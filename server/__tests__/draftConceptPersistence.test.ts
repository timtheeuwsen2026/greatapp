import { beforeEach, describe, expect, it, vi } from "vitest";
import { experienceDrafts } from "@shared/schema";
import { EMPTY_IDEA, buildIdeaDraftFields } from "@shared/conceptIdea";

// The `concept` column is free-form json. Rather than teach every route that can
// write a draft about it (there are seven, and the client uses two), the
// storage layer every one of them goes through rebuilds it. These drive the real
// storage methods against a stand-in database and look at what would be written.

const database = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn() }));
vi.mock("../db", () => ({ db: database }));
import { DatabaseStorage } from "../storage";

let inserted: any;
let updated: any;

beforeEach(() => {
  inserted = undefined;
  updated = undefined;
  database.insert.mockImplementation((table: unknown) => {
    expect(table).toBe(experienceDrafts);
    return { values: (row: any) => { inserted = row; return { returning: async () => [{ id: "draft-1", ...row }] }; } };
  });
  database.update.mockImplementation((table: unknown) => {
    expect(table).toBe(experienceDrafts);
    return {
      set: (row: any) => {
        updated = row;
        return { where: () => ({ returning: async () => [{ id: "draft-1", ...row }] }) };
      },
    };
  });
});

const goodConcept = {
  stage: "concept", dateMode: "period", periodStart: "2026-10-25", periodEnd: "2026-11-01",
  dayPreference: "weekends", audience: "Runners", groupSizeMin: 10, groupSizeMax: 60,
  place: "Barceloneta", linkedVenueId: null,
};

describe("creating a draft", () => {
  it("keeps a real concept", async () => {
    await new DatabaseStorage().createExperienceDraft({ creatorId: "u1", title: "Rave", concept: goodConcept } as any);
    expect(inserted.concept).toEqual(goodConcept);
    expect(inserted.title).toBe("Rave");
  });

  it("rebuilds a hand-written concept, dropping what it should not carry", async () => {
    await new DatabaseStorage().createExperienceDraft({
      creatorId: "u1",
      concept: { stage: "concept", dateMode: "open", audience: { $ne: "" }, approved: true, groupSizeMax: 1e9 },
    } as any);
    expect(inserted.concept).toMatchObject({ stage: "concept", dateMode: "open", audience: null, groupSizeMax: 200 });
    expect(inserted.concept).not.toHaveProperty("approved");
  });

  it("does not let a stray object turn a normal draft into a concept", async () => {
    for (const junk of [{}, { dateMode: "open" }, "junk", 5, []]) {
      await new DatabaseStorage().createExperienceDraft({ creatorId: "u1", concept: junk } as any);
      expect(inserted.concept).toBeNull();
    }
  });

  it("leaves a draft started in the builder without a concept at all", async () => {
    await new DatabaseStorage().createExperienceDraft({ creatorId: "u1", title: "Retreat" } as any);
    expect(inserted).not.toHaveProperty("concept");
  });

  it("saves exactly what the idea flow sends", async () => {
    const sent = buildIdeaDraftFields({
      ...EMPTY_IDEA, title: "Halloween coffee rave", dateMode: "period",
      periodStart: "2026-10-25", periodEnd: "2026-11-01", dayPreference: "weekends",
      audience: "Runners", groupSizeMin: "10", groupSizeMax: "60",
    });
    await new DatabaseStorage().createExperienceDraft({ ...sent, creatorId: "u1" } as any);
    expect(inserted).toMatchObject({
      title: "Halloween coffee rave", startDate: null, endDate: null, maxParticipants: 60,
      category: "", venueType: "catalog",
    });
    expect(inserted.concept).toMatchObject({ dateMode: "period", periodStart: "2026-10-25", audience: "Runners" });
  });
});

describe("updating a draft", () => {
  it("rebuilds a concept on the way in", async () => {
    await new DatabaseStorage().updateExperienceDraft("draft-1", "u1", {
      concept: { ...goodConcept, audience: { $ne: "" }, evil: true },
    } as any);
    expect(updated.concept).toMatchObject({ stage: "concept", audience: null, dateMode: "period" });
    expect(updated.concept).not.toHaveProperty("evil");
    expect(updated.updatedAt).toBeInstanceOf(Date);
  });

  it("clears a concept that was sent as junk, and keeps an explicit null", async () => {
    await new DatabaseStorage().updateExperienceDraft("draft-1", "u1", { concept: {} } as any);
    expect(updated.concept).toBeNull();
    await new DatabaseStorage().updateExperienceDraft("draft-1", "u1", { concept: null } as any);
    expect(updated.concept).toBeNull();
  });

  it("does not touch the concept when an autosave does not mention it", async () => {
    // Builder autosaves of a draft that never had a concept must not write one,
    // and must not erase one either: an absent key leaves the column alone.
    await new DatabaseStorage().updateExperienceDraft("draft-1", "u1", { title: "New title" } as any);
    expect(updated).not.toHaveProperty("concept");
    expect(updated.title).toBe("New title");
  });

  it("passes an unchanged concept through an autosave intact", async () => {
    await new DatabaseStorage().updateExperienceDraft("draft-1", "u1", { title: "x", concept: goodConcept } as any);
    expect(updated.concept).toEqual(goodConcept);
  });
});
