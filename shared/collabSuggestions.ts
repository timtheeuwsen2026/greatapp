/**
 * Organic matches — the collaborations nobody posted.
 *
 * Collab Opportunities only ever showed things somebody had actively posted: an
 * event seeking a space, a venue broadcasting a free date, a rough idea looking
 * for anyone. That is a high-intent, time-bound queue, and it is the right
 * default. But it means a venue with an empty Tuesday and a creator who runs
 * exactly the kind of thing that fills Tuesdays never find each other unless
 * one of them happens to write a post.
 *
 * This is the other half: standing preferences matched against live listings,
 * with nothing posted at either end. Kept in a separate tab rather than merged
 * into the feed, because mixing a "might also fit" suggestion with an event that
 * needs a venue by Friday buries the one that matters. The competitor has only
 * the posted half.
 *
 * Until the standing-preferences form from Addendum 1 exists, the preferences
 * are read off the profile the account already filled in — a venue's city and
 * capacity, a creator's base and the categories they work in. Deliberately a
 * filter with a stated reason attached, not a score: at these volumes a match
 * a person cannot explain to themselves is a match they ignore.
 */

export type StandingPreferences = {
  role: string;
  /** Where they work. Either side containing the other counts as a hit. */
  city?: string | null;
  region?: string | null;
  /** Categories, expertise tags or space types — matched loosely against each other. */
  categories?: string[] | null;
  /** The largest group they can take. Zero or absent means "no ceiling stated". */
  capacity?: number | null;
};

export type SuggestionCandidate = {
  kind: string;
  id: string;
  title: string;
  city?: string | null;
  region?: string | null;
  location?: string | null;
  categories?: string[] | null;
  /** How many people the listing expects. */
  groupSize?: number | null;
};

export type SuggestionMatch = {
  matched: boolean;
  /** Plain words for why, shown on the card. Never a percentage. */
  reasons: string[];
};

function normalise(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** "Costa Brava area" will not equal "Palafrugell", so either containing the other counts. */
export function placesOverlap(
  wanted: Array<string | null | undefined>,
  offered: Array<string | null | undefined>,
): boolean {
  const a = wanted.map(normalise).filter(Boolean);
  const b = offered.map(normalise).filter(Boolean);
  if (!a.length || !b.length) return false;
  return b.some((place) => a.some((want) => place === want || place.includes(want) || want.includes(place)));
}

export function categoriesOverlap(
  wanted: string[] | null | undefined,
  offered: string[] | null | undefined,
): string | null {
  const a = (wanted || []).map(normalise).filter(Boolean);
  const b = (offered || []).map(normalise).filter(Boolean);
  if (!a.length || !b.length) return null;
  for (const want of a) {
    for (const offer of b) {
      if (offer === want || offer.includes(want) || want.includes(offer)) return offer;
    }
  }
  return null;
}

/**
 * Does this listing plausibly suit someone with these standing preferences?
 *
 * A preference that was never stated is skipped rather than treated as a
 * requirement — an unstated field must never silently exclude everybody. But a
 * match on nothing at all is not a suggestion, so at least one real reason is
 * required before it is offered.
 */
export function matchesStandingPreferences(
  preferences: StandingPreferences,
  candidate: SuggestionCandidate,
): SuggestionMatch {
  const reasons: string[] = [];

  const wantedPlaces = [preferences.city, preferences.region];
  const offeredPlaces = [candidate.city, candidate.region, candidate.location];
  if (wantedPlaces.some(Boolean) && offeredPlaces.some(Boolean)) {
    if (!placesOverlap(wantedPlaces, offeredPlaces)) {
      return { matched: false, reasons: [] };
    }
    reasons.push(`In ${candidate.city || candidate.location || candidate.region}`);
  }

  const categoryHit = categoriesOverlap(preferences.categories, candidate.categories);
  if (categoryHit) {
    reasons.push(`Matches ${categoryHit.replace(/_/g, " ")}`);
  }

  // A group larger than the space can hold is not a suggestion, it is a waste
  // of both parties' time.
  const capacity = Number(preferences.capacity);
  const groupSize = Number(candidate.groupSize);
  if (Number.isFinite(capacity) && capacity > 0 && Number.isFinite(groupSize) && groupSize > 0) {
    if (groupSize > capacity) return { matched: false, reasons: [] };
    reasons.push(`${groupSize} people — fits your space`);
  }

  return { matched: reasons.length > 0, reasons };
}
