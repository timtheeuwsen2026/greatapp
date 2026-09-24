import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookings, experiences } from "@shared/schema";
import { BookingCapacityError } from "@shared/ticketAvailability";

const database = vi.hoisted(() => ({ transaction: vi.fn(), update: vi.fn(), insert: vi.fn() }));
vi.mock("../db", () => ({ db: database }));
import { DatabaseStorage } from "../storage";

const event = {
  id: "event", maxParticipants: 60,
  ticketSkus: [{ id: "sprint", ticketCapacity: 40 }, { id: "double", ticketCapacity: 40 }],
};

describe("booking capacity at persistence", () => {
  let saved: any[];
  let lockTail: Promise<void>;
  beforeEach(() => {
    saved = [{ ticketSkuId: "sprint", ticketQuantity: 39, status: "pending" }];
    lockTail = Promise.resolve();
    database.transaction.mockImplementation(async (run) => {
      let release: (() => void) | undefined;
      const tx = {
        select: () => ({ from: (table: unknown) => ({ where: () => {
          if (table === experiences) return {
            for: async (mode: string) => {
              expect(mode).toBe("update");
              const previous = lockTail;
              lockTail = new Promise<void>(resolve => { release = resolve; });
              await previous;
              return [event];
            },
          };
          expect(table).toBe(bookings);
          return Promise.resolve([...saved]);
        } }) }),
        insert: () => ({ values: (row: any) => ({ returning: async () => {
          saved.push(row);
          return [row];
        } }) }),
      };
      try { return await run(tx); } finally { release?.(); }
    });
  });

  const request = { experienceId: "event", userId: "user", ticketSkuId: "sprint", ticketQuantity: 1, amount: "0", status: "pending" } as any;

  it("lets only one of two concurrent RSVPs take the last place", async () => {
    const storage = new DatabaseStorage();
    const results = await Promise.allSettled([
      storage.createBooking({ ...request, userId: "first" }),
      storage.createBooking({ ...request, userId: "second" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BookingCapacityError);
    expect(rejected.reason.availableTickets).toBe(0);
    expect(saved).toHaveLength(2);
  });

  it("rejects a group larger than remaining stock without inserting it", async () => {
    await expect(new DatabaseStorage().createBooking({ ...request, ticketQuantity: 2 }))
      .rejects.toBeInstanceOf(BookingCapacityError);
    expect(saved).toHaveLength(1);
  });

  it("does not treat an unconfirmed payment intent as permission to overbook", async () => {
    await expect(new DatabaseStorage().createBooking({ ...request, ticketQuantity: 2, stripePaymentIntentId: "pi_unconfirmed" }))
      .rejects.toBeInstanceOf(BookingCapacityError);
  });

  it("preserves recovery of a verified in-flight payment", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await new DatabaseStorage().createBooking({ ...request, ticketQuantity: 2, stripePaymentIntentId: "pi_verified" }, { paymentInFlight: true });
    expect(saved).toHaveLength(2);
    warning.mockRestore();
  });

  it("persists ticket changes and the 80-place total together", async () => {
    let patch: any;
    database.update.mockReturnValue({ set: (value: any) => {
      patch = value;
      return { where: () => ({ returning: async () => [{ ...event, ...value }] }) };
    } });
    const storage = new DatabaseStorage();
    vi.spyOn(storage, "getExperience").mockResolvedValue({ ...event, experienceType: "one_day" } as any);
    vi.spyOn(storage, "syncDirectPromotionDeals").mockResolvedValue(undefined as any);
    const updated = await storage.updateExperience("event", { ticketSkus: event.ticketSkus } as any);
    expect(patch.maxParticipants).toBe(80);
    expect(updated.maxParticipants).toBe(80);
  });
});
