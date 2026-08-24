import { describe, expect, it } from "vitest";
import { MIN_PUBLIC_REVIEWS, formatReviewScore, summariseReviewScore } from "./reviewScore";

// A single early review should not be able to swing the number an organiser
// pitches venues with, or the one a creator judges a venue on.

const ratings = (...values: number[]) => values.map((rating) => ({ rating }));

describe("summariseReviewScore", () => {
  it("shows nothing at all before anyone has reviewed", () => {
    expect(summariseReviewScore([])).toEqual({
      count: 0,
      average: null,
      isPublic: false,
      remaining: MIN_PUBLIC_REVIEWS,
    });
  });

  it("counts reviews but withholds the score below the threshold", () => {
    const score = summariseReviewScore(ratings(5, 5, 5, 5));
    expect(score.count).toBe(4);
    expect(score.average).toBe(5);
    expect(score.isPublic).toBe(false);
    expect(score.remaining).toBe(1);
  });

  it("publishes the score on the fifth review", () => {
    const score = summariseReviewScore(ratings(5, 4, 5, 4, 5));
    expect(score.count).toBe(5);
    expect(score.isPublic).toBe(true);
    expect(score.remaining).toBe(0);
  });

  it("rounds the average to one decimal", () => {
    // 4+5+4+5+3 = 21 / 5 = 4.2
    expect(summariseReviewScore(ratings(4, 5, 4, 5, 3)).average).toBe(4.2);
    // 5+4+4+4+4+4+4 = 29 / 7 = 4.142…
    expect(summariseReviewScore(ratings(5, 4, 4, 4, 4, 4, 4)).average).toBe(4.1);
  });

  it("ignores ratings outside 1 to 5 rather than letting them drag the average", () => {
    const score = summariseReviewScore([
      ...ratings(5, 5, 5, 5, 5),
      { rating: 0 },
      { rating: 9 },
      { rating: Number.NaN },
      { rating: null as any },
    ]);
    expect(score.count).toBe(5);
    expect(score.average).toBe(5);
  });

  it("accepts ratings that arrive as strings from the database", () => {
    const score = summariseReviewScore([
      { rating: "5" }, { rating: "4" }, { rating: "5" }, { rating: "4" }, { rating: "5" },
    ]);
    expect(score.count).toBe(5);
    expect(score.average).toBe(4.6);
  });

  it("survives a missing list", () => {
    expect(summariseReviewScore(undefined).count).toBe(0);
    expect(summariseReviewScore(null).isPublic).toBe(false);
  });
});

describe("formatReviewScore", () => {
  it('shows "New" while the score is still being withheld', () => {
    expect(formatReviewScore(summariseReviewScore(ratings(5, 5)))).toBe("New");
    expect(formatReviewScore(summariseReviewScore([]))).toBe("New");
  });

  it("shows one decimal once it is public", () => {
    expect(formatReviewScore(summariseReviewScore(ratings(5, 5, 5, 5, 5)))).toBe("5.0");
    expect(formatReviewScore(summariseReviewScore(ratings(4, 5, 4, 5, 3)))).toBe("4.2");
  });
});
