import { describe, it, expect } from "vitest";
import { calculateEventEconomics } from "./eventEconomics";
import { getTicketAddon } from "./ticketAddons";

const sumOfLines = (lines: { amount: number }[]) =>
  Math.round(lines.reduce((total, line) => total + line.amount, 0) * 100) / 100;

describe("calculateEventEconomics", () => {
  // Tim's reproduction case, verbatim: 10 spots, $10 a ticket, a $4-per-ticket
  // venue deduction and a $1 additive margin on a $3 coffee. The calculator
  // printed four rows adding to $55 above a total reading -$30.
  it("totals exactly what its own rows add up to", () => {
    const result = calculateEventEconomics({
      ticketGross: 100,
      paidTickets: 10,
      platformPct: 15,
      venueDealModel: "fixed_fee",
      venueDealValue: 4,
      addOnVenueGross: 30,
      addOnCreatorGross: 10,
    });

    expect(result.net).toBe(sumOfLines(result.lines));
    // 100 gross - 16.50 platform fee (15% of 100 + 10) - 40 venue = 53.50
    expect(result.platformFeeBase).toBe(110);
    expect(result.platformFee).toBe(16.5);
    expect(result.venueTicketCost).toBe(40);
    expect(result.net).toBe(53.5);
  });

  it("never charges a ticket deduction against add-on money", () => {
    const withAddon = calculateEventEconomics({
      ticketGross: 100,
      paidTickets: 10,
      platformPct: 15,
      venueDealModel: "fixed_fee",
      venueDealValue: 4,
      addOnVenueGross: 30,
      addOnCreatorGross: 0,
    });
    const withoutAddon = calculateEventEconomics({
      ticketGross: 100,
      paidTickets: 10,
      platformPct: 15,
      venueDealModel: "fixed_fee",
      venueDealValue: 4,
    });

    // The add-on changed nothing about the ticket-level deal.
    expect(withAddon.venueTicketCost).toBe(withoutAddon.venueTicketCost);
    expect(withAddon.net).toBe(withoutAddon.net);
    expect(withAddon.addOnVenueRevenue).toBe(30);
  });

  it("takes no platform fee on the venue's own add-on price", () => {
    const result = calculateEventEconomics({
      ticketGross: 0,
      paidTickets: 0,
      platformPct: 15,
      venueDealModel: "revenue_share",
      venueDealValue: 20,
      addOnVenueGross: 30,
      addOnCreatorGross: 10,
    });

    // 15% of the £10 margin only — the venue's £30 keeps its counter price.
    expect(result.platformFeeBase).toBe(10);
    expect(result.platformFee).toBe(1.5);
    expect(result.net).toBe(sumOfLines(result.lines));
  });

  it("charges the platform fee on a commitment fee, like every other inflow", () => {
    const result = calculateEventEconomics({
      ticketGross: 200,
      paidTickets: 20,
      platformPct: 15,
      venueDealModel: "commitment_plus_revenue_share",
      venueDealValue: 20,
      commitmentFee: 100,
    });

    expect(result.platformFeeBase).toBe(300);
    expect(result.platformFee).toBe(45);
    // 200 - 45 - 40 venue share + 100 commitment = 215
    expect(result.net).toBe(215);
    expect(result.net).toBe(sumOfLines(result.lines));
  });

  it("charges the platform fee on a venue sponsorship", () => {
    const result = calculateEventEconomics({
      ticketGross: 0,
      paidTickets: 0,
      platformPct: 15,
      venueDealModel: "venue_sponsored",
      venueDealValue: 200,
    });

    expect(result.platformFee).toBe(30);
    expect(result.net).toBe(170);
    expect(result.net).toBe(sumOfLines(result.lines));
  });

  it("reports nothing for a deal settled at the venue's own counter", () => {
    const result = calculateEventEconomics({
      ticketGross: 100,
      paidTickets: 10,
      platformPct: 15,
      venueDealModel: "access_only",
      venueDealValue: 0,
    });

    expect(result.offPlatform).toBe(true);
    expect(result.venueTicketCost).toBe(0);
    expect(result.net).toBe(sumOfLines(result.lines));
  });

  it("keeps the total equal to its rows for every deal type", () => {
    const models = [
      "revenue_share",
      "fixed_fee",
      "per_head",
      "per_room_night",
      "upfront_rental",
      "venue_sponsored",
      "commitment_plus_revenue_share",
      "access_only",
      "minimum_spend",
      "manual_counter_revenue",
    ];

    for (const model of models) {
      const result = calculateEventEconomics({
        ticketGross: 480,
        paidTickets: 24,
        platformPct: 15,
        venueDealModel: model,
        venueDealValue: 20,
        roomNights: 6,
        commitmentFee: 75,
        addOnVenueGross: 120,
        addOnCreatorGross: 24,
        promoterCommissionPct: 5,
      });
      expect(result.net, `total drifted from its rows for ${model}`)
        .toBe(sumOfLines(result.lines));
    }
  });
});

describe("add-on margin direction", () => {
  it("adds the margin on top by default", () => {
    const addon = getTicketAddon({
      addonEnabled: true,
      addonName: "Coffee",
      addonVenuePrice: 3,
      addonMargin: 1,
    });

    expect(addon).toMatchObject({
      unitPrice: 4,
      venueAmount: 3,
      creatorAmount: 1,
      marginMode: "additive",
    });
  });

  // The transparency case: the participant is shown the venue's counter price
  // and no more, so buying at the counter is never cheaper than buying here.
  it("takes the margin out of the venue's cut under a deduction", () => {
    const addon = getTicketAddon({
      addonEnabled: true,
      addonName: "Coffee",
      addonVenuePrice: 3,
      addonMargin: 1,
      addonMarginMode: "deduction",
    });

    expect(addon).toMatchObject({
      unitPrice: 3,
      venueAmount: 2,
      creatorAmount: 1,
      marginMode: "deduction",
    });
  });

  it("never lets a deduction take more than the venue is paid", () => {
    const addon = getTicketAddon({
      addonEnabled: true,
      addonVenuePrice: 3,
      addonMargin: 9,
      addonMarginMode: "deduction",
    });

    expect(addon?.venueAmount).toBe(0);
    expect(addon?.creatorAmount).toBe(3);
  });

  it("still reads a ticket saved before the split existed", () => {
    const addon = getTicketAddon({ pricingMode: "combi", addonPrice: 5.5 });

    expect(addon).toMatchObject({
      unitPrice: 5.5,
      venueAmount: 5.5,
      creatorAmount: 0,
      marginMode: "additive",
    });
  });
});
