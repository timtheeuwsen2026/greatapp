import { describe, it, expect } from "vitest";
import {
  getVenueDealOptions,
  getVenueDealLabel,
  getVenueDealSelectionError,
  isVenueDealSelectable,
  normalizeVenueDealModel,
  formatVenueDealSummary,
  readVenueDealValue,
  validateExperienceVenueDeal,
  venueDealNeedsValue,
} from "./venueDealModels";

// V14: the Event Builder and Venue Builder offered different lists, and both
// showed the same deals to a one-day pop-up and a three-day villa.

describe("venue deal vocabulary", () => {
  it("offers the multi-day list to trips", () => {
    const options = getVenueDealOptions({ isDaytime: false, surface: "event" });

    expect(options.map((o) => o.value)).toEqual([
      "revenue_share",
      "per_head",
      "upfront_rental",
      "per_room_night",
    ]);
    expect(options.map((o) => o.label)).toEqual([
      "Revenue Split (%)",
      "Per-Participant Package (€)",
      "Upfront Rental / Flat Fee (€)",
      "Per Room / Per Night (€)",
    ]);
  });

  it("offers the day-event list to one-day events", () => {
    const options = getVenueDealOptions({ isDaytime: true, surface: "event" });

    expect(options.map((o) => o.label)).toEqual([
      "Revenue Split (%)",
      "Ticket Deduction / Per-Head Fee (€)",
      "Upfront Rental / Flat Fee (€)",
      "Venue Sponsorship (€)",
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
