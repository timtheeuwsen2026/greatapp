import { describe, expect, it } from "vitest";
import {
  calculateTicketDeduction,
  calculateTicketDeductionCents,
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
