import { describe, expect, it } from "vitest";
import {
  calculateMvgPercentage,
  formatCapacityParticipantCount,
  formatMvgParticipantCount,
} from "./participantCounts";

describe("participant count displays", () => {
  it("uses the MVG as a target while an event is forming", () => {
    expect(formatMvgParticipantCount(1, 3, false)).toBe("1 of 3 joined");
  });

  it("separates the achieved MVG from the total attendee count", () => {
    expect(formatMvgParticipantCount(4, 1, true)).toBe(
      "Minimum of 1 reached; 4 total joined",
    );
  });

  it("shows actual attendance against capacity after confirmation", () => {
    expect(formatCapacityParticipantCount(4, 25)).toBe("4 / 25 participants");
  });

  it("caps MVG completion percentages at 100", () => {
    expect(calculateMvgPercentage(4, 1)).toBe(100);
  });
});
