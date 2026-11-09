import { describe, expect, it } from "vitest";
import { createChargeAllocator } from "../payoutRules";

describe("paying partners from the event's own charges", () => {
  it("takes each share from the charges in turn, splitting across charges when needed", () => {
    const take = createChargeAllocator([{ chargeId: "ch_1", availableCents: 1000 }, { chargeId: "ch_2", availableCents: 500 }]);
    expect(take(700)).toEqual([{ chargeId: "ch_1", amountCents: 700 }]);
    expect(take(600)).toEqual([{ chargeId: "ch_1", amountCents: 300 }, { chargeId: "ch_2", amountCents: 300 }]);
  });

  it("falls back to the balance only for what the charges cannot cover", () => {
    const take = createChargeAllocator([{ chargeId: "ch_1", availableCents: 200 }]);
    expect(take(500)).toEqual([{ chargeId: "ch_1", amountCents: 200 }, { chargeId: null, amountCents: 300 }]);
    expect(createChargeAllocator([])(100)).toEqual([{ chargeId: null, amountCents: 100 }]);
  });
});
