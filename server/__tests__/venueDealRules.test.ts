import { describe, expect, it } from "vitest";
import { isVenueDealModel, normalizeVenueDealTerms } from "../venueDealRules";

describe("venue deal rules", () => {
  it("normalizes a revenue-share counter in the event currency", () => {
    expect(normalizeVenueDealTerms("revenue_share", { revenueSharePct: "60" }, "eur"))
      .toEqual({ revenueSharePct: 60, currency: "EUR" });
  });

  it("supports every commercial model used by venue contracts", () => {
    expect(normalizeVenueDealTerms("per_head", { perHeadAmount: 12 }, "USD")).toEqual({ perHeadAmount: 12, currency: "USD" });
    expect(normalizeVenueDealTerms("minimum_spend", { minimumSpend: 500 }, "GBP")).toEqual({ minimumSpend: 500, currency: "GBP" });
    expect(normalizeVenueDealTerms("access_only", {}, "EUR")).toEqual({ accessFee: 0, currency: "EUR" });
  });

  it("rejects invalid percentages and unsupported models", () => {
    expect(() => normalizeVenueDealTerms("revenue_share", { revenueSharePct: 101 }, "EUR")).toThrow("cannot exceed 100");
    expect(isVenueDealModel("something_else")).toBe(false);
  });
});
