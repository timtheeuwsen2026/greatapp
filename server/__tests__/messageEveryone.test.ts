import { describe, expect, it, vi } from "vitest";
import { routeFunction, routeResponse } from "../../tests/routeHarness";

// "Message everyone" on the organiser's Orders (Tim, 66.35, board D2).
function route(event: any, bookings: any[]) {
  const storage = {
    getExperience: vi.fn(async () => event),
    getBookingsByExperience: vi.fn(async () => bookings),
    getUser: vi.fn(async (id: string) => ({ id, firstName: id, email: `${id}@example.test` })),
    createAnnouncement: vi.fn(async (data: any) => ({ id: "a1", ...data })),
    addUserNotice: vi.fn(async () => {}),
  };
  const notificationService = { sendVenueDealUpdateEmail: vi.fn(async () => {}) };
  const run = routeFunction("/api/creator/experiences/:experienceId/message-everyone", {
    storage, notificationService, checkIsAdmin: async () => false, formatEventWhen: () => "Sat 21 Nov 2026, 19:00",
  }, "post");
  return { storage, notificationService, run };
}

const event = { id: "e1", slug: "test-1", title: "TEST 1", creatorId: "organiser" };
const bookings = [
  { id: "b1", userId: "koper1", status: "fully_paid" },
  { id: "b2", userId: "koper1", status: "fully_paid" },
  { id: "b3", userId: "koper2", status: "refunded", cancelledAt: "2026-11-09T12:00:00Z" },
  { id: "b4", userId: "marta", status: "pending" },
];

describe("message everyone who booked", () => {
  it("reaches each person whose booking still stands, once, by notice and mail", async () => {
    const { storage, notificationService, run } = route(event, bookings);
    const res = routeResponse();
    await run({ params: { experienceId: "e1" }, body: { message: "Meet at 9:15" }, user: { claims: { sub: "organiser" } } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ sent: 2 });
    expect(storage.createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ experienceId: "e1", content: "Meet at 9:15" }));
    const noticed = storage.addUserNotice.mock.calls.map((call: any[]) => call[0].userId).sort();
    expect(noticed).toEqual(["koper1", "marta"]);
    expect(notificationService.sendVenueDealUpdateEmail).toHaveBeenCalledTimes(2);
  });

  it("refuses anyone but the organiser", async () => {
    const { storage, run } = route(event, bookings);
    const res = routeResponse();
    await run({ params: { experienceId: "e1" }, body: { message: "Hi" }, user: { claims: { sub: "someone-else" } } }, res);
    expect(res.statusCode).toBe(403);
    expect(storage.createAnnouncement).not.toHaveBeenCalled();
  });

  it("needs a message", async () => {
    const { run } = route(event, bookings);
    const res = routeResponse();
    await run({ params: { experienceId: "e1" }, body: { message: "   " }, user: { claims: { sub: "organiser" } } }, res);
    expect(res.statusCode).toBe(400);
  });
});
