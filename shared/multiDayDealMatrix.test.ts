import { describe, it, expect } from "vitest";
import {
  explainVenueDealMechanics,
  getVenueDealDirection,
  getVenueDealOptions,
} from "./venueDealModels";
import { calculateEventEconomics } from "./eventEconomics";

/**
 * Point 24 — the Multi-Day deal-type matrix, confirmed rather than inferred.
 *
 * Venue Sponsorship, Price Per Participant Package and Per Room / Per Night had
 * been read off their names and the surrounding UI, never checked against what
 * the calculator actually does with them. Naming alone leaves three real
 * questions open — which way the money travels, whether "per participant"
 * counts bookings or heads, and whether "per room" charges the rooms held or
 * the rooms that fill — and each has a different answer that is invisible until
 * an event settles.
 *
 * This file is the confirmation, written as assertions so it stays true. The
 * prose version is `docs/MULTI_DAY_DEAL_MATRIX.md`.
 */

const dealIds = (isDaytime: boolean) =>
  getVenueDealOptions({ isDaytime }).map((option) => option.value);

describe("point 24 — which deals each builder offers", () => {
  it("offers Multi-Day exactly the list point 54.3 specifies", () => {
    expect(dealIds(false)).toEqual([
      "revenue_share",
      "per_head",
      "upfront_rental",
      "per_room_night",
      "commitment_plus_revenue_share",
      "venue_barter",
    ]);
  });

  it("offers a Day Event exactly the list point 40.2 specifies", () => {
    expect(dealIds(true)).toEqual([
      "revenue_share",
      "fixed_fee",
      "upfront_rental",
      "venue_sponsored",
      "commitment_plus_revenue_share",
      "venue_barter",
    ]);
  });

  it("never cross-populates the two lists (point 12)", () => {
    // Venue Sponsorship is the answer to half of point 24: it is not a
    // Multi-Day option at all, so its Multi-Day mechanics were never in doubt —
    // there are none.
    expect(dealIds(false)).not.toContain("venue_sponsored");
    expect(dealIds(false)).not.toContain("fixed_fee");
    expect(dealIds(true)).not.toContain("per_head");
    expect(dealIds(true)).not.toContain("per_room_night");
  });
});

describe("point 24 — Price Per Participant Package", () => {
  const economics = (paidTickets: number) => calculateEventEconomics({
    ticketGross: paidTickets * 100,
    paidTickets,
    platformPct: 15,
    venueDealModel: "per_head",
    venueDealValue: 40,
  });

  it("charges per paid head, not per booking", () => {
    // Four tickets on one booking is four participants staying four beds.
    expect(economics(4).venueTicketCost).toBe(160);
    expect(economics(1).venueTicketCost).toBe(40);
  });

  it("charges nothing when nothing sold", () => {
    // Not one package at the minimum — the trap point 4 was about, in the
    // deal type that scales the same way.
    expect(economics(0).venueTicketCost).toBe(0);
  });

  it("is funded by the attendee, so it scales with turnout", () => {
    expect(getVenueDealDirection("per_head")).toBe("attendee_funded");
    expect(explainVenueDealMechanics({ model: "per_head", value: 40, paidTickets: 4 }))
      .toContain("rather than per booking");
  });
});

describe("point 24 — Per Room / Per Night", () => {
  const economics = (paidTickets: number, roomNights: number) => calculateEventEconomics({
    ticketGross: paidTickets * 100,
    paidTickets,
    platformPct: 15,
    venueDealModel: "per_room_night",
    venueDealValue: 60,
    roomNights,
  });

  it("charges the rooms held multiplied by the nights, not the beds filled", () => {
    // 5 rooms × 3 nights at €60. The organiser pays for the block they hold.
    expect(economics(10, 15).venueTicketCost).toBe(900);
  });

  it("costs the same whatever the turnout — the fixed-cost risk behind point 26", () => {
    const full = economics(20, 15).venueTicketCost;
    const empty = economics(0, 15).venueTicketCost;

    expect(full).toBe(empty);
    expect(empty).toBe(900);
    // Which is why the copy points at a Minimum Viable Group rather than
    // leaving the organiser to notice the exposure themselves.
    expect(explainVenueDealMechanics({
      model: "per_room_night", value: 60, rooms: 5, nights: 3,
    })).toContain("Minimum Viable Group");
  });

  it("is the creator paying the venue, unlike every attendee-funded deal", () => {
    expect(getVenueDealDirection("per_room_night")).toBe("creator_pays_venue");
    // A held block with no revenue against it is a loss, and it shows as one —
    // point 48.8's "always visible as a negative Net to you".
    expect(economics(0, 15).net).toBeLessThan(0);
  });
});

describe("point 24 — Venue Sponsorship, where it is offered", () => {
  const sponsored = calculateEventEconomics({
    ticketGross: 1000,
    paidTickets: 10,
    platformPct: 15,
    venueDealModel: "venue_sponsored",
    venueDealValue: 500,
  });

  it("travels from the venue to the organiser, not the other way", () => {
    expect(getVenueDealDirection("venue_sponsored")).toBe("venue_pays_creator");
    expect(sponsored.venueContribution).toBe(500);
    expect(sponsored.venueTicketCost).toBe(0);
  });

  it("is income, so the platform fee applies to it like any other inflow", () => {
    // 15% of the €1,500 that reached the organiser.
    expect(sponsored.platformFee).toBe(225);
  });

  it("takes no share of ticket sales on top", () => {
    expect(sponsored.net).toBe(1000 + 500 - 225);
  });
});
