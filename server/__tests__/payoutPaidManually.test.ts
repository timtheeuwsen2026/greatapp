import { describe, expect, it, vi } from "vitest";
import { routeFunction, routeResponse } from "../../tests/routeHarness";

// A payout paid outside Stripe is closed so Great can never pay it again.

function route(payout: any) {
  const storage = {
    getScheduledPayoutById: vi.fn(async () => payout),
    getUser: vi.fn(async () => ({ email: "tim@example.com" })),
    updateScheduledPayout: vi.fn(async (_id: string, data: any) => ({ ...payout, ...data })),
  };
  const commissionWhere = vi.fn(async () => {});
  const db = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: commissionWhere })) })) };
  const run = routeFunction("/api/admin/scheduled-payouts/:id/mark-paid-manually", {
    storage, db, bookings: {}, and: vi.fn(), eq: vi.fn(), inArray: vi.fn(), checkIsAdmin: async () => true,
  }, "post");
  return { storage, db, run };
}

const request = (note: string) => ({ params: { id: "p1" }, body: { note }, user: { claims: { sub: "admin" } } });

describe("marking a payout paid manually", () => {
  it("closes a failed payout as completed, with how it was paid, and settles the commissions", async () => {
    const { storage, db, run } = route({ id: "p1", experienceId: "e1", status: "failed" });
    const res = routeResponse();
    await run(request("Bank transfer to Bandido on 6 Nov"), res);

    expect(res.statusCode).toBe(200);
    expect(storage.updateScheduledPayout).toHaveBeenCalledWith("p1", expect.objectContaining({
      status: "completed",
      errorMessage: expect.stringMatching(/^Paid manually: Bank transfer to Bandido on 6 Nov \(marked by tim@example.com/),
    }));
    expect(db.update).toHaveBeenCalled();
  });

  it("asks how it was paid", async () => {
    const { storage, run } = route({ id: "p1", experienceId: "e1", status: "failed" });
    const res = routeResponse();
    await run(request("  "), res);
    expect(res.statusCode).toBe(400);
    expect(storage.updateScheduledPayout).not.toHaveBeenCalled();
  });

  it("refuses a payout that has already gone through", async () => {
    const { storage, run } = route({ id: "p1", experienceId: "e1", status: "completed" });
    const res = routeResponse();
    await run(request("Bank transfer"), res);
    expect(res.statusCode).toBe(409);
    expect(storage.updateScheduledPayout).not.toHaveBeenCalled();
  });
});
