/**
 * A starting number, so an organiser is not staring at an empty field.
 *
 * There is usually no prior conversation with the venue, so an organiser
 * proposing terms has nothing to anchor on — and a blank field is exactly the
 * moment people give up and settle something off-platform instead. These are
 * the ranges a deal of each kind normally lands in, by the kind of space it is.
 *
 * They are guidance and nothing more: shown as a hint beside the field, never
 * pre-filled. A suggested number that types itself in becomes the number
 * everyone sends, which is a different failure from the blank field.
 */

import type { VenueDealModel } from "./venueDealModels";

export const VENUE_SPACE_TYPES = [
  "coffee_shop",
  "restaurant",
  "fitness_studio",
  "yoga_studio",
  "coworking",
  "retail_gallery",
  "outdoor_park",
  "private_villa",
  "retreat_center",
  "hotel_conference",
  "other",
] as const;

export type VenueSpaceType = (typeof VENUE_SPACE_TYPES)[number];

export type DealBenchmark = {
  low: number;
  high: number;
  /** "percent" ranges read as %, "amount" ranges read in the event's currency. */
  unit: "percent" | "amount";
  /** Why a venue of this kind tends to ask for this. */
  rationale: string;
};

const SPACE_LABELS: Record<VenueSpaceType, string> = {
  coffee_shop: "Coffee shops and cafés",
  restaurant: "Restaurants and bars",
  fitness_studio: "Fitness studios and gyms",
  yoga_studio: "Yoga and dance studios",
  coworking: "Co-working spaces",
  retail_gallery: "Retail and gallery spaces",
  outdoor_park: "Outdoor and park spaces",
  private_villa: "Private villas and homes",
  retreat_center: "Retreat centres",
  hotel_conference: "Hotels and conference rooms",
  other: "Most venues",
};

/**
 * Ranges by space type. Only the deals a space of that kind is actually asked
 * for are listed — a coffee shop is not usually rented by the room-night, and
 * quoting a number for it would be inventing one.
 */
const BENCHMARKS: Partial<Record<VenueSpaceType, Partial<Record<VenueDealModel, DealBenchmark>>>> = {
  coffee_shop: {
    revenue_share: { low: 10, high: 20, unit: "percent", rationale: "The space is quiet at the hours most events use it, so the venue is trading unused capacity for footfall." },
    fixed_fee: { low: 1, high: 3, unit: "amount", rationale: "A small per-head amount that covers what each guest costs the venue to host." },
    commitment_plus_revenue_share: { low: 10, high: 20, unit: "percent", rationale: "The same share as a straight split; the commitment fee is usually a token 25-75." },
    venue_sponsored: { low: 50, high: 150, unit: "amount", rationale: "Roughly what a café spends on a week of local advertising." },
  },
  restaurant: {
    revenue_share: { low: 15, high: 25, unit: "percent", rationale: "More staff and stock go into hosting, so the share sits above a café's." },
    fixed_fee: { low: 2, high: 6, unit: "amount", rationale: "Per head, reflecting table turnover the venue gives up." },
    upfront_rental: { low: 100, high: 400, unit: "amount", rationale: "A private room or a section closed off for the evening." },
  },
  fitness_studio: {
    revenue_share: { low: 20, high: 35, unit: "percent", rationale: "The studio is the product, not the backdrop, so the share is higher." },
    fixed_fee: { low: 3, high: 8, unit: "amount", rationale: "Per head, close to a drop-in class rate." },
    upfront_rental: { low: 40, high: 120, unit: "amount", rationale: "An off-peak hourly studio hire." },
  },
  yoga_studio: {
    revenue_share: { low: 20, high: 35, unit: "percent", rationale: "As with a gym, the room itself is what people are paying for." },
    fixed_fee: { low: 3, high: 8, unit: "amount", rationale: "Per head, close to a drop-in class rate." },
    upfront_rental: { low: 30, high: 100, unit: "amount", rationale: "An off-peak hourly studio hire." },
  },
  coworking: {
    revenue_share: { low: 15, high: 25, unit: "percent", rationale: "Event space is often already part of the membership offer." },
    upfront_rental: { low: 50, high: 250, unit: "amount", rationale: "A meeting or event room for an evening." },
    venue_sponsored: { low: 100, high: 300, unit: "amount", rationale: "Events are a membership funnel, so some spaces pay to host." },
  },
  retail_gallery: {
    revenue_share: { low: 10, high: 20, unit: "percent", rationale: "The draw is footfall past stock rather than the takings themselves." },
    venue_sponsored: { low: 75, high: 250, unit: "amount", rationale: "Priced against the cost of getting the same people through the door." },
  },
  outdoor_park: {
    revenue_share: { low: 0, high: 10, unit: "percent", rationale: "Usually free or permit-only, so there is rarely a share to give." },
  },
  private_villa: {
    per_head: { low: 40, high: 120, unit: "amount", rationale: "Per participant per stay, covering bed and board." },
    per_room_night: { low: 60, high: 200, unit: "amount", rationale: "Per room per night, at the villa's own nightly rate." },
    upfront_rental: { low: 500, high: 3000, unit: "amount", rationale: "The whole property for the dates." },
  },
  retreat_center: {
    per_head: { low: 60, high: 180, unit: "amount", rationale: "Per participant, typically full board." },
    per_room_night: { low: 50, high: 150, unit: "amount", rationale: "Per room per night." },
    revenue_share: { low: 20, high: 40, unit: "percent", rationale: "Centres that take a share instead of a rate expect a larger one." },
  },
  hotel_conference: {
    per_room_night: { low: 80, high: 250, unit: "amount", rationale: "Per room per night at a negotiated group rate." },
    upfront_rental: { low: 200, high: 800, unit: "amount", rationale: "A day rate for the room, often with catering attached." },
  },
};

