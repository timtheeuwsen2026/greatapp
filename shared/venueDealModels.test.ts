import { describe, it, expect } from "vitest";
import {
  calculateVenueEarnings,
  canSelectVenueDeal,
  checkVenuePayoutCap,
  dealCurrencySymbol,
  getVenueDealOptions,
  isUntrackedVenueDeal,
  getVenueDealLabel,
  getVenueDealSelectionError,
  isVenueDealSelectable,
  normalizeVenueDealModel,
  formatVenueDealSummary,
  readVenueDealValue,
  UNTRACKED_DEAL_LOCKED_MESSAGE,
  validateExperienceVenueDeal,
  venueDealNeedsValue,
} from "./venueDealModels";

// V14: the Event Builder and Venue Builder offered different lists, and both
// showed the same deals to a one-day pop-up and a three-day villa.

describe("venue deal vocabulary", () => {
  // The untracked manual deal is admit-by-exception now, so the ordinary lists
  // below are the trackable deals alone.
  it("offers the multi-day list to trips", () => {
    const options = getVenueDealOptions({ isDaytime: false, surface: "event" });

    expect(options.map((o) => o.value)).toEqual([
      "revenue_share",
      "per_head",
      "upfront_rental",
      "per_room_night",
      "commitment_plus_revenue_share",
    ]);
    expect(options.map((o) => o.label)).toEqual([
      "Revenue Split (%)",
      "Per-Participant Package (€)",
      "Upfront Rental / Flat Fee (€)",
      "Per Room / Per Night (€)",
      "Commitment Fee + Revenue Split (€ + %)",
    ]);
  });

  it("offers the day-event list to one-day events", () => {
    const options = getVenueDealOptions({ isDaytime: true, surface: "event" });

    expect(options.map((o) => o.label)).toEqual([
      "Revenue Split (%)",
      "Ticket Deduction / Per-Head Fee (€)",
      "Upfront Rental / Flat Fee (€)",
      "Venue Sponsorship (€)",
      "Commitment Fee + Revenue Split (€ + %)",
    ]);
  });

  it("appends the manual deal to each list on an unlocked event", () => {
    expect(getVenueDealOptions({ isDaytime: false, surface: "event", allowUntracked: true })
      .map((o) => o.value)).toEqual([
      "revenue_share",
      "per_head",
      "upfront_rental",
      "per_room_night",
      "commitment_plus_revenue_share",
      "manual_counter_revenue",
    ]);
    expect(getVenueDealOptions({ isDaytime: true, surface: "event", allowUntracked: true })
      .map((o) => o.value)).toEqual([
      "revenue_share",
      "fixed_fee",
      "upfront_rental",
      "venue_sponsored",
      "commitment_plus_revenue_share",
      "manual_counter_revenue",
    ]);
  });

  it("never offers pay-at-counter in creator or venue dropdowns", () => {
    const surfaces = ["event", "venue"] as const;

    for (const surface of surfaces) {
      expect(getVenueDealOptions({ isDaytime: true, surface }).map((o) => o.value))
        .not.toContain("access_only");
      expect(getVenueDealOptions({
        isDaytime: true,
        surface,
        currentValue: "access_only",
      }).map((o) => o.value)).not.toContain("access_only");
    }

    expect(isVenueDealSelectable("access_only")).toBe(false);
    expect(isVenueDealSelectable("revenue_share")).toBe(true);
  });

  it("requires a usable value for every new on-platform deal", () => {
    expect(getVenueDealSelectionError("access_only", 0)).toMatch(/on-platform/i);
    expect(getVenueDealSelectionError("revenue_share", 0)).toMatch(/greater than zero/i);
    expect(getVenueDealSelectionError("revenue_share", 101)).toMatch(/cannot exceed 100/i);
    expect(getVenueDealSelectionError("revenue_share", 20)).toBeNull();
    expect(getVenueDealSelectionError("upfront_rental", 500)).toBeNull();
  });

  it("blocks blank or disabled publication deals without applying the paused ticket matrix", () => {
    expect(validateExperienceVenueDeal({ venueType: "open" })).toEqual([
      "Target deal: Select an available on-platform venue deal",
    ]);
    expect(validateExperienceVenueDeal({
      venueType: "manual",
      venueTargetDeal: "access_only",
      venueTargetDealValue: 0,
    })[0]).toMatch(/on-platform/i);
    expect(validateExperienceVenueDeal({
      venueType: "open",
      venueTargetDeal: "revenue_share",
      venueTargetDealValue: 25,
    })).toEqual([]);
    expect(validateExperienceVenueDeal({
      venueType: "catalog",
      selectedVenueId: "venue-1",
      venueCompensationModel: "upfront_rental",
      venueFixedFee: 300,
    })).toEqual([]);
    expect(validateExperienceVenueDeal({ venueType: "virtual" })).toEqual([]);
  });

  it("never offers a retreat the pay-at-counter or sponsorship deals", () => {
    const values = getVenueDealOptions({ isDaytime: false, surface: "event" }).map((o) => o.value);

    expect(values).not.toContain("access_only");
    expect(values).not.toContain("venue_sponsored");
  });

  it("gives the Event Builder and Venue Builder the identical vocabulary", () => {
    // The venue's Offer to Host and Counter Offer dropdowns showed four deals
    // where the creator's builder showed five, so a venue could never answer a
    // day event with the sponsorship it was willing to pay.
    const forEvent = getVenueDealOptions({ isDaytime: true, surface: "event" }).map((o) => o.value);
    const forVenue = getVenueDealOptions({ isDaytime: true, surface: "venue" }).map((o) => o.value);

    expect(forVenue).toEqual(forEvent);
    expect(forVenue).toContain("venue_sponsored");

    const tripEvent = getVenueDealOptions({ isDaytime: false, surface: "event" }).map((o) => o.value);
    const tripVenue = getVenueDealOptions({ isDaytime: false, surface: "venue" }).map((o) => o.value);
    expect(tripVenue).toEqual(tripEvent);
  });

  it("maps the old venue-builder keys onto the shared ones", () => {
    expect(normalizeVenueDealModel("flat_rental")).toBe("upfront_rental");
    expect(normalizeVenueDealModel("whole_venue")).toBe("upfront_rental");
    expect(normalizeVenueDealModel("per_head_package")).toBe("per_head");
    expect(normalizeVenueDealModel("per_room")).toBe("per_room_night");
    expect(normalizeVenueDealModel("revenue_share")).toBe("revenue_share");
    expect(normalizeVenueDealModel("nonsense")).toBeNull();
  });

  it("keeps a deal saved under the old vocabulary selectable while editing", () => {
    const options = getVenueDealOptions({
      isDaytime: true,
      surface: "venue",
      currentValue: "minimum_spend",
    });

    expect(options.map((o) => o.value)).toContain("minimum_spend");
  });

  it("labels amounts in the event's own currency", () => {
    const [, ticketDeduction] = getVenueDealOptions({
      isDaytime: true,
      surface: "event",
      currencySymbol: "£",
    });

    expect(ticketDeduction.label).toBe("Ticket Deduction / Per-Head Fee (£)");
    expect(getVenueDealLabel("per_head", "$")).toBe("Per-Participant Package ($)");
  });

  it("knows which deals carry a number", () => {
    expect(venueDealNeedsValue("access_only")).toBe(false);
    expect(venueDealNeedsValue("per_room_night")).toBe(true);
    expect(venueDealNeedsValue("revenue_share")).toBe(true);
  });

  it("reads each model's value from its own terms key", () => {
    expect(readVenueDealValue("revenue_share", { revenueSharePct: 20 })).toBe(20);
    expect(readVenueDealValue("per_head", { perHeadAmount: 85 })).toBe(85);
    expect(readVenueDealValue("per_room_night", { perRoomPerNight: 120 })).toBe(120);
    expect(readVenueDealValue("upfront_rental", { fixedFee: 500 })).toBe(500);
    // Access-only carries no amount unless one was set.
    expect(readVenueDealValue("access_only", {})).toBeNull();
    expect(readVenueDealValue("access_only", { accessFee: 25 })).toBe(25);
  });

  it("summarises every model in plain English", () => {
    expect(formatVenueDealSummary("revenue_share", { revenueSharePct: 50 }, "eur"))
      .toBe("Revenue Split — 50% of ticket sales");
    expect(formatVenueDealSummary("per_room_night", { perRoomPerNight: 120 }, "eur"))
      .toBe("Per Room / Per Night — EUR 120 per room per night");
    expect(formatVenueDealSummary("per_head", { perHeadAmount: 85 }, "eur"))
      .toBe("Per-Participant Package — EUR 85 per participant");
    expect(formatVenueDealSummary("access_only", {}, "eur"))
      .toBe("Access-Only / Pay-at-Counter");
    // Legacy rows still read correctly.
    expect(formatVenueDealSummary("flat_rental", { fixedFee: 300 }, "eur"))
      .toBe("Upfront Rental — creator pays EUR 300");
  });
});

