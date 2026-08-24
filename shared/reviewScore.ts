/**
 * How a rating becomes a public score.
 *
 * An organiser's score is the number they will use to pitch venues, and a
 * venue's is what a creator judges them on. One early review should not be
 * able to swing either, so nothing is shown publicly until there are enough of
 * them to mean something.
 *
 * Shared because the badge, the venue page and the API all have to agree. Two
 * implementations of "enough reviews" would eventually disagree, and the one
 * that disagreed quietly would be the one on the public page.
 */

/** Below this, a score is noise rather than a signal. */
export const MIN_PUBLIC_REVIEWS = 5;

export type ReviewScoreInput = { rating: number | string | null | undefined };

export type ReviewScore = {
  /** Reviews counted, whether or not the score is shown. */
  count: number;
  /** Mean rating to one decimal, or null when there are none. */
  average: number | null;
  /** True once there are enough reviews to publish a number. */
  isPublic: boolean;
  /** How many more are needed before the score appears. */
  remaining: number;
};

export function summariseReviewScore(reviews: ReviewScoreInput[] | null | undefined): ReviewScore {
  const ratings = (reviews ?? [])
    .map((review) => Number(review?.rating))
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);

  const count = ratings.length;
  if (count === 0) {
    return { count: 0, average: null, isPublic: false, remaining: MIN_PUBLIC_REVIEWS };
  }

  const average = Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / count) * 10) / 10;
  return {
    count,
    average,
    isPublic: count >= MIN_PUBLIC_REVIEWS,
    remaining: Math.max(0, MIN_PUBLIC_REVIEWS - count),
  };
}

/**
 * What to show where a score would go.
 *
 * "New" rather than a number, so a venue with two five-star reviews does not
 * read as better than one with fifty averaging 4.8.
 */
export function formatReviewScore(score: ReviewScore): string {
  if (!score.isPublic) return "New";
  return score.average!.toFixed(1);
}
