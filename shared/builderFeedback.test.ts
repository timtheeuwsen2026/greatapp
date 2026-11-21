import { describe, expect, it } from "vitest";
import { ALL_EVENT_CATEGORY_VALUES, EVENT_CATEGORIES, categoryLabel, currentCategory } from "./eventCategories";
import {
  EMPTY_IDEA,
  buildCollabIdeaPayload,
  buildIdeaDraftFields,
  describePeopleEarn,
  describeServicePay,
  emptySlot,
  ideaInputFromDraft,
  sanitiseSlot,
  validateIdeaBasics,
  validateIdeaSlot,
  type IdeaInput,
} from "./conceptIdea";
import { searchRank } from "./eventSearch";
import { categoryEnum } from "./schema";

// Tim's builder feedback (66.42 to 66.46), 22 Nov 2026.

const idea = (changes: Partial<IdeaInput> = {}): IdeaInput => ({ ...EMPTY_IDEA, title: "Sunset run", ...changes });

describe("one category list (66.46)", () => {
  it("is the idea builder's eight interests, with Tim's names", () => {
    expect(EVENT_CATEGORIES.map((category) => category.label)).toEqual([
      "Sport and movement", "Mind and body", "Food and drinks", "Music and nightlife",
      "Learning and creativity", "Travel and adventure", "Meeting new people", "Something else",
    ]);
  });

  it("is accepted by the database list, next to the six old values", () => {
    for (const value of ALL_EVENT_CATEGORY_VALUES) expect(categoryEnum.enumValues).toContain(value);
  });

  it("reads an old event's category as its nearest new one", () => {
    expect(categoryLabel("sports_wellness")).toBe("Sport and movement");
    expect(categoryLabel("community_social")).toBe("Meeting new people");
    expect(currentCategory("retreats")).toBe("travel");
    expect(categoryLabel("food_drink")).toBe("Food and drinks");
    expect(categoryLabel(null)).toBe("");
  });

  it("takes the idea's first interest as the event's category, without asking", () => {
    expect(buildIdeaDraftFields(idea({ interests: ["mind_body", "sport"] })).category).toBe("mind_body");
    expect(buildIdeaDraftFields(idea()).category).toBe("");
  });

  it("lets search find an event by the category name people see", () => {
    expect(searchRank({ title: "Sunday 5k", category: "sports_wellness" }, "sport movement")).toBe(2);
    expect(searchRank({ title: "Tapas night", category: "food_drink" }, "drinks")).toBe(2);
  });
});

describe("end time in the idea flow (A2)", () => {
  const exact = { dateMode: "exact" as const, exactStart: "2026-12-05" };

  it("is optional, and saved with the date", () => {
    expect(validateIdeaBasics(idea(exact), "2026-11-22")).toEqual({});
    const fields = buildIdeaDraftFields(idea({ ...exact, startTime: "09:30", endTime: "11:00" }));
    expect(fields).toMatchObject({ startTime: "09:30", endTime: "11:00", type: "one-day" });
  });

  it("must come after the start on one day, but not on a trip", () => {
    expect(validateIdeaBasics(idea({ ...exact, startTime: "18:00", endTime: "09:00" }), "2026-11-22").endTime).toBeTruthy();
    expect(validateIdeaBasics(idea({ ...exact, exactEnd: "2026-12-07", startTime: "18:00", endTime: "09:00" }), "2026-11-22")).toEqual({});
    expect(buildIdeaDraftFields(idea({ ...exact, exactEnd: "2026-12-07" })).type).toBe("multi-day");
  });

  it("comes back when the idea is reopened", () => {
    const fields = buildIdeaDraftFields(idea({ ...exact, startTime: "09:30", endTime: "11:00" }));
    expect(ideaInputFromDraft(fields)).toMatchObject({ startTime: "09:30", endTime: "11:00" });
  });
});

describe("partner screens (66.36 names)", () => {
  it("offers communities the builder's deals, with a percentage for commission", () => {
    const slot = sanitiseSlot("community", { earn: "commission_per_ticket", commissionPct: "10%" });
    expect(slot).toMatchObject({ earn: "commission_per_ticket", commissionPct: 10, amountPerPerson: null });
    expect(describePeopleEarn(slot)).toBe("Commission per ticket: 10%");
    expect(describePeopleEarn({ earn: "milestone_barter", amountPerPerson: null })).toBe("Bring people, get a reward");
    expect(validateIdeaSlot("community", { ...emptySlot("community"), earn: "commission_per_ticket", commissionPct: null }).commissionPct).toBeTruthy();
  });

  it("still reads ideas saved with the first version's answers", () => {
    expect(describePeopleEarn(sanitiseSlot("community", { earn: "free_access" }))).toBe("Free access");
  });

  it("asks how a service provider is paid, the fee being optional", () => {
    const slot = sanitiseSlot("service_provider", { servicePay: "fee", feeAmount: "750" });
    expect(describeServicePay(slot)).toBe("Fee: €750.00");
    expect(describeServicePay(sanitiseSlot("service_provider", { servicePay: "content_license" }))).toBe("Content licence");
    expect(validateIdeaSlot("service_provider", { ...emptySlot("service_provider"), servicePay: "fee", feeAmount: null })).toEqual({});
    expect(validateIdeaSlot("service_provider", { ...emptySlot("service_provider"), servicePay: "fee", feeAmount: "lots" as any }).feeAmount).toBeTruthy();
  });

  it("puts the payment on the Collab board posting", () => {
    const payload = buildCollabIdeaPayload(idea({
      needs: ["service_provider"],
      slots: { service_provider: { ...emptySlot("service_provider"), service: "Photographer", servicePay: "barter" } },
    }), "draft-1")!;
    expect(payload.typeDetails.service_provider).toEqual({ service: "Photographer", pay: "Barter" });
  });
});
