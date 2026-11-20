import { describe, expect, it } from "vitest";
import {
  EMPTY_IDEA,
  buildCollabIdeaPayload,
  buildConcept,
  buildIdeaDraftFields,
  describeIdeaFor,
  describePeopleEarn,
  emptySlot,
  ideaInputFromDraft,
  needsToPost,
  sanitiseConcept,
  sanitiseSlot,
  validateIdeaSlot,
  type IdeaInput,
} from "./conceptIdea";

// Create flow point 26 and the audience update of 35: screens 2 to 6 of the idea phase.

const idea = (changes: Partial<IdeaInput> = {}): IdeaInput => ({ ...EMPTY_IDEA, title: "Halloween coffee rave", ...changes });

describe("the For line", () => {
  it("reads like Tim's example", () => {
    expect(describeIdeaFor(buildConcept(idea({
      interests: ["sport", "music_nightlife"], level: "anyone", groupSizeMin: "10", groupSizeMax: "60",
    })))).toBe("Sport and movement, music and nightlife · anyone · 10 to 60 people");
  });

  it("keeps typed words as typed, and falls back to an old draft's audience text", () => {
    expect(describeIdeaFor(buildConcept(idea({ interests: ["food_drink", "other"], interestOther: "Board games" }))))
      .toBe("Food and drink, Board games · anyone");
    expect(describeIdeaFor({ stage: "concept", audience: "Runners", groupSizeMax: 30 } as any)).toBe("Runners · Up to 30 people");
  });
});

describe("slots", () => {
  it("start the way most organisers fill them", () => {
    expect(emptySlot("venue")).toMatchObject({ board: true, direct: false, inviteSource: "platform" });
    expect(emptySlot("community")).toMatchObject({ board: false, direct: true, inviteSource: "link", earn: "per_person", amountPerPerson: 2 });
  });

  it("keep only their own need's fields", () => {
    const slot = sanitiseSlot("sponsor", {
      board: true, need: "  Drinks ", giveBack: "Logo", kindOfSpace: "Rooftop", earn: "barter", dealPreferences: ["barter"],
    });
    expect(slot).toMatchObject({ need: "Drinks", giveBack: "Logo", kindOfSpace: null, earn: null, dealPreferences: [] });
  });

  it("drop an unknown deal, a bad email and an amount nobody meant", () => {
    expect(sanitiseSlot("venue", { dealPreferences: ["barter", "free_beer"] }).dealPreferences).toEqual(["barter"]);
    expect(sanitiseSlot("community", { inviteSource: "email", inviteEmail: "not an email" }).inviteEmail).toBeNull();
    expect(sanitiseSlot("community", { earn: "per_person", amountPerPerson: "-3" }).amountPerPerson).toBeNull();
    expect(sanitiseSlot("community", { earn: "per_person", amountPerPerson: "2,5" }).amountPerPerson).toBe(2.5);
    expect(sanitiseSlot("community", { earn: "fixed_fee", amountPerPerson: 5 }).amountPerPerson).toBeNull();
  });

  it("are dropped when their need is unticked", () => {
    const concept = sanitiseConcept({ stage: "concept", needs: ["venue"], slots: { venue: { board: true }, sponsor: { board: true } } });
    expect(Object.keys(concept!.slots!)).toEqual(["venue"]);
  });

  it("need a way to be found, unless it is the organiser's own community", () => {
    expect(validateIdeaSlot("venue", { ...emptySlot("venue"), board: false }).find).toBeTruthy();
    expect(validateIdeaSlot("community", { ...emptySlot("community"), direct: false, ownCommunity: true }).find).toBeUndefined();
  });

  it("do not ask again for an invite that was already sent", () => {
    const sent = { ...emptySlot("sponsor"), direct: true, inviteUrl: "https://great.test/collab-invite/x" };
    expect(validateIdeaSlot("sponsor", sent)).toEqual({});
  });
});

