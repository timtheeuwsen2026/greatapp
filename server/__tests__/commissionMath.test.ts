import { describe, expect, it } from "vitest";
import { calculateCommission } from "../commissionService";

describe("referral commission math", () => {
  it("preserves cents for a percentage commission", () => {
    expect(calculateCommission(
      { mode: "percent", value: 10, basis: "per_spot" },
      5,
      1,
      5,
    )).toBe(0.5);
  });

  it("rounds monetary results to two decimals", () => {
    expect(calculateCommission(
      { mode: "percent", value: 12.5, basis: "per_booking" },
      9.99,
      1,
      9.99,
    )).toBe(1.25);
  });
});