// A stopgap for one event whose money is taken at the venue's register. It has
// to be selectable, and it has to be impossible to mistake for a deal the
// platform is actually settling.
describe("manual counter-revenue deal", () => {
  const surfaces = ["event", "venue"] as const;

  // Locked by default. An organiser reached for this twice rather than commit
  // to a trackable deal, which is what an ordinary dropdown option invites, so
  // it now takes an admin unlock on the specific event.
  it("is not offered on any surface unless the event is unlocked", () => {
    for (const surface of surfaces) {
      for (const isDaytime of [true, false]) {
        const locked = getVenueDealOptions({ isDaytime, surface });
        expect(locked.map((option) => option.value)).not.toContain("manual_counter_revenue");
        expect(locked.length).toBeGreaterThan(0);
      }
    }
  });

  it("is offered last once unlocked, after every deal the platform can track", () => {
    for (const surface of surfaces) {
      for (const isDaytime of [true, false]) {
        const options = getVenueDealOptions({ isDaytime, surface, allowUntracked: true });
        expect(options.at(-1)?.value).toBe("manual_counter_revenue");
      }
    }
  });

  it("stays hidden even on an event that already saved it, once locked again", () => {
    const options = getVenueDealOptions({
      isDaytime: true,
      surface: "event",
      currentValue: "manual_counter_revenue",
    });

    expect(options.map((option) => option.value)).not.toContain("manual_counter_revenue");
  });

  it("is the only option flagged untracked, so surfaces can separate it", () => {
    const options = getVenueDealOptions({ isDaytime: true, surface: "event", allowUntracked: true });
    const untracked = options.filter((option) => option.untracked);

    expect(untracked.map((option) => option.value)).toEqual(["manual_counter_revenue"]);
    expect(isUntrackedVenueDeal("manual_counter_revenue")).toBe(true);
    expect(isUntrackedVenueDeal("revenue_share")).toBe(false);
  });

  it("remains a real model, unlike the pay-at-counter deal it replaces", () => {
    expect(isVenueDealSelectable("manual_counter_revenue")).toBe(true);
    expect(isVenueDealSelectable("access_only")).toBe(false);
  });

  it("can only be chosen on an unlocked event", () => {
    expect(canSelectVenueDeal("manual_counter_revenue")).toBe(false);
    expect(canSelectVenueDeal("manual_counter_revenue", true)).toBe(true);
    // The unlock is specific to untracked deals; it does not revive a model
    // disabled platform-wide.
    expect(canSelectVenueDeal("access_only", true)).toBe(false);
    expect(canSelectVenueDeal("revenue_share")).toBe(true);
  });

  it("explains itself instead of reading as an unavailable deal", () => {
    expect(getVenueDealSelectionError("manual_counter_revenue", 15))
      .toBe(UNTRACKED_DEAL_LOCKED_MESSAGE);
    expect(getVenueDealSelectionError("not_a_deal", 15))
      .toBe("Select an available on-platform venue deal");
  });

  it("still insists on a usable percentage once unlocked", () => {
    expect(getVenueDealSelectionError("manual_counter_revenue", 15, true)).toBeNull();
    expect(getVenueDealSelectionError("manual_counter_revenue", 0, true)).toBe("Enter a percentage greater than zero");
    expect(getVenueDealSelectionError("manual_counter_revenue", 140, true)).toBe("Revenue share percentage cannot exceed 100");
  });

  it("never produces a number to settle, whatever the event took", () => {
    const earnings = calculateVenueEarnings({
      model: "manual_counter_revenue",
      value: 20,
      grossRevenue: 900,
      attendees: 30,
    });

    // The platform cannot see counter takings, so quoting a figure here would
    // be inventing one and a payout would try to move money it never held.
    expect(earnings).toEqual({ earned: 0, owed: 0, offPlatform: true });
  });

  it("says in its summary that nobody is tracking it", () => {
    const summary = formatVenueDealSummary("manual_counter_revenue", { counterRevenuePct: 15 }, "eur");

    expect(summary).toContain("Manual agreement (untracked)");
    expect(summary).toContain("15%");
    expect(summary).toContain("settled directly between organiser and venue");
  });
});


