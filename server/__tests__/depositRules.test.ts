import { describe, expect, it } from "vitest";
import { getDepositSchedule, isSingleDayExperience } from "../../shared/depositRules";

describe("deposit scheduling rules", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("disables deposits for explicit one-day events", () => {
    const result = getDepositSchedule({
      experienceType: "one-day",
      startDate: "2026-08-20T08:00:00.000Z",
      endDate: "2026-08-20T18:00:00.000Z",
      balanceDueDays: 14,
      depositAmount: 25,
      now,
    });

    expect(result).toEqual({ available: false, balanceDueDate: null, reason: "single_day" });
  });

  it("recognizes legacy same-date events as single-day", () => {
    expect(isSingleDayExperience({
      experienceType: null,
      startDate: "2026-08-20T08:00:00.000Z",
      endDate: "2026-08-20T18:00:00.000Z",
    })).toBe(true);
  });

  it("disables a deposit when its balance date would be in the past", () => {
    const result = getDepositSchedule({
      experienceType: "multi-day",
      startDate: "2026-07-20T08:00:00.000Z",
      endDate: "2026-07-24T18:00:00.000Z",
      balanceDueDays: 14,
      depositAmount: 100,
      now,
    });

    expect(result.reason).toBe("balance_due_not_future");
    expect(result.available).toBe(false);
  });

  it("returns the future balance date for an eligible multi-day trip", () => {
    const result = getDepositSchedule({
      experienceType: "multi-day",
      startDate: "2026-08-20T08:00:00.000Z",
      endDate: "2026-08-24T18:00:00.000Z",
      balanceDueDays: 14,
      depositAmount: 100,
      now,
    });

    expect(result.available).toBe(true);
    expect(result.balanceDueDate?.toISOString()).toBe("2026-08-06T08:00:00.000Z");
  });
});