describe("describePeopleEarn", () => {
  it("names the amount per person who checks in, in euros", () => {
    expect(describePeopleEarn({ earn: "per_person", amountPerPerson: 2 })).toBe("€2.00 per person who checks in");
    expect(describePeopleEarn({ earn: "free_access", amountPerPerson: null })).toBe("Free access");
  });
});

describe("the Collab board posting", () => {
  const withSlots = idea({
    dateMode: "period", periodStart: "2026-11-20", periodEnd: "2026-11-30", place: "Barceloneta, Barcelona",
    interests: ["sport"], groupSizeMin: "10", groupSizeMax: "60",
    needs: ["venue", "community", "sponsor"],
    slots: {
      venue: { ...emptySlot("venue"), kindOfSpace: "Beach bar", dealPreferences: ["revenue_split"] },
      community: { ...emptySlot("community"), inviteSource: "email", inviteEmail: "club@example.com" },
      sponsor: { ...emptySlot("sponsor"), board: false, direct: false },
    },
  });

  it("is nothing when nothing is looked for", () => {
    expect(buildCollabIdeaPayload(idea({ needs: [] }), "draft-1")).toBeNull();
    expect(buildCollabIdeaPayload(idea({ needs: ["community"], slots: { community: { ...emptySlot("community"), direct: false, ownCommunity: true } } }), "d")).toBeNull();
  });

  it("lists what the board should find and carries the rest for the invites", () => {
    const payload = buildCollabIdeaPayload(withSlots, "draft-1")!;
    expect(needsToPost(withSlots)).toEqual(["venue", "community"]);
    expect(payload).toMatchObject({
      title: "Halloween coffee rave",
      seekingPartnerTypes: ["venue"],
      typeDetails: { venue: { kindOfSpace: "Beach bar" }, community: { earn: "€2.00 per person who checks in" } },
      dealPreferences: ["revenue_split"],
      audience: "Sport and movement · anyone · 10 to 60 people",
      city: "Barceloneta, Barcelona",
      estimatedStart: "2026-11-20T12:00:00.000Z",
      estimatedEnd: "2026-11-30T12:00:00.000Z",
      listed: true,
      experienceDraftId: "draft-1",
    });
  });

  it("is kept off the board when every slot is invite-only", () => {
    const inviteOnly = idea({ needs: ["community"], slots: { community: emptySlot("community") } });
    expect(buildCollabIdeaPayload(inviteOnly, "draft-1")).toMatchObject({ listed: false, seekingPartnerTypes: ["community"] });
  });
});

describe("a draft and back", () => {
  it("only takes a full photo URL as the cover", () => {
    expect(buildIdeaDraftFields(idea({ photoUrl: "https://cdn.test/a.jpg" })).coverImageUrl).toBe("https://cdn.test/a.jpg");
    expect(buildIdeaDraftFields(idea({ photoUrl: "/objects/a.jpg" })).coverImageUrl).toBe("");
  });

  it("reopens with every answer", () => {
    const answers = idea({
      dateMode: "exact", exactStart: "2026-11-28", startTime: "10:00", interests: ["sport"], level: "experienced",
      needs: ["venue"], slots: { venue: { ...emptySlot("venue"), kindOfSpace: "Rooftop" } }, note: "Bring towels",
      photoUrl: "https://cdn.test/a.jpg", collabIdeaId: "idea-1",
    });
    const fields = buildIdeaDraftFields(answers);
    const back = ideaInputFromDraft({ ...fields, startDate: fields.startDate, endDate: fields.endDate })!;
    expect(back).toMatchObject({
      title: "Halloween coffee rave", dateMode: "exact", exactStart: "2026-11-28", exactEnd: "", startTime: "10:00",
      interests: ["sport"], level: "experienced", needs: ["venue"], note: "Bring towels",
      photoUrl: "https://cdn.test/a.jpg", collabIdeaId: "idea-1",
    });
    expect(back.slots.venue).toMatchObject({ kindOfSpace: "Rooftop", board: true });
  });

  it("is nothing for a draft that did not start as an idea", () => {
    expect(ideaInputFromDraft({ title: "Built straight away", concept: null })).toBeNull();
  });
});
