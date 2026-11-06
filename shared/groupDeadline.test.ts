import { describe, expect, it } from "vitest";
import { bookingClosedMessage, hasMissedGroupDeadline } from "./eventLifecycle";

const now = new Date("2026-11-06T12:00:00Z");
const group = { requireMinimumParticipants: true, mvgStatus: "pending", startDate: "2026-11-20T09:00:00Z" };

describe("ticket sales after a minimum-group deadline", () => {
  it("close once the deadline has passed without the group", () => {
    expect(hasMissedGroupDeadline({ ...group, mvgDeadline: "2026-11-05T22:00:00Z" }, now)).toBe(true);
    expect(bookingClosedMessage({ ...group, mvgDeadline: "2026-11-05T22:00:00Z" }, now)).toMatch(/minimum group was not reached/);
  });

  it("stay open before the deadline, once the group is reached, and for ordinary events", () => {
    expect(hasMissedGroupDeadline({ ...group, mvgDeadline: "2026-11-10T22:00:00Z" }, now)).toBe(false);
    expect(hasMissedGroupDeadline({ ...group, mvgStatus: "met", mvgDeadline: "2026-11-05T22:00:00Z" }, now)).toBe(false);
    expect(hasMissedGroupDeadline({ requireMinimumParticipants: false, mvgDeadline: "2026-11-05T22:00:00Z" }, now)).toBe(false);
    expect(bookingClosedMessage({ ...group, mvgDeadline: "2026-11-10T22:00:00Z" }, now)).toBeNull();
  });

  it("close for a group the scheduler already marked failed", () => {
    expect(hasMissedGroupDeadline({ ...group, mvgStatus: "failed", mvgDeadline: null }, now)).toBe(true);
  });
});
