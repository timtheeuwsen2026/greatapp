import { describe, expect, it } from "vitest";
import {
  COUNTER_SENT_STATUS_LABEL,
  isCounterAwaitingCreator,
} from "./venueOfferStatus";

describe("venue offer dashboard status", () => {
  it("keeps a countered contract in the awaiting-creator state", () => {
    expect(isCounterAwaitingCreator("countered")).toBe(true);
    expect(COUNTER_SENT_STATUS_LABEL).toBe("Counter Sent - Awaiting Creator");
  });

  it("leaves incoming pending offers actionable", () => {
    expect(isCounterAwaitingCreator("pending")).toBe(false);
  });
});