/** Applied where a space type has no entry of its own for that deal. */
const FALLBACK: Partial<Record<VenueDealModel, DealBenchmark>> = {
  revenue_share: { low: 15, high: 25, unit: "percent", rationale: "Where most venue splits land once both sides have talked." },
  commitment_plus_revenue_share: { low: 15, high: 25, unit: "percent", rationale: "The same share as a straight split, with a token fee alongside it." },
  fixed_fee: { low: 2, high: 5, unit: "amount", rationale: "A per-head amount covering what a guest costs the venue." },
  per_head: { low: 40, high: 120, unit: "amount", rationale: "Per participant, covering bed and board." },
  per_room_night: { low: 60, high: 180, unit: "amount", rationale: "Per room per night." },
  upfront_rental: { low: 100, high: 500, unit: "amount", rationale: "A flat hire for the space." },
  venue_sponsored: { low: 75, high: 250, unit: "amount", rationale: "What a venue will put in to bring the right people through the door." },
};

/** The commitment fee is a gesture, not a rate; it has one range everywhere. */
export const COMMITMENT_FEE_BENCHMARK: DealBenchmark = {
  low: 25,
  high: 100,
  unit: "amount",
  rationale: "Small enough that a venue can say yes without a budget conversation, "
    + "large enough that agreeing to it means something.",
};

export function isVenueSpaceType(value: unknown): value is VenueSpaceType {
  return typeof value === "string" && (VENUE_SPACE_TYPES as readonly string[]).includes(value);
}

export function getVenueSpaceLabel(spaceType: unknown): string {
  return isVenueSpaceType(spaceType) ? SPACE_LABELS[spaceType] : SPACE_LABELS.other;
}

/**
 * The typical range for one deal at one kind of venue, or null where there is
 * genuinely no convention to report.
 */
export function getDealBenchmark(
  model: unknown,
  spaceType?: unknown,
): DealBenchmark | null {
  if (typeof model !== "string") return null;
  const key = model as VenueDealModel;

  if (isVenueSpaceType(spaceType)) {
    const forSpace = BENCHMARKS[spaceType]?.[key];
    if (forSpace) return forSpace;
  }
  return FALLBACK[key] ?? null;
}

/** The hint shown beside the field. Null means show nothing rather than a guess. */
export function formatBenchmarkHint(
  model: unknown,
  spaceType?: unknown,
  currencySymbol = "€",
): string | null {
  const benchmark = getDealBenchmark(model, spaceType);
  if (!benchmark) return null;

  const range = benchmark.unit === "percent"
    ? `${benchmark.low}–${benchmark.high}%`
    : `${currencySymbol}${benchmark.low}–${currencySymbol}${benchmark.high}`;

  return `${getVenueSpaceLabel(spaceType)} usually agree ${range}. ${benchmark.rationale}`;
}

/**
 * Whether a proposed number is unusual enough to be worth a second look.
 *
 * Not a validation — an organiser who knows their venue may well be right, and
 * the affordability cap already blocks anything genuinely impossible. This only
 * flags a figure far outside what similar venues agree, so it is a nudge rather
 * than a wall.
 */
export function getBenchmarkOutlierNote(
  model: unknown,
  spaceType: unknown,
  value: unknown,
  currencySymbol = "€",
): string | null {
  const benchmark = getDealBenchmark(model, spaceType);
  const amount = Number(value);
  if (!benchmark || !Number.isFinite(amount) || amount <= 0) return null;

  const unit = (n: number) => benchmark.unit === "percent" ? `${n}%` : `${currencySymbol}${n}`;

  // Double the top of the range, or under half the bottom of it.
  if (amount > benchmark.high * 2) {
    return `That is well above what ${getVenueSpaceLabel(spaceType).toLowerCase()} usually agree `
      + `(${unit(benchmark.low)}–${unit(benchmark.high)}). Worth checking before you send it.`;
  }
  if (amount < benchmark.low / 2) {
    return `That is well below what ${getVenueSpaceLabel(spaceType).toLowerCase()} usually agree `
      + `(${unit(benchmark.low)}–${unit(benchmark.high)}). You may be underselling the event.`;
  }
  return null;
}
