import { describe, expect, it } from "vitest";
import {
  blockingDealTermIssues,
  checkAddOnMarginAgainstVenuePrice,
  checkDealTerms,
  checkMvgForFixedCostDeal,
  checkTicketDeductionAgainstPrice,
  isFixedCostVenueDeal,
} from "./dealTermGuards";

describe("ticket deduction against ticket price", () => {
  it("blocks a deduction larger than the cheapest paid ticket", () => {
    const issue = checkTicketDeductionAgainstPrice({
      model: "fixed_fee",
      deductionPerTicket: 12,
      ticketPrices: [10, 25],
    });
    expect(issue?.severity).toBe("block");
    expect(issue?.message).toContain("€12.00");
    expect(issue?.message).toContain("€10.00");
  });

  it("allows a deduction the cheapest ticket covers", () => {
    expect(
      checkTicketDeductionAgainstPrice({
        model: "fixed_fee",
        deductionPerTicket: 3,
        ticketPrices: [10],
      }),
    ).toBeNull();
  });

  it("allows a deduction exactly equal to the ticket price", () => {
    expect(
      checkTicketDeductionAgainstPrice({
        model: "fixed_fee",
        deductionPerTicket: 10,
        ticketPrices: [10],
      }),
    ).toBeNull();
  });

  it("ignores free tiers rather than treating them as a zero ceiling", () => {
    expect(
      checkTicketDeductionAgainstPrice({
        model: "fixed_fee",
        deductionPerTicket: 3,
        ticketPrices: [0, 10],
      }),
    ).toBeNull();
  });

  it("says nothing on an event with no priced ticket yet", () => {
    expect(
      checkTicketDeductionAgainstPrice({
        model: "fixed_fee",
        deductionPerTicket: 3,
        ticketPrices: [0],
      }),
    ).toBeNull();
  });

  it("does not apply to deals that are not charged per ticket", () => {
    expect(
      checkTicketDeductionAgainstPrice({
        model: "revenue_share",
        deductionPerTicket: 90,
        ticketPrices: [10],
      }),
    ).toBeNull();
  });

  it("covers the per-participant package, which is the same mechanic", () => {
    expect(
      checkTicketDeductionAgainstPrice({
        model: "per_head",
        deductionPerTicket: 40,
        ticketPrices: [30],
      })?.severity,
    ).toBe("block");
  });
});

describe("deductive add-on margin against the venue's price", () => {
  it("blocks a margin that would leave the venue negative", () => {
    const issue = checkAddOnMarginAgainstVenuePrice({
      marginMode: "deduction",
      margin: 4,
      venuePrice: 3,
      addOnName: "Coffee",
    });
    expect(issue?.severity).toBe("block");
    expect(issue?.message).toContain("Coffee");
    expect(issue?.message).toContain("-€1.00");
  });

  it("leaves additive margins alone — they sit on top of the venue's price", () => {
    expect(
      checkAddOnMarginAgainstVenuePrice({
        marginMode: "additive",
        margin: 4,
        venuePrice: 3,
      }),
    ).toBeNull();
  });

  it("allows a deductive margin the venue price covers", () => {
    expect(
      checkAddOnMarginAgainstVenuePrice({
        marginMode: "deduction",
        margin: 1,
        venuePrice: 3,
      }),
    ).toBeNull();
  });

  it("allows a margin exactly equal to the venue price", () => {
    expect(
      checkAddOnMarginAgainstVenuePrice({
        marginMode: "deduction",
        margin: 3,
        venuePrice: 3,
      }),
    ).toBeNull();
  });
});

describe("MVG on fixed-cost deals", () => {
  it("recommends MVG for an upfront rental", () => {
    const issue = checkMvgForFixedCostDeal({ model: "upfront_rental", fixedCost: 500 });
    expect(issue?.severity).toBe("warn");
    expect(issue?.message).toContain("Upfront Rental");
    expect(issue?.message).toContain("€500.00");
  });

  it("recommends MVG for per room per night", () => {
    expect(checkMvgForFixedCostDeal({ model: "per_room_night" })?.key).toBe(
      "fixed_cost_deal_without_mvg",
    );
  });

  it("goes quiet once MVG is on", () => {
    expect(
      checkMvgForFixedCostDeal({ model: "upfront_rental", mvgEnabled: true }),
    ).toBeNull();
  });

  it("says nothing for deals that scale with turnout", () => {
    for (const model of ["revenue_share", "fixed_fee", "per_head", "venue_sponsored"]) {
      expect(checkMvgForFixedCostDeal({ model })).toBeNull();
      expect(isFixedCostVenueDeal(model)).toBe(false);
    }
    expect(isFixedCostVenueDeal("upfront_rental")).toBe(true);
    expect(isFixedCostVenueDeal("per_room_night")).toBe(true);
  });

  it("recognises the legacy names for the same two deals", () => {
    expect(isFixedCostVenueDeal("flat_rental")).toBe(true);
    expect(isFixedCostVenueDeal("per_room")).toBe(true);
  });
});

describe("checkDealTerms", () => {
  it("puts blocks before advice", () => {
    const issues = checkDealTerms({
      model: "upfront_rental",
      deductionPerTicket: 0,
      ticketPrices: [10],
      addOns: [{ marginMode: "deduction", margin: 9, venuePrice: 3 }],
    });
    expect(issues.map((issue) => issue.severity)).toEqual(["block", "warn"]);
    expect(blockingDealTermIssues(issues)).toHaveLength(1);
  });

  it("reports one add-on margin issue however many add-ons repeat it", () => {
    const issues = checkDealTerms({
      model: "revenue_share",
      deductionPerTicket: 0,
      ticketPrices: [10],
      addOns: [
        { marginMode: "deduction", margin: 9, venuePrice: 3 },
        { marginMode: "deduction", margin: 8, venuePrice: 2 },
      ],
    });
    expect(issues).toHaveLength(1);
  });

  it("is silent on a sound set of terms", () => {
    expect(
      checkDealTerms({
        model: "revenue_share",
        deductionPerTicket: 0,
        ticketPrices: [10],
        addOns: [{ marginMode: "additive", margin: 1, venuePrice: 3 }],
      }),
    ).toEqual([]);
  });
});
