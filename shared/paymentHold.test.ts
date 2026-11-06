import { describe, expect, it } from "vitest";
import { paymentHeldUntilGroupMet } from "./paymentHold";

describe("when a card is only held", () => {
  it("holds while a minimum group is still forming", () => {
    expect(paymentHeldUntilGroupMet({ requireMinimumParticipants: true, mvgStatus: "pending" })).toBe(true);
    expect(paymentHeldUntilGroupMet({ requireMinimumParticipants: false, mvgStatus: null }, true)).toBe(true);
  });

  it("charges once the group is reached, and for an ordinary event", () => {
    expect(paymentHeldUntilGroupMet({ requireMinimumParticipants: true, mvgStatus: "met" })).toBe(false);
    expect(paymentHeldUntilGroupMet({ requireMinimumParticipants: true, mvgStatus: "met" }, true)).toBe(false);
    expect(paymentHeldUntilGroupMet({ requireMinimumParticipants: false, mvgStatus: null })).toBe(false);
  });
});
