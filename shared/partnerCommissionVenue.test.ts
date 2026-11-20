import { describe, expect, it } from "vitest";
import { calculateEventEconomics } from "./eventEconomics";
import { commissionPartnerNames, joinNames, partnerCommissionLineLabel } from "./eventPartners";
import { hasPricedTicket } from "./ticketRevenue";

// Tim, 66.33: a partner commission works next to a venue deal. Both are their
// own line and the commission comes out of the organiser's share.
describe("partner commission next to a venue deal (66.33)", () => {
  it("splits TEST 3: sales 2.00, fee 0.30, venue 0.50, partner 0.20, organiser 1.00", () => {
    const economics = calculateEventEconomics({
      ticketGross: 2,
      paidTickets: 1,
      platformPct: 15,
      venueDealModel: "per_head",
      venueDealValue: 0.5,
      promoterCommissionPct: 10,
      promoterCommissionLabel: "Partner commission: Good Soles (10%)",
    } as any);
    const byKey = Object.fromEntries(economics.lines.map((line) => [line.key, line]));
    expect(byKey.platform_fee.amount).toBe(-0.3);
    expect(byKey.venue_payout.amount).toBe(-0.5);
    expect(byKey.promoter_bounty.amount).toBe(-0.2);
    expect(byKey.promoter_bounty.label).toBe("Partner commission: Good Soles (10%)");
    expect(economics.net).toBe(1);
  });

  it("names the commission line after the partner, not Participant Cashback", () => {
    const one = [{ name: "Good Soles", dealType: "commission_per_ticket", status: "invited", terms: { commissionPct: 10 } }];
    expect(partnerCommissionLineLabel(one)).toBe("Partner commission: Good Soles (10%)");
    const two = [...one, { name: "Run X", dealType: "commission_per_ticket", status: "draft", terms: { commissionPct: 20 } }];
    expect(partnerCommissionLineLabel(two)).toBe("Partner commission, highest rate (20%)");
    // A higher participant cashback keeps its own name.
    expect(partnerCommissionLineLabel(one, 15)).toBeUndefined();
    // A declined partner earns nothing.
    expect(partnerCommissionLineLabel([{ ...one[0], status: "declined" }])).toBeUndefined();
  });

  it("lists who earns commission, for the publish check", () => {
    const partners = [
      { name: "Good Soles", dealType: "commission_per_ticket", status: "confirmed" },
      { name: "Strong X", dealType: "brand_barter", status: "confirmed" },
      { name: "Run X", dealType: "commission_per_ticket", status: "declined" },
      { name: "Club Y", dealType: "commission_per_ticket", status: "invited" },
    ];
    expect(joinNames(commissionPartnerNames(partners))).toBe("Good Soles and Club Y");
  });

  it("only counts a ticket with a price as priced", () => {
    expect(hasPricedTicket([])).toBe(false);
    expect(hasPricedTicket([{ pricingMode: "free_rsvp", pricePerPerson: 0 } as any])).toBe(false);
    expect(hasPricedTicket([{ pricingMode: "free_rsvp" } as any, { pricePerPerson: 2 } as any])).toBe(true);
  });
});
