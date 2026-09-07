import { describe, it, expect } from "vitest";
import {
  dealTypesConflict,
  findDealConflicts,
  getConflictingDealTypes,
  getDealConflictReason,
} from "./dealExclusions";

// Point 10: a partner must not both pay into an event and take a cut of the
// same money back out.

describe("deals that cannot run together", () => {
  it("keeps sponsorship and per-ticket commission apart", () => {
    expect(dealTypesConflict("financial_sponsorship", "commission_per_ticket")).toBe(true);
    // Order must not matter — either one can be chosen first.
    expect(dealTypesConflict("commission_per_ticket", "financial_sponsorship")).toBe(true);
  });

  it("keeps milestone barter and per-ticket commission apart", () => {
    expect(dealTypesConflict("milestone_barter", "commission_per_ticket")).toBe(true);
  });

  it("explains the conflict rather than only reporting one", () => {
    expect(getDealConflictReason("financial_sponsorship", "commission_per_ticket"))
      .toMatch(/paid a second time|second time/i);
    expect(getDealConflictReason("milestone_barter", "commission_per_ticket"))
      .toMatch(/same attendees/i);
  });
});

describe("deals that may be combined", () => {
  it("lets brand barter sit alongside anything", () => {
    for (const other of ["commission_per_ticket", "milestone_barter", "financial_sponsorship"]) {
      expect(dealTypesConflict("brand_barter", other)).toBe(false);
    }
  });

  it("does not fault sponsorship beside milestone barter", () => {
    // Neither takes a share of ticket money, so nothing is paid twice.
    expect(dealTypesConflict("financial_sponsorship", "milestone_barter")).toBe(false);
  });

  it("never faults a deal against itself, or against nothing", () => {
    expect(dealTypesConflict("commission_per_ticket", "commission_per_ticket")).toBe(false);
    expect(dealTypesConflict("commission_per_ticket", null)).toBe(false);
    expect(dealTypesConflict(undefined, undefined)).toBe(false);
  });
});

describe("what to disable once a deal is chosen", () => {
  it("lists what a chosen deal rules out", () => {
    expect(getConflictingDealTypes("commission_per_ticket").sort())
      .toEqual(["financial_sponsorship", "milestone_barter"]);
    expect(getConflictingDealTypes("financial_sponsorship")).toEqual(["commission_per_ticket"]);
    expect(getConflictingDealTypes("brand_barter")).toEqual([]);
    expect(getConflictingDealTypes(null)).toEqual([]);
  });
});

describe("checking a whole event at once", () => {
  it("finds the clash between a partner deal and a referral perk", () => {
    const conflicts = findDealConflicts(["financial_sponsorship", "commission_per_ticket"]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toMatch(/second time/i);
  });

  it("passes an event whose deals coexist", () => {
    expect(findDealConflicts(["brand_barter", "commission_per_ticket"])).toEqual([]);
    expect(findDealConflicts(["commission_per_ticket"])).toEqual([]);
    expect(findDealConflicts([])).toEqual([]);
  });

  it("ignores values that are not deal types at all", () => {
    expect(findDealConflicts([null, undefined, "", "nonsense"])).toEqual([]);
  });
});
