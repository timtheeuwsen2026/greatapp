/**
 * Who gets told about a newly posted Collab Idea.
 *
 * Deliberately a filter and nothing more — no scoring, no ranking, no learned
 * behaviour. At the volumes this starts at, a passive feed nobody remembers to
 * open is the failure mode worth designing against, and the cure is a
 * notification to the handful of profiles that plainly fit. A venue owner
 * either has room for twelve to sixteen people in the Costa Brava or does not.
 *
 * The rules are kept here rather than inline in a query so both sides can
 * explain a match in the same words the notification uses.
 */

export type CollabIdeaMatchInput = {
  seekingPartnerType?: string | null;
  city?: string | null;
  region?: string | null;
  venueCategory?: string | null;
  groupSizeMin?: number | null;
  groupSizeMax?: number | null;
};

export type VenueMatchCandidate = {
  id: string;
  ownerId?: string | null;
  name?: string | null;
  city?: string | null;
  region?: string | null;
  /** The venue's own category or space type, where it set one. */
  category?: string | null;
  venueType?: string | null;
  capacity?: number | null;
  standingCapacity?: number | null;
  status?: string | null;
};

function normalise(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** The largest number of people a space can take, however it recorded that. */
export function venueEffectiveCapacity(venue: VenueMatchCandidate): number {
  const values = [venue.capacity, venue.standingCapacity]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

/**
 * Does this space plausibly fit the idea?
 *
 * Every rule is skipped when the idea did not state that field: a poster who
 * left the category blank wants to hear from anyone in the right place, not
 * from nobody. An unstated field must never silently exclude everybody.
 */
export function venueMatchesCollabIdea(
  idea: CollabIdeaMatchInput,
  venue: VenueMatchCandidate,
): boolean {
  // Only spaces an organiser could actually book are worth interrupting.
  if (normalise(venue.status) !== "approved") return false;
  if (idea.seekingPartnerType && normalise(idea.seekingPartnerType) !== "venue") return false;

  const ideaCity = normalise(idea.city);
  const ideaRegion = normalise(idea.region);
  if (ideaCity || ideaRegion) {
    const venueCity = normalise(venue.city);
    const venueRegion = normalise(venue.region);
    const places = [venueCity, venueRegion].filter(Boolean);
    // "Costa Brava area, flexible" will not equal a venue's town, so either
    // side containing the other counts. Blunt, but it fails toward showing a
    // venue owner one extra idea rather than hiding a real one.
    const hit = places.some((place) =>
      [ideaCity, ideaRegion].filter(Boolean).some(
        (wanted) => place === wanted || place.includes(wanted) || wanted.includes(place),
      ),
    );
    if (!hit) return false;
  }

  const wantedCategory = normalise(idea.venueCategory);
  if (wantedCategory) {
    const venueCategory = normalise(venue.category) || normalise(venue.venueType);
    // A venue that never set a category still hears about it: silence there is
    // missing data, not a statement that it is the wrong kind of place.
    if (venueCategory && !venueCategory.includes(wantedCategory) && !wantedCategory.includes(venueCategory)) {
      return false;
    }
  }

  // Capacity is the one hard rule. A room that cannot hold the group is not a
  // near miss, and telling its owner about the idea wastes both sides' time.
  const needed = Number(idea.groupSizeMax ?? idea.groupSizeMin ?? 0);
  if (Number.isFinite(needed) && needed > 0) {
    const capacity = venueEffectiveCapacity(venue);
    if (capacity > 0 && capacity < needed) return false;
  }

  return true;
}

/** The idea's dates as one readable phrase — a period, not a date. */
export function formatCollabPeriod(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): string {
  const toDate = (value: Date | string | null | undefined): Date | null => {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const from = toDate(start);
  const to = toDate(end);
  const month = (date: Date) =>
    date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });

  if (!from && !to) return "No date yet";
  if (from && !to) return `From ${month(from)}`;
  if (!from && to) return `Before ${month(to!)}`;
  if (month(from!) === month(to!)) return month(from!);
  return `${month(from!)} – ${month(to!)}`;
}

/** "12–16 guests", or nothing when the poster did not say. */
export function formatCollabGroupSize(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  const low = Number(min);
  const high = Number(max);
  const hasLow = Number.isFinite(low) && low > 0;
  const hasHigh = Number.isFinite(high) && high > 0;

  if (hasLow && hasHigh) return low === high ? `${low} guests` : `${low}–${high} guests`;
  if (hasLow) return `${low}+ guests`;
  if (hasHigh) return `Up to ${high} guests`;
  return "";
}

/**
 * How long an idea stays open.
 *
 * A retreat is planned months out, so the default window has to clear the
 * period being proposed or the posting expires before anyone is thinking about
 * those dates yet.
 */
export function resolveCollabExpiry(
  estimatedEnd: Date | string | null | undefined,
  now: Date = new Date(),
): Date {
  const DEFAULT_DAYS = 60;
  const floor = new Date(now.getTime() + DEFAULT_DAYS * 86_400_000);

  const end = estimatedEnd
    ? (estimatedEnd instanceof Date ? estimatedEnd : new Date(estimatedEnd))
    : null;
  if (!end || Number.isNaN(end.getTime())) return floor;

  // Keep it open until the proposed period has actually passed.
  return end.getTime() > floor.getTime() ? end : floor;
}