describe("venue payout cannot exceed what the event takes", () => {
  // Both cases were sent to a venue with no warning at all; the only signal was
  // a quietly negative "Estimated Net to You".
  it("catches a 90% revenue split against the 15% platform fee", () => {
    const result = checkVenuePayoutCap({
      model: "revenue_share",
      value: 90,
      ticketGross: 176,
      paidTickets: 32,
      platformPct: 15,
    });

    expect(result.exceedsGross).toBe(true);
    expect(result.totalTakePct).toBe(105);
    // The -8.80 he reported, reproduced exactly.
    expect(result.creatorNet).toBe(-8.8);
    expect(result.message).toMatch(/pays out more than the event takes/i);
  });

  it("catches a €5 per-ticket deduction on a €5.50 ticket", () => {
    const result = checkVenuePayoutCap({
      model: "fixed_fee",
      value: 5,
      ticketGross: 176,
      paidTickets: 32,
      platformPct: 15,
    });

    expect(result.exceedsGross).toBe(true);
    expect(result.venueCost).toBe(160);
    expect(result.creatorNet).toBe(-10.4);
  });

  it("allows a deal the event can actually pay for", () => {
    const result = checkVenuePayoutCap({
      model: "revenue_share",
      value: 20,
      ticketGross: 1000,
      paidTickets: 100,
      platformPct: 15,
    });

    expect(result.exceedsGross).toBe(false);
    expect(result.message).toBeNull();
    expect(result.venueCost).toBe(200);
    expect(result.creatorNet).toBe(650);
  });

  it("charges a per-head fee for paid tickets only", () => {
    // 32 free + 32 paid at €5. The fee applies to the 32 paid tickets, so €4
    // each is €128 — the old maths spread it over all 64 and quoted €256.
    const result = checkVenuePayoutCap({
      model: "fixed_fee",
      value: 4,
      ticketGross: 160,
      paidTickets: 32,
      platformPct: 15,
    });

    expect(result.venueCost).toBe(128);
    // €128 + €24 platform fee against €160 of sales: tight, but payable. Had the
    // free tickets counted, €256 + €24 would have been flagged as impossible.
    expect(result.exceedsGross).toBe(false);
    expect(result.creatorNet).toBe(8);

    expect(checkVenuePayoutCap({
      model: "fixed_fee", value: 4, ticketGross: 160, paidTickets: 64, platformPct: 15,
    }).exceedsGross).toBe(true);
  });

  it("never faults a deal the venue funds", () => {
    expect(checkVenuePayoutCap({
      model: "venue_sponsored",
      value: 500,
      ticketGross: 0,
      paidTickets: 0,
      platformPct: 15,
    }).exceedsGross).toBe(false);
  });

  it("cannot be breached by money the platform never sees", () => {
    expect(checkVenuePayoutCap({
      model: "manual_counter_revenue",
      value: 90,
      ticketGross: 100,
      paidTickets: 10,
      platformPct: 15,
    }).exceedsGross).toBe(false);
  });

  it("says nothing about a free event, which has no gross to overdraw", () => {
    const result = checkVenuePayoutCap({
      model: "revenue_share",
      value: 50,
      ticketGross: 0,
      paidTickets: 0,
      platformPct: 15,
    });

    expect(result.exceedsGross).toBe(false);
    expect(result.message).toBeNull();
  });
});

