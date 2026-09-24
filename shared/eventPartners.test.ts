import { describe, it, expect } from "vitest";
import {
  brandBarterPerkSource,
  dealTypesForPartnerType,
  deriveLegacyPromotionFields,
  generatePartnerToken,
  milestoneRewardAt,
  partnerBringsLine,
  partnerDealTier,
  partnerTermSummary,
  refCodeFromName,
  revenueShareEligible,
  revenueSharePartners,
  sanitisePartnerEntry,
  sanitisePartnerEntries,
  totalPartnerSharePct,
  validatePartnerEntry,
  type EventPartnerEntry,
} from "./eventPartners";

function partner(overrides: Partial<EventPartnerEntry> = {}): EventPartnerEntry {
  return {
    id: "p1",
    partnerType: "community",
    name: "Good Soles Run Club",
    partnerUserId: null,
    email: null,
    source: "platform",
    dealType: "milestone_barter",
    terms: { milestoneAttendeeTarget: 15, milestoneRewardTickets: 2 },
    status: "invited",
    inviteToken: null,
    refCode: null,
    ...overrides,
  };
}

describe("revenue-share eligibility — the one question Pricing asks", () => {
  it("only Commission per Ticket pulls from ticket revenue", () => {
    expect(revenueShareEligible("commission_per_ticket")).toBe(true);
    expect(revenueShareEligible("milestone_barter")).toBe(false);
    expect(revenueShareEligible("brand_barter")).toBe(false);
    expect(revenueShareEligible("financial_sponsorship")).toBe(false);
    expect(revenueShareEligible("content_license")).toBe(false);
  });

  it("treats an unknown deal type as not eligible", () => {
    // A deal the system does not recognise must never be handed a slice of
    // ticket revenue by default.
    expect(revenueShareEligible("some_new_deal")).toBe(false);
    expect(revenueShareEligible(undefined)).toBe(false);
  });

  it("filters a mixed roster down to the ones that touch tickets", () => {
    const roster = [
      partner({ id: "a", dealType: "milestone_barter" }),
      partner({ id: "b", partnerType: "affiliate", dealType: "commission_per_ticket", terms: { commissionPct: 10 } }),
      partner({ id: "c", partnerType: "sponsor_brand", dealType: "brand_barter", terms: { productDescription: "50 cans" } }),
    ];
    expect(revenueSharePartners(roster).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("sums only the eligible partners' percentages", () => {
    const roster = [
      partner({ id: "a", dealType: "commission_per_ticket", terms: { commissionPct: 10 } }),
      partner({ id: "b", dealType: "commission_per_ticket", terms: { commissionPct: 7.5 } }),
      // A barter partner with a stray percentage on its terms must not count:
      // it is settled outside tickets whatever that field says.
      partner({ id: "c", dealType: "milestone_barter", terms: { commissionPct: 90 } as any }),
    ];
    expect(totalPartnerSharePct(roster)).toBe(17.5);
  });
});

describe("sanitisePartnerEntries — the boundary the whole model relies on", () => {
  it("drops an entry whose deal type it does not recognise", () => {
    // Coercing it would silently re-type a partner into a deal nobody agreed.
    const cleaned = sanitisePartnerEntries([
      { partnerType: "community", name: "Run Club", dealType: "mystery_deal" },
    ]);
    expect(cleaned).toEqual([]);
  });

  it("drops an entry with no partner type or no name", () => {
    expect(sanitisePartnerEntries([
      { name: "Nameless type", dealType: "brand_barter" },
      { partnerType: "sponsor_brand", dealType: "brand_barter" },
      { partnerType: "sponsor_brand", name: "   ", dealType: "brand_barter" },
    ])).toEqual([]);
  });

  it("keeps only the terms the chosen deal actually uses", () => {
    const [cleaned] = sanitisePartnerEntries([{
      partnerType: "sponsor_brand",
      name: "Beach Bar",
      dealType: "brand_barter",
      terms: {
        productDescription: "50 cans of cold brew",
        // Left over from a deal type the organiser switched away from. Kept, it
        // would show up in the ticket-revenue waterfall.
        commissionPct: 40,
        milestoneAttendeeTarget: 15,
      },
    }]);
    expect(cleaned.terms.productDescription).toBe("50 cans of cold brew");
    expect(cleaned.terms.commissionPct).toBeUndefined();
    expect(cleaned.terms.milestoneAttendeeTarget).toBeUndefined();
  });

  it("clamps a commission percentage into range", () => {
    const [over] = sanitisePartnerEntries([{
      partnerType: "affiliate", name: "Ana", dealType: "commission_per_ticket",
      terms: { commissionPct: 250 },
    }]);
    const [under] = sanitisePartnerEntries([{
      partnerType: "affiliate", name: "Ana", dealType: "commission_per_ticket",
      terms: { commissionPct: -5 },
    }]);
    expect(over.terms.commissionPct).toBe(100);
    expect(under.terms.commissionPct).toBe(0);
  });

  it("defaults an unrecognised status to draft rather than confirmed", () => {
    const [cleaned] = sanitisePartnerEntries([{
      partnerType: "community", name: "Run Club", dealType: "milestone_barter",
      status: "definitely_agreed",
    }]);
    expect(cleaned.status).toBe("draft");
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(sanitisePartnerEntries(null)).toEqual([]);
    expect(sanitisePartnerEntries("community")).toEqual([]);
    expect(sanitisePartnerEntries({ partnerType: "community" })).toEqual([]);
  });

  it("lower-cases an invite email so two spellings are one address", () => {
    const [cleaned] = sanitisePartnerEntries([{
      partnerType: "community", name: "Run Club", dealType: "milestone_barter",
      source: "invite_link", email: "  Hello@GoodSoles.COM ",
    }]);
    expect(cleaned.email).toBe("hello@goodsoles.com");
  });
});

describe("validatePartnerEntry", () => {
  it("names the field it is waiting on, per deal type", () => {
    expect(validatePartnerEntry({
      partnerType: "affiliate", name: "Ana", dealType: "commission_per_ticket", terms: {},
    })).toContain("Enter a commission percentage above zero and at most 100");

    expect(validatePartnerEntry({
      partnerType: "community", name: "Run Club", dealType: "milestone_barter", terms: {},
    })).toContain("Enter how many people they have to bring");

    expect(validatePartnerEntry({
      partnerType: "sponsor_brand", name: "Beach Bar", dealType: "brand_barter", terms: {},
    })).toContain("Describe what the brand supplies");
  });

  it("accepts a complete entry", () => {
    expect(validatePartnerEntry(partner())).toEqual([]);
  });

  it("asks for a fee only when the licence is a flat fee", () => {
    expect(validatePartnerEntry({
      partnerType: "service_provider", name: "Marta", dealType: "content_license",
      terms: { licenseSubtype: "free_attribution" },
    })).toEqual([]);

    expect(validatePartnerEntry({
      partnerType: "service_provider", name: "Marta", dealType: "content_license",
      terms: { licenseSubtype: "flat_fee" },
    })).toContain("Enter the flat fee for the licence");
  });
});

describe("partnerTermSummary", () => {
  it("states the key term in one line, per deal", () => {
    expect(partnerTermSummary(partner())).toBe("2 × free tickets per 15 people brought");
    expect(partnerTermSummary(partner({
      dealType: "commission_per_ticket", terms: { commissionPct: 10 },
    }))).toBe("10% of ticket sales through their link");
    expect(partnerTermSummary(partner({
      dealType: "financial_sponsorship", terms: { amount: 250 },
    }), "€")).toBe("€250.00 towards the event");
  });

  it("says something useful when the number is not set yet", () => {
    expect(partnerTermSummary(partner({ terms: {} }))).toBe("Reward per person brought");
  });

  it("uses the singular for one person and one ticket", () => {
    expect(partnerTermSummary(partner({
      terms: { milestoneAttendeeTarget: 1, milestoneRewardTickets: 1 },
    }))).toBe("1 × free ticket per person brought");
  });

  // Point 37: the reward is very often not a ticket at all, and a fixed
  // threshold pays a community that brought sixty people the same as one that
  // brought fifteen.
  it("reads the reward back in the organiser's own words", () => {
    expect(partnerTermSummary(partner({
      terms: {
        milestoneAttendeeTarget: 1,
        milestoneRewardTickets: 1,
        milestoneRewardDescription: "T-shirt from Strong X",
      },
    }))).toBe("1 × T-shirt from Strong X per person brought");
  });

  it("scales with the headcount rather than stopping at the threshold", () => {
    const oneEach = { milestoneAttendeeTarget: 1, milestoneRewardTickets: 1 };
    expect(milestoneRewardAt(oneEach, 20)).toBe(20);
    // Two per ten: twenty-nine people is still only five, because the sixth
    // rung has not been reached.
    expect(milestoneRewardAt({ milestoneAttendeeTarget: 10, milestoneRewardTickets: 2 }, 29)).toBe(4);
    expect(milestoneRewardAt(oneEach, 0)).toBe(0);
  });
});

describe("deal availability by partner type", () => {
  // Point 39: offered to a Community, Financial Sponsorship reads as if the
  // run club has to pay to attend.
  it("keeps Financial Sponsorship to Sponsor / Brand", () => {
    expect(dealTypesForPartnerType("sponsor_brand").map((deal) => deal.id))
      .toContain("financial_sponsorship");
    for (const type of ["community", "service_provider", "affiliate"] as const) {
      expect(dealTypesForPartnerType(type).map((deal) => deal.id))
        .not.toContain("financial_sponsorship");
    }
  });

  it("leaves every other combination alone", () => {
    expect(dealTypesForPartnerType("community").map((deal) => deal.id)).toEqual([
      "member_discount",
      "commission_per_ticket",
      "milestone_barter",
      "brand_barter",
      "content_license",
    ]);
  });

  // An entry saved before the restriction existed still has to render on the
  // event it belongs to. It just cannot be re-agreed.
  it("blocks a restricted combination at the point of saving, not on read", () => {
    const saved = {
      partnerType: "community" as const,
      name: "Run Club",
      dealType: "financial_sponsorship" as const,
      terms: { amount: 250 },
    };
    expect(validatePartnerEntry(saved).join(". "))
      .toContain("not available for a Community partner");
    expect(sanitisePartnerEntry({ ...saved, id: "p1", source: "platform", status: "draft" }))
      .toMatchObject({ dealType: "financial_sponsorship" });
  });
});

describe("deal tiers and brings-lines", () => {
  // Point 35: "15%", "€100" and "product for exposure" read as three
  // comparable numbers in one list, and they are not comparable at all.
  it("groups a deal by how it settles", () => {
    expect(partnerDealTier({ dealType: "commission_per_ticket" })).toBe("per_unit");
    expect(partnerDealTier({ dealType: "financial_sponsorship" })).toBe("flat");
    expect(partnerDealTier({ dealType: "brand_barter" })).toBe("barter");
    expect(partnerDealTier({ dealType: "milestone_barter" })).toBe("barter");
    // A content licence is whichever it was agreed as.
    expect(partnerDealTier({ dealType: "content_license", terms: { licenseSubtype: "flat_fee" } }))
      .toBe("flat");
    expect(partnerDealTier({ dealType: "content_license", terms: { licenseSubtype: "barter" } }))
      .toBe("barter");
  });

  it("says what a partner brings, preferring the organiser's own words", () => {
    expect(partnerBringsLine({ partnerType: "community", dealType: "milestone_barter" }))
      .toBe("its members");
    expect(partnerBringsLine({ partnerType: "affiliate", dealType: "commission_per_ticket" }))
      .toBe("ticket sales");
    expect(partnerBringsLine({
      partnerType: "sponsor_brand",
      dealType: "brand_barter",
      terms: { productDescription: "50 cans of cold brew" },
    })).toBe("50 cans of cold brew");
  });
});

describe("brandBarterPerkSource — reusing a sponsor's product as the perk", () => {
  it("finds the first brand barter partner that actually describes a product", () => {
    const roster = [
      partner({ id: "a", dealType: "brand_barter", terms: {} }),
      partner({ id: "b", name: "Beach Bar", dealType: "brand_barter", terms: { productDescription: "50 cans" } }),
    ];
    expect(brandBarterPerkSource(roster)?.name).toBe("Beach Bar");
  });

  it("offers nothing when no partner has a product to give", () => {
    expect(brandBarterPerkSource([partner()])).toBeNull();
    expect(brandBarterPerkSource([])).toBeNull();
  });
});

describe("tokens and ref codes", () => {
  it("mints url-safe tokens of the asked-for length", () => {
    const token = generatePartnerToken(24);
    expect(token).toHaveLength(24);
    expect(token).toMatch(/^[a-z0-9]+$/);
  });

  it("does not repeat itself across calls", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generatePartnerToken()));
    expect(tokens.size).toBe(50);
  });

  it("turns a name into a handle a partner would recognise", () => {
    expect(refCodeFromName("Good Soles Run Club")).toBe("goodsolesrunclub");
    expect(refCodeFromName("Noor Coffee", "2")).toBe("noorcoffee2");
  });

  it("falls back to a token when a name has nothing usable in it", () => {
    const code = refCodeFromName("!!! ???");
    expect(code).toMatch(/^[a-z0-9]{10}$/);
  });
});

