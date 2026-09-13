import { describe, expect, it } from "vitest";
import {
  calculateTicketDeduction,
  calculateTicketDeductionCents,
  calculateTicketDeductionForCount,
  normalizeTicketQuantity,
  sumBookingTicketQuantity,
} from "./ticketDeduction";

describe("ticket deduction", () => {
  it("charges the fixed deduction once per ticket in a group purchase", () => {
    expect(calculateTicketDeduction(0.5, 3)).toBe(1.5);
    expect(calculateTicketDeductionCents("0.50", 3)).toBe(150);
  });

  it("rounds the per-ticket fee to currency cents before multiplying", () => {
    expect(calculateTicketDeductionCents(0.105, 3)).toBe(33);
  });

  it("sums group-booking quantities while preserving legacy one-ticket rows", () => {
    expect(sumBookingTicketQuantity([
      { ticketQuantity: 3 },
      { ticketQuantity: "2" },
      {},
    ])).toBe(6);
  });

  it("normalizes invalid persisted quantities to one ticket", () => {
    expect(normalizeTicketQuantity(0)).toBe(1);
    expect(normalizeTicketQuantity(-2)).toBe(1);
    expect(normalizeTicketQuantity(1.5)).toBe(1);
  });
});

describe("calculateTicketDeductionForCount", () => {
  it("is zero when no paid ticket is sold — the Free RSVP case", () => {
    // 40 Free RSVPs with a €3 ticket deduction owed the venue €3 before this,
    // because the booking-shaped helper floors a missing quantity at one.
    expect(calculateTicketDeductionForCount(3, 0)).toBe(0);
  });

  it("multiplies out across paid tickets", () => {
    expect(calculateTicketDeductionForCount(3, 40)).toBe(120);
  });

  it("stays exact on amounts that do not divide cleanly", () => {
    expect(calculateTicketDeductionForCount(0.1, 3)).toBe(0.3);
    expect(calculateTicketDeductionForCount(2.35, 7)).toBe(16.45);
  });

  it("is zero for a missing, negative or unparseable count", () => {
    expect(calculateTicketDeductionForCount(3, null)).toBe(0);
    expect(calculateTicketDeductionForCount(3, -4)).toBe(0);
    expect(calculateTicketDeductionForCount(3, "many")).toBe(0);
  });

  it("is zero when there is no deduction to charge", () => {
    expect(calculateTicketDeductionForCount(0, 40)).toBe(0);
    expect(calculateTicketDeductionForCount(null, 40)).toBe(0);
  });
});
