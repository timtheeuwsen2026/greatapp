import { describe, expect, it } from "vitest";
import { buildEventOrders, eventOrderTotals, eventOrdersCsv } from "./eventOrders";
import { buildVenueAgreement, agreementLines, agreementNumber } from "./venueAgreement";

const people = new Map([
  ["u1", { firstName: "Koper", lastName: "Een", email: "koper1@example.test" }],
  ["u2", { firstName: "Koper", lastName: "Twee", email: "koper2@example.test" }],
]);
const coffee = (quantity: number) => [{ name: "Coffee", quantity, total: 1.25 * quantity, venueAmount: 1 }];

// TEST 1: Koper 1 two bookings, Koper 2 one; Koper 2 cancelled later.
const bookings = [
  { id: "b1", userId: "u1", status: "fully_paid", ticketName: "Entry", ticketQuantity: 1, amount: "2.25", addonItems: coffee(1), createdAt: "2026-11-09T10:00:00Z" },
  { id: "b2", userId: "u1", status: "fully_paid", ticketName: "Entry", ticketQuantity: 1, amount: "1.00", addonItems: [], createdAt: "2026-11-09T10:05:00Z", addonRedeemedAt: null },
  { id: "b3", userId: "u2", status: "refunded", ticketName: "Entry", ticketQuantity: 1, amount: "2.25", addonItems: coffee(1), createdAt: "2026-11-09T10:10:00Z", cancelledAt: "2026-11-09T12:00:00Z" },
  { id: "b4", userId: "u2", status: "failed", ticketName: "Entry", ticketQuantity: 1, amount: "1.00" },
];

describe("buildEventOrders (58.1, 58.2)", () => {
  it("lists one row per booking, first name and initial for the venue", () => {
    const rows = buildEventOrders(bookings, people, "venue");
    expect(rows.map((row) => row.bookingId)).toEqual(["b1", "b2", "b3"]); // failed is never an order
    expect(rows[0]).toMatchObject({ person: "Koper E.", email: null, ticketName: "Entry", amount: 2.25, status: "paid" });
    expect(rows[0].addons).toEqual([{ name: "Coffee", quantity: 1, total: 1.25, venueAmount: 1 }]);
    expect(rows[2].status).toBe("refunded");
  });

  it("gives the organiser full names and email", () => {
    expect(buildEventOrders(bookings, people, "organiser")[0]).toMatchObject({ person: "Koper Een", email: "koper1@example.test" });
  });

  it("does not count cancelled and refunded orders in the totals", () => {
    const rows = buildEventOrders(bookings.map((b) => (b.id === "b1" ? { ...b, addonRedeemedAt: "2026-11-10T09:00:00Z" } : b)), people, "venue");
    expect(eventOrderTotals(rows)).toEqual({
      orders: 2,
      tickets: 2,
      amount: 3.25,
      addons: [{ name: "Coffee", quantity: 1, handedOut: 1, venueAmount: 1, total: 1.25, margin: 0.25 }],
    });
  });

  it("exports the sheet as CSV with euro amounts", () => {
    const csv = eventOrdersCsv(buildEventOrders(bookings, people, "venue"), "venue").split("\n");
    expect(csv[0]).toBe("Person,Ticket,Tickets,Add-ons,Paid (EUR),Status,Checked in,Add-on handed out");
    expect(csv[1]).toBe("Koper E.,Entry,1,Coffee x 1,2.25,Paid,No,No");
  });
});

describe("buildVenueAgreement (57, board D3)", () => {
  const base = {
    contract: { id: "3f9a1c7e-aaaa", status: "accepted", model: "venue_barter", terms: { barterTerms: "We bring 50 runners" }, createdAt: "2026-11-09T09:00:00Z", acceptedAt: "2026-11-09T12:42:00Z" },
    event: { title: "TEST 1", when: "Tue 10 Nov 2026, 00:00", capacity: 5, price: 1, minimumGroup: null },
    organiser: { name: "Tim Organiser" },
    venue: { name: "Test Venue", address: "Ctra. de Montjuïc, 66, Barcelona" },
    addons: [{ name: "Coffee", unitPrice: 1.25, venueAmount: 1, organiserMargin: 0.25 }],
    history: [{ at: "2026-11-09T09:00:00Z", by: "organiser" as const, kind: "proposal" as const, model: "venue_barter", terms: {}, message: "We bring 50 runners" }],
    platformFeePct: 15,
  };

  it("numbers the agreement and says who agreed when", () => {
    const agreement = buildVenueAgreement({ ...base, viewer: "organiser" });
    expect(agreementNumber(base.contract)).toBe("GV-2026-3F9A1C");
    expect(agreement.number).toBe("GV-2026-3F9A1C");
    expect(agreement.agreedLine).toBe("Agreed on 9 Nov 2026, 13:42 by Tim Organiser and Test Venue.");
    expect(agreement.sections.map((section) => section.heading)).toEqual([
      "1. Parties and event", "2. What the organiser brings", "3. What the venue brings",
      "4. Who gets what", "5. Cancellation and refunds", "6. Changes",
    ]);
    expect(agreement.parties).toEqual([
      { role: "Organiser", name: "Tim Organiser", acceptedAt: "2026-11-09T09:00:00.000Z" },
      { role: "Venue", name: "Test Venue", acceptedAt: "2026-11-09T12:42:00.000Z" },
    ]);
  });

  it("puts the organiser's barter words in term 2 and the add-on pay in term 4", () => {
    const text = agreementLines(buildVenueAgreement({ ...base, viewer: "organiser" })).join("\n");
    expect(text).toContain('As written by the organiser: "We bring 50 runners"');
    expect(text).toContain("Tickets €0.00, add-ons €1.00 per Coffee paid to the venue.");
    expect(text).toContain("platform fee of 15% of tickets");
  });

  it("never shows the venue the platform fee or the organiser's margin", () => {
    const text = agreementLines(buildVenueAgreement({ ...base, viewer: "venue" })).join("\n");
    expect(text).not.toContain("15%");
    expect(text).not.toContain("keeps the margin");
  });

  it("credits the venue with the final offer after an accepted counter", () => {
    const agreement = buildVenueAgreement({
      ...base,
      viewer: "venue",
      history: [...base.history, { at: "2026-11-09T11:00:00Z", by: "venue", kind: "counter", model: "fixed_fee", terms: {}, message: "", status: "accepted" }],
    });
    expect(agreement.parties[1].acceptedAt).toBe("2026-11-09T11:00:00.000Z");
    expect(agreement.parties[0].acceptedAt).toBe("2026-11-09T12:42:00.000Z");
  });
});
