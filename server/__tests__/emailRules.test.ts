import { describe, expect, it } from "vitest";
import { resolveBookingEmailDecision } from "../emailRules";

describe("resolveBookingEmailDecision", () => {
  it("uses the post-booking count for pre-MVG remaining spots", () => {
    expect(resolveBookingEmailDecision({
      requireMinimumParticipants: true,
      minimumParticipants: 5,
      currentParticipants: 3,
      mvgStatus: "pending",
    })).toEqual({ kind: "pre_mvg", remainingMvgSpots: 2 });
  });

  it("waits for the MVG transition when the new booking reaches the threshold", () => {
    expect(resolveBookingEmailDecision({
      requireMinimumParticipants: true,
      minimumParticipants: 5,
      currentParticipants: 5,
      mvgStatus: "pending",
    })).toEqual({ kind: "awaiting_confirmation", remainingMvgSpots: 0 });
  });

  it("selects confirmation for events without MVG", () => {
    expect(resolveBookingEmailDecision({
      requireMinimumParticipants: false,
      minimumParticipants: 0,
      currentParticipants: 1,
    }).kind).toBe("confirmed");
  });

  it("selects confirmation when MVG is already met", () => {
    expect(resolveBookingEmailDecision({
      requireMinimumParticipants: true,
      minimumParticipants: 10,
      currentParticipants: 6,
      mvgStatus: "met",
    }).kind).toBe("confirmed");
  });
});