describe("commitment fee plus revenue share", () => {
  const terms = { revenueSharePct: 20, commitmentFee: 50 };

  it("carries two numbers travelling in opposite directions", () => {
    const option = getVenueDealOptions({ isDaytime: true, surface: "event" })
      .find((o) => o.value === "commitment_plus_revenue_share");

    expect(option?.valueKind).toBe("percent");
    expect(option?.termsKey).toBe("revenueSharePct");
    expect(option?.direction).toBe("attendee_funded");
    expect(option?.secondaryTermsKey).toBe("commitmentFee");
    expect(option?.secondaryValueKind).toBe("amount");
    expect(option?.secondaryDirection).toBe("venue_pays_creator");
    expect(option?.secondaryValueLabel).toBe("Commitment fee the venue pays you (€)");
  });

  it("splits revenue exactly as Revenue Split does", () => {
    const split = calculateVenueEarnings({
      model: "revenue_share", value: 20, grossRevenue: 1000, attendees: 50,
    });
    const commitment = calculateVenueEarnings({
      model: "commitment_plus_revenue_share", value: 20, grossRevenue: 1000, attendees: 50, secondaryValue: 50,
    });

    expect(commitment.earned).toBe(split.earned);
    // ...and the fee is what the venue owes the organiser, on top.
    expect(commitment.owed).toBe(50);
    expect(commitment.offPlatform).toBe(false);
  });

  it("is capped on the share alone — the fee is income, not a cost", () => {
    const result = checkVenuePayoutCap({
      model: "commitment_plus_revenue_share",
      value: 90,
      ticketGross: 100,
      paidTickets: 10,
      platformPct: 15,
    });

    expect(result.venueCost).toBe(90);
    expect(result.exceedsGross).toBe(true);
  });

  it("reads back as one sentence naming both halves", () => {
    const summary = formatVenueDealSummary("commitment_plus_revenue_share", terms, "eur");

    expect(summary).toContain("EUR 50");
    expect(summary).toContain("20%");
    expect(summary).toMatch(/upfront/i);
  });

  it("is an ordinary trackable deal, needing no admin unlock", () => {
    expect(canSelectVenueDeal("commitment_plus_revenue_share")).toBe(true);
    expect(getVenueDealSelectionError("commitment_plus_revenue_share", 20)).toBeNull();
    expect(getVenueDealSelectionError("commitment_plus_revenue_share", 0))
      .toBe("Enter a percentage greater than zero");
    expect(getVenueDealSelectionError("commitment_plus_revenue_share", 140))
      .toBe("Revenue share percentage cannot exceed 100");
  });
});


