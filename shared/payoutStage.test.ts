import { describe, expect, it } from "vitest";
import { commissionStage, eventPayoutStage } from "./payoutStage";

const now = new Date("2026-11-09T12:00:00Z");

describe("coming, secured, paid", () => {
  it("is coming before the event and while the group forms", () => {
    expect(eventPayoutStage({ eventEnd: "2026-11-15T20:00:00Z" }, now).stage).toBe("coming");
    expect(eventPayoutStage({ eventEnd: "2026-11-01T20:00:00Z", requireMinimumParticipants: true, mvgStatus: "pending" }, now).stage).toBe("coming");
  });

  it("is secured once the event happened, with the payout date", () => {
    const info = eventPayoutStage({ eventEnd: "2026-11-08T20:00:00Z", requireMinimumParticipants: true, mvgStatus: "met", scheduledFor: "2026-11-09T20:00:00Z" }, now);
    expect(info).toMatchObject({ stage: "secured", date: "2026-11-09T20:00:00.000Z" });
    expect(info.label).toBe("Secured, paid out on 9 Nov");
  });

  it("is paid once the payout went through, with the day", () => {
    expect(eventPayoutStage({ payoutStatus: "completed", processedAt: "2026-11-09T10:00:00Z" }, now).label).toBe("Paid on 9 Nov");
  });

  it("reads partner commissions the same way", () => {
    expect(commissionStage("estimated")?.label).toBe("Coming");
    expect(commissionStage("locked")?.label).toBe("Secured");
    expect(commissionStage("paid", "2026-11-09T10:00:00Z")?.label).toBe("Paid on 9 Nov");
    expect(commissionStage("voided")).toBeNull();
  });
});
