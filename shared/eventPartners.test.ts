import { describe, it, expect } from "vitest";
import {
  brandBarterPerkSource,
  deriveLegacyPromotionFields,
  generatePartnerToken,
  partnerTermSummary,
  refCodeFromName,
  revenueShareEligible,
  revenueSharePartners,
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
    })).toContain("Enter a commission percentage above zero");

    expect(validatePartnerEntry({
      partnerType: "community", name: "Run Club", dealType: "milestone_barter", terms: {},
    })).toContain("Enter the attendee target for free access");

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
    expect(partnerTermSummary(partner())).toBe("15+ attendees → 2 free tickets");
    expect(partnerTermSummary(partner({
      dealType: "commission_per_ticket", terms: { commissionPct: 10 },
    }))).toBe("10% of ticket revenue");
    expect(partnerTermSummary(partner({
      dealType: "financial_sponsorship", terms: { amount: 250 },
    }), "€")).toBe("€250.00 towards the event");
  });

  it("says something useful when the number is not set yet", () => {
    expect(partnerTermSummary(partner({ terms: {} }))).toBe("Free access at a target headcount");
  });

  it("uses the singular for a single free ticket", () => {
    expect(partnerTermSummary(partner({
      terms: { milestoneAttendeeTarget: 10, milestoneRewardTickets: 1 },
    }))).toBe("10+ attendees → 1 free ticket");
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

  it("only emails an invite to a partner who actually gave an address", () => {
    const legacy = deriveLegacyPromotionFields([
      partner({ id: "a", source: "invite_link", email: "bar@example.com", name: "Beach Bar" }),
      partner({ id: "b", source: "invite_link", email: null, name: "Handle Only" }),
      partner({ id: "c", source: "platform", partnerUserId: "user-1", name: "On Great" }),
    ]);
    expect(legacy.promotionExternalInvites).toEqual([
      { id: "a", email: "bar@example.com", name: "Beach Bar", website: "" },
    ]);
    expect(legacy.promotionSelectedPartnerIds).toEqual(["user-1"]);
  });

  it("returns a clean set of fields for an event with no partners at all", () => {
    const legacy = deriveLegacyPromotionFields([]);
    expect(legacy.promotionDealType).toBeNull();
    expect(legacy.influencerPromotionEnabled).toBe(false);
    expect(legacy.promotionSelectedPartnerIds).toEqual([]);
    expect(legacy.promotionExternalInvites).toEqual([]);
  });
});