describe("the over-limit warning reads the same as the calculator beside it", () => {
  const overLimit = {
    model: "revenue_share" as const,
    value: 90,
    ticketGross: 2000,
    paidTickets: 20,
    platformPct: 15,
  };

  it("puts a dollar in front of the number, the way the calculator does", () => {
    const message = checkVenuePayoutCap({
      ...overLimit,
      currencyDisplay: { symbol: "$", before: true },
    }).message!;

    expect(message).toContain("$1,800.00");
    expect(message).toContain("$300.00");
    // The euro-style trailing symbol was what made one screen show the same
    // amount two different ways.
    expect(message).not.toContain("1,800.00 $");
  });

  it("keeps the euro after the number, which is correct for this locale", () => {
    const message = checkVenuePayoutCap({
      ...overLimit,
      currencyDisplay: { symbol: "€", before: false },
    }).message!;

    expect(message).toContain("1,800.00 €");
  });

  it("groups thousands rather than printing a bare number", () => {
    const message = checkVenuePayoutCap(overLimit).message!;
    expect(message).toContain("1,800.00");
    expect(message).not.toContain("1800.00");
  });

  it("still says the figure is on ticket sales alone", () => {
    expect(checkVenuePayoutCap(overLimit).message).toContain("on ticket sales");
  });
});

describe("deal labels carry the event's own currency", () => {
  it("never falls back to euros for a dollar event", () => {
    expect(dealCurrencySymbol("usd")).toBe("$");
    expect(dealCurrencySymbol("USD")).toBe("$");
    expect(getVenueDealLabel("venue_sponsored", dealCurrencySymbol("usd")))
      .toBe("Venue Sponsorship ($)");
    expect(getVenueDealLabel("commitment_plus_revenue_share", dealCurrencySymbol("usd")))
      .toBe("Commitment Fee + Revenue Split ($ + %)");
  });

  it("defaults to euros only when no currency was given", () => {
    expect(dealCurrencySymbol(null)).toBe("€");
    expect(getVenueDealLabel("venue_sponsored", dealCurrencySymbol("eur")))
      .toBe("Venue Sponsorship (€)");
  });

  it("falls back to the code itself for a currency with no symbol", () => {
    expect(dealCurrencySymbol("sek")).toBe("SEK ");
  });
});
