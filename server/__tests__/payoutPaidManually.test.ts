import { describe, expect, it, vi } from "vitest";
import { routeFunction, routeResponse } from "../../tests/routeHarness";

// A payout paid outside Stripe is closed so Great can never pay it again.

function route(payout: any, settled: "paid" | "partly_paid" | "open" = "open") {
  const storage = {
    getScheduledPayoutById: vi.fn(async () => payout),
    getUser: vi.fn(async () => ({ email: "tim@example.com" })),
    updateScheduledPayout: vi.fn(async (_id: string, data: any) => ({ ...payout, ...data })),
  };
  const commissionWhere = vi.fn(async () => {});
  const settlePayoutIfFullyPaid = vi.fn(async () => settled);
  const db = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: commissionWhere })) })) };
  const run = routeFunction("/api/admin/scheduled-payouts/:id/mark-paid-manually", {
    storage, db, bookings: {}, and: vi.fn(), eq: vi.fn(), inArray: vi.fn(), checkIsAdmin: async () => true,
    settlePayoutIfFullyPaid,
  }, "post");
  return { storage, db, run, settlePayoutIfFullyPaid };
}

const request = (note: string, recipientKey?: string) => ({ params: { id: "p1" }, body: { note, recipientKey }, user: { claims: { sub: "admin" } } });

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

  it("settles one person paid outside Stripe and leaves the payout to pay everyone else", async () => {
    const { storage, run } = route({ id: "p1", experienceId: "e1", status: "failed", stripeTransferIds: { creator: "tr_1" } });
    const res = routeResponse();
    await run(request("Bank transfer to the venue on 9 Nov", "venue"), res);

    expect(res.statusCode).toBe(200);
    expect(storage.updateScheduledPayout).toHaveBeenCalledWith("p1", {
      stripeTransferIds: { creator: "tr_1", venue: expect.stringMatching(/^manual: Bank transfer to the venue on 9 Nov/) },
    });
    expect(res.body.message).toMatch(/payout run will pay everyone else/);
  });

  it("closes the payout once the last share is paid by hand, instead of leaving it Failed (66.29c)", async () => {
    const { run, settlePayoutIfFullyPaid } = route({ id: "p1", experienceId: "e1", status: "failed", stripeTransferIds: { creator: "manual: x" } }, "paid");
    const res = routeResponse();
    await run(request("Bank transfer to the venue on 9 Nov", "venue"), res);

    expect(settlePayoutIfFullyPaid).toHaveBeenCalledWith("p1");
    expect(res.body.message).toMatch(/now Paid/);
  });

  it("does not settle a share twice", async () => {
    const { storage, run } = route({ id: "p1", experienceId: "e1", status: "pending", stripeTransferIds: { venue: "tr_9" } });
    const res = routeResponse();
    await run(request("Bank transfer", "venue"), res);
    expect(res.statusCode).toBe(409);
    expect(storage.updateScheduledPayout).not.toHaveBeenCalled();
  });
});
