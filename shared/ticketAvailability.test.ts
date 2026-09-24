import { describe, expect, it } from "vitest";
import { availableBookingQuantity, eventCapacity, ticketRegistrationCounts, withTicketCapacity } from "./ticketAvailability";

const tickets = [
  { id: "sprint", ticketName: "Sprint", ticketCapacity: 40, soldCount: 0 },
  { id: "double", ticketName: "Double", ticketCapacity: 40, soldCount: 0 },
];
const event = { maxParticipants: 60, ticketSkus: tickets };
const booking = (id: string | null, quantity = 1, status = "pending") => ({ ticketSkuId: id, ticketQuantity: quantity, status });

describe("live ticket capacity and headcounts", () => {
  it("uses 40 + 40 even when the old event field is still 60", () => {
    expect(eventCapacity(event)).toBe(80);
    expect(withTicketCapacity(event).maxParticipants).toBe(80);
    expect(event.maxParticipants).toBe(60);
    expect(availableBookingQuantity(event, [booking("sprint", 30), booking("double", 30)], "double")).toBe(10);
  });

  it("reports 25 people in each distance, including a two-person booking", () => {
    const registrations = [
      ...Array.from({ length: 23 }, () => booking("sprint")), booking("sprint", 2),
      ...Array.from({ length: 25 }, () => booking("double")),
    ];
    expect(ticketRegistrationCounts(tickets, registrations)).toEqual([
      { ticketSkuId: "sprint", ticketName: "Sprint", capacity: 40, registered: 25, remaining: 15 },
      { ticketSkuId: "double", ticketName: "Double", capacity: 40, registered: 25, remaining: 15 },
    ]);
  });

  it("cannot use Double's spare seats when Sprint is full", () => {
    const registrations = [booking("sprint", 40), booking("double", 25)];
    expect(availableBookingQuantity(event, registrations, "sprint")).toBe(0);
    expect(availableBookingQuantity(event, registrations, "double")).toBe(15);
  });

  it("frees cancelled/refunded/failed bookings and counts all active statuses", () => {
    const registrations = [
      ...["pending", "deposit_authorized", "deposit_paid", "confirmed", "fully_paid"].map(status => booking("sprint", 2, status)),
      ...["cancelled", "refunded", "failed"].map(status => booking("sprint", 20, status)),
      { ...booking("sprint", 20), cancelledAt: new Date() },
    ];
    expect(ticketRegistrationCounts(tickets, registrations)[0].registered).toBe(10);
    expect(availableBookingQuantity(event, registrations, "sprint")).toBe(30);
  });

  it("keeps old/unassigned registrations visible and enforces the total around them", () => {
    const registrations = [booking("sprint", 35), booking("double", 35), booking(null, 5), booking("deleted-ticket", 4)];
    const rows = ticketRegistrationCounts(tickets, registrations);
    expect(rows.at(-1)?.registered).toBe(9);
    expect(rows.reduce((total, row) => total + row.registered, 0)).toBe(79);
    expect(availableBookingQuantity(event, registrations, "double")).toBe(1);
  });

  it("handles room and legacy ticket IDs the same way checkout does", () => {
    expect(ticketRegistrationCounts([
      { sourceRoomId: "room", ticketCapacity: 3 }, { ticketCapacity: 4 },
    ], [booking("room", 2), booking("ticket-1", 3)]).map(row => row.remaining)).toEqual([1, 1]);
  });

  it("keeps zero capacity sold out and does not invent totals for incomplete tickets", () => {
    expect(eventCapacity({ maxParticipants: 60, ticketSkus: [{ ticketCapacity: 0 }] })).toBe(0);
    expect(eventCapacity({ maxParticipants: 60, ticketSkus: [{ ticketCapacity: "40" }, {}] })).toBe(60);
    expect(eventCapacity({ maxParticipants: 60, ticketSkus: [] })).toBe(60);
    expect(eventCapacity({})).toBeNull();
  });
});
