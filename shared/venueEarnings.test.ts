import { describe, expect, it } from "vitest";
import { calculateVenueEarnings, getVenueDealDirection } from "./venueDealModels";

// Noor Coffee opened their dashboard mid-negotiation and saw "Total Sales
// $8" — the run club's ticket income, not theirs — while being asked for a
// 50 sponsorship. The venue ledger now answers only two questions: what am I
// owed, and what do I owe.

const base = { grossRevenue: 800, attendees: 20, roomNights: 6 };

describe("calculateVenueEarnings", () => {
  it("takes the agreed percentage of ticket sales on a revenue split", () => {
    const { earned, owed } = calculateVenueEarnings({ ...base, model: "revenue_share", value: 15 });
    expect(earned).toBe(120);
    expect(owed).toBe(0);
  });

  it("scales a ticket deduction with the number of tickets, not once per event", () => {
    // "A flat amount per ticket sold goes to the venue" — 2 x 20 guests.
    expect(calculateVenueEarnings({ ...base, model: "fixed_fee", value: 2 }).earned).toBe(40);
  });

  it("pays a per-head package for every participant", () => {
    expect(calculateVenueEarnings({ ...base, model: "per_head", value: 35 }).earned).toBe(700);
  });

  it("charges room nights for a multi-day stay", () => {
    expect(calculateVenueEarnings({ ...base, model: "per_room_night", value: 50 }).earned).toBe(300);
  });

  it("counts an upfront rental once, however many people came", () => {
    const rental = calculateVenueEarnings({ ...base, model: "upfront_rental", value: 250 });
    expect(rental.earned).toBe(250);
    expect(calculateVenueEarnings({ ...base, attendees: 0, model: "upfront_rental", value: 250 }).earned).toBe(250);
  });

  // The one that would have been actively misleading: a sponsorship is money
  // leaving the venue. Counting it as income would have told Noor Coffee they
  // had earned the 50 they were being asked to pay.
  it("records a sponsorship as owed, never as earned", () => {
    const { earned, owed } = calculateVenueEarnings({ ...base, model: "venue_sponsored", value: 50 });
    expect(earned).toBe(0);
    expect(owed).toBe(50);
  });

  it("reports nothing for arrangements settled at the counter", () => {
    for (const model of ["access_only", "minimum_spend"]) {
      const result = calculateVenueEarnings({ ...base, model, value: 300 });
      expect(result).toMatchObject({ earned: 0, owed: 0, offPlatform: true });
    }
  });

  it("returns zero rather than guessing on an unknown deal", () => {
    expect(calculateVenueEarnings({ ...base, model: "something_else", value: 999 }))
      .toEqual({ earned: 0, owed: 0, offPlatform: false });
  });

  it("survives missing numbers instead of producing NaN", () => {
    const result = calculateVenueEarnings({
      model: "revenue_share",
      value: Number.NaN,
      grossRevenue: Number.NaN,
      attendees: Number.NaN,
    });
    expect(result.earned).toBe(0);
  });
});

describe("getVenueDealDirection", () => {
  it("knows which way the money moves", () => {
    expect(getVenueDealDirection("venue_sponsored")).toBe("venue_pays_creator");
    expect(getVenueDealDirection("upfront_rental")).toBe("creator_pays_venue");
    expect(getVenueDealDirection("revenue_share")).toBe("attendee_funded");
    expect(getVenueDealDirection("nonsense")).toBeNull();
  });
});