describe("deriveLegacyPromotionFields — what the payout engine still reads", () => {
  it("reports the affiliate's commission, not whichever partner happens to be first", () => {
    // A community on barter listed above an affiliate on commission must not
    // hide the commission: that is the deal that moves money.
    const legacy = deriveLegacyPromotionFields([
      partner({ id: "a", dealType: "milestone_barter" }),
      partner({
        id: "b", partnerType: "affiliate", dealType: "commission_per_ticket",
        terms: { commissionPct: 12, showInExperiencePool: true },
      }),
    ]);
    expect(legacy.promotionDealType).toBe("commission_per_ticket");
    expect(legacy.influencerPromotionEnabled).toBe(true);
    expect(legacy.influencerCommissionPct).toBe(12);
  });

  it("still reports the barter terms alongside it", () => {
    const legacy = deriveLegacyPromotionFields([
      partner({ id: "a", dealType: "milestone_barter", terms: { milestoneAttendeeTarget: 15, milestoneRewardTickets: 2 } }),
      partner({ id: "b", partnerType: "affiliate", dealType: "commission_per_ticket", terms: { commissionPct: 10 } }),
      partner({ id: "c", partnerType: "sponsor_brand", dealType: "brand_barter", terms: { productDescription: "50 cans" } }),
    ]);
    expect(legacy.promotionMilestoneAttendeeTarget).toBe(15);
    expect(legacy.promotionMilestoneRewardTickets).toBe(2);
    expect(legacy.promotionBrandPitch).toBe("50 cans");
  });

  it("leaves pool visibility alone when there is no affiliate to own the toggle", () => {
    // Returning false here would silently pull an event out of the Experience
    // Pool the organiser had deliberately opted into.
    expect(deriveLegacyPromotionFields([partner()]).promoterEnabled).toBeNull();
    expect(deriveLegacyPromotionFields([]).promoterEnabled).toBeNull();
  });

  it("mirrors the affiliate's own Experience Pool toggle when there is one", () => {
    expect(deriveLegacyPromotionFields([partner({
      partnerType: "affiliate", dealType: "commission_per_ticket",
      terms: { commissionPct: 10, showInExperiencePool: false },
    })]).promoterEnabled).toBe(false);
  });

  it("reports no legacy deal type for a content licence, which the old engine cannot settle", () => {
    const legacy = deriveLegacyPromotionFields([partner({
      partnerType: "service_provider", dealType: "content_license",
      terms: { licenseSubtype: "free_attribution" },
    })]);
    expect(legacy.promotionDealType).toBeNull();
    expect(legacy.influencerCommissionPct).toBe(0);
  });

  it("leaves modern invitations to the per-partner flow instead of sending a second legacy offer", () => {
    const legacy = deriveLegacyPromotionFields([
      partner({ id: "a", source: "invite_link", email: "bar@example.com", name: "Beach Bar" }),
      partner({ id: "b", source: "invite_link", email: null, name: "Handle Only" }),
      partner({ id: "c", source: "platform", partnerUserId: "user-1", name: "On Great" }),
    ]);
    expect(legacy.promotionExternalInvites).toEqual([]);
    expect(legacy.promotionSelectedPartnerIds).toEqual([]);
  });

  it("returns a clean set of fields for an event with no partners at all", () => {
    const legacy = deriveLegacyPromotionFields([]);
    expect(legacy.promotionDealType).toBeNull();
    expect(legacy.influencerPromotionEnabled).toBe(false);
    expect(legacy.promotionSelectedPartnerIds).toEqual([]);
    expect(legacy.promotionExternalInvites).toEqual([]);
  });
});
