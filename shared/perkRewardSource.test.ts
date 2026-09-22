import { describe, it, expect } from "vitest";
import {
  BARTER_ALLOCATION_EXPLANATION,
  PERK_SOURCE_SELF,
  PERK_SOURCE_VENUE,
  listPerkRewardSources,
  partnersAllocatedToHost,
  perkRewardSourceFields,
  resolvePerkRewardSourceId,
  resolvePerkSourcePartner,
} from "./perkRewardSource";
import {
  partnerBarterAllocation,
  partnerFundsParticipantPerk,
  partnerHasBarterSupply,
  sanitisePartnerEntry,
  type EventPartnerEntry,
} from "./eventPartners";

// Point 55. The perk's reward source was a boolean — is this the venue's to
// give? The deal that broke it was a Service Provider's 1-on-1 session, which
// no venue stocks and that field could not express at all.

function partner(overrides: Partial<EventPartnerEntry> = {}): EventPartnerEntry {
  return {
    id: "chris",
    partnerType: "service_provider",
    name: "Chris",
    source: "platform",
    dealType: "brand_barter",
    terms: { productDescription: "5 × 1-on-1 sessions", barterAllocation: "participants" },
    status: "invited",
    ...overrides,
  };
}

describe("which partners can supply a participant reward", () => {
  it("lists a barter partner the organiser pointed at participants", () => {
    const options = listPerkRewardSources({ partners: [partner()], venueName: "Bandido" });

    expect(options.map((option) => option.id))
      .toEqual([PERK_SOURCE_SELF, PERK_SOURCE_VENUE, "chris"]);
    expect(options[2].supply).toBe("5 × 1-on-1 sessions");
  });

  it("offers funding it yourself even on an event with no partners and no venue", () => {
    const options = listPerkRewardSources({ partners: [], venueName: "" });

    expect(options).toHaveLength(1);
    expect(options[0].id).toBe(PERK_SOURCE_SELF);
    expect(options[0].requiresApproval).toBe(false);
  });

  it("leaves out a partner whose supply is paying the recruiting host", () => {
    const host = partner({ terms: { productDescription: "20 T-shirts", barterAllocation: "host" } });

    expect(listPerkRewardSources({ partners: [host] }).map((option) => option.id))
      .toEqual([PERK_SOURCE_SELF]);
    // ...and says so, rather than leaving the organiser hunting for a partner
    // they know perfectly well they added.
    expect(partnersAllocatedToHost({ partners: [host] })).toEqual([
      { id: "chris", name: "Chris" },
    ]);
  });

  it("leaves out a partner who is not on barter at all", () => {
    const affiliate = partner({
      partnerType: "affiliate",
      dealType: "commission_per_ticket",
      terms: { commissionPct: 10, barterAllocation: "participants" },
    });

    expect(partnerHasBarterSupply(affiliate)).toBe(false);
    expect(listPerkRewardSources({ partners: [affiliate] }).map((option) => option.id))
      .toEqual([PERK_SOURCE_SELF]);
    // Nor does it turn up as a host allocation — there is no supply either way.
    expect(partnersAllocatedToHost({ partners: [affiliate] })).toEqual([]);
  });

  it("leaves out a partner who declined", () => {
    expect(listPerkRewardSources({ partners: [partner({ status: "declined" })] })
      .map((option) => option.id)).toEqual([PERK_SOURCE_SELF]);
  });

  it("treats a content licence as a supply only when it settles as barter", () => {
    const asBarter = partner({
      dealType: "content_license",
      terms: { licenseSubtype: "barter", barterAllocation: "participants" },
    });
    const asFee = partner({
      dealType: "content_license",
      terms: { licenseSubtype: "flat_fee", amount: 200, barterAllocation: "participants" },
    });

    expect(partnerHasBarterSupply(asBarter)).toBe(true);
    expect(partnerHasBarterSupply(asFee)).toBe(false);
  });

  it("says a confirmed partner needs no further approval", () => {
    const [source] = listPerkRewardSources({ partners: [partner({ status: "confirmed" })] })
      .filter((option) => option.kind === "partner");

    expect(source.requiresApproval).toBe(false);
  });
});

describe("one supply, one reward", () => {
  it("defaults to the recruiting host, which is what every older deal meant", () => {
    const saved = sanitisePartnerEntry({
      partnerType: "community",
      name: "TriBarna",
      dealType: "brand_barter",
      terms: { productDescription: "20 T-shirts" },
    });

    expect(saved?.terms.barterAllocation).toBe("host");
    expect(partnerFundsParticipantPerk(saved)).toBe(false);
  });

  it("stores the allocation only on a deal that has a supply to point", () => {
    const commission = sanitisePartnerEntry({
      partnerType: "affiliate",
      name: "Ana",
      dealType: "commission_per_ticket",
      terms: { commissionPct: 12, barterAllocation: "participants" },
    });

    expect(commission?.terms.barterAllocation).toBeUndefined();
    expect(partnerBarterAllocation(commission)).toBe("host");
  });

  it("reads an unrecognised allocation as the host rather than guessing", () => {
    const odd = sanitisePartnerEntry({
      partnerType: "sponsor_brand",
      name: "Strong X",
      dealType: "brand_barter",
      terms: { productDescription: "20 T-shirts", barterAllocation: "both" },
    });

    expect(odd?.terms.barterAllocation).toBe("host");
  });

  it("explains why it is one or the other", () => {
    expect(BARTER_ALLOCATION_EXPLANATION).toContain("not both");
  });
});

describe("reading and writing the chosen source", () => {
  it("reads the two stored fields back as one choice", () => {
    expect(resolvePerkRewardSourceId(null)).toBe(PERK_SOURCE_SELF);
    expect(resolvePerkRewardSourceId({ participantReferralVenueBacked: true }))
      .toBe(PERK_SOURCE_VENUE);
    expect(resolvePerkRewardSourceId({ participantReferralRewardSourcePartnerId: "chris" }))
      .toBe("chris");
  });

  it("never writes two funders at once", () => {
    expect(perkRewardSourceFields("chris")).toEqual({
      participantReferralVenueBacked: false,
      participantReferralRewardSourcePartnerId: "chris",
    });
    expect(perkRewardSourceFields(PERK_SOURCE_VENUE)).toEqual({
      participantReferralVenueBacked: true,
      participantReferralRewardSourcePartnerId: null,
    });
    expect(perkRewardSourceFields(PERK_SOURCE_SELF)).toEqual({
      participantReferralVenueBacked: false,
      participantReferralRewardSourcePartnerId: null,
    });
  });

  it("prefers the partner when an older draft carries both", () => {
    expect(resolvePerkRewardSourceId({
      participantReferralVenueBacked: true,
      participantReferralRewardSourcePartnerId: "chris",
    })).toBe("chris");
  });

  it("finds the named partner, and stops finding them once they stop backing it", () => {
    const partners = [partner()];

    expect(resolvePerkSourcePartner({
      participantReferralRewardSourcePartnerId: "chris",
      partners,
    })?.name).toBe("Chris");

    // Re-pointed at the host: the supply is committed elsewhere now.
    expect(resolvePerkSourcePartner({
      participantReferralRewardSourcePartnerId: "chris",
      partners: [partner({ terms: { productDescription: "x", barterAllocation: "host" } })],
    })).toBeNull();

    // Removed from the event entirely.
    expect(resolvePerkSourcePartner({
      participantReferralRewardSourcePartnerId: "chris",
      partners: [],
    })).toBeNull();
  });
});
