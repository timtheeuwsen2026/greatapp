/**
 * The vocabulary every partner profile is described in.
 *
 * Creator onboarding, Promoter onboarding, the Venue preference step and the
 * Collab matcher all ask versions of the same three questions — what do you
 * do, where, and what are you typically after — and until now each screen
 * invented its own list. A creator whose category read "wellness" could never
 * match a venue whose category read "Retreats", and a "looking for" answer of
 * "Food & Drink" had nothing to match against at all.
 *
 * So the lists live here, in one file both sides import, with stable ids that
 * are what gets stored. Labels can be reworded without orphaning saved data.
 *
 * Every list carries an `other` entry with a free-text companion field. That
 * is a requirement rather than a convenience: a taxonomy with no escape hatch
 * silently pushes people into the nearest wrong box, and then the matcher acts
 * on the wrong box.
 */

export type TaxonomyOption = {
  id: string;
  label: string;
  /** Shown under the label where the label alone is ambiguous. */
  hint?: string;
};

/** Read the free-text companion when the stored id is `other`. */
export const OTHER_ID = "other";

/**
 * What a partner does — extended from the Explore category grid.
 *
 * The first six ids are exactly the Explore pillars, so a creator's category
 * and an experience's category are the same value and the Suggested-for-You
 * matcher can compare them directly. The rest were added for partners whose
 * work does not map onto a trip pillar.
 */
export const PARTNER_CATEGORIES: TaxonomyOption[] = [
  { id: "sports_wellness", label: "Sports & Wellness", hint: "Workshops, fitness, one-day events" },
  { id: "retreats", label: "Retreats", hint: "Multi-day wellness & spiritual escapes" },
  { id: "adventure_trips", label: "Adventure", hint: "Surf, hiking, cycling, outdoor challenges" },
  { id: "community_social", label: "Community & Social", hint: "Networking, volunteering, creative meetups" },
  { id: "workations", label: "Workations", hint: "Remote work, co-living, travel" },
  { id: "festivals_events", label: "Festivals & Special Events", hint: "Seasonal or one-off, marathons, conferences" },
  { id: "food_drink", label: "Food & Drink", hint: "Supper clubs, tastings, cookery" },
  { id: "arts_culture", label: "Arts & Culture", hint: "Music, film, making, performance" },
  { id: "business_professional", label: "Business & Professional", hint: "Training, conferences, team days" },
  { id: OTHER_ID, label: "Other", hint: "Tell us in your own words" },
];

/**
 * What a partner is typically looking for.
 *
 * This is the Need taxonomy the Collab feed already filters on. Deliberately
 * broader than "a venue": most collaborations on this platform are not a room
 * hire, and a creator whose standing need is a sponsor should never be shown
 * only spaces.
 */
export const PARTNER_NEEDS: TaxonomyOption[] = [
  { id: "venue", label: "Venue", hint: "A space to host in" },
  { id: "food_drink", label: "Food & Drink", hint: "Catering, a bar, a coffee partner" },
  { id: "sponsor", label: "Sponsor", hint: "Someone to fund part of the event" },
  { id: "products", label: "Products", hint: "Goods or kit for participants" },
  { id: "discount", label: "Discount", hint: "A rate rather than cash or goods" },
  { id: OTHER_ID, label: "Other", hint: "Tell us in your own words" },
];

/** Promoter type. The one classification a Creator deliberately does not have. */
export const PROMOTER_TYPES: TaxonomyOption[] = [
  { id: "influencer", label: "Influencer", hint: "You bring your own audience" },
  { id: "brand", label: "Brand", hint: "A company promoting through its channels" },
  { id: OTHER_ID, label: "Other", hint: "Tell us in your own words" },
];

/** How long a trip a venue wants. Multi-day spaces only. */
export const TRIP_LENGTH_PREFERENCES: TaxonomyOption[] = [
  { id: "single_day", label: "Single day" },
  { id: "weekend", label: "Weekend", hint: "2–3 nights" },
  { id: "short_stay", label: "Short stay", hint: "4–6 nights" },
  { id: "week_plus", label: "A week or more", hint: "7+ nights" },
];

/** The feel a space is suited to, in the words venues actually use. */
export const VIBE_PREFERENCES: TaxonomyOption[] = [
  { id: "quiet_restorative", label: "Quiet & restorative" },
  { id: "active_outdoors", label: "Active & outdoors" },
  { id: "social_lively", label: "Social & lively" },
  { id: "creative_focused", label: "Creative & focused" },
  { id: "professional", label: "Professional & corporate" },
  { id: "family_friendly", label: "Family friendly" },
];

/** Mon–Sun × Morning/Afternoon/Evening, for a day space's quiet periods. */
export const WEEKDAYS = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
] as const;

export const DAYPARTS = [
  { id: "morning", label: "Morning", hint: "Before 12:00" },
  { id: "afternoon", label: "Afternoon", hint: "12:00–17:00" },
  { id: "evening", label: "Evening", hint: "After 17:00" },
] as const;

export type WeekdayId = (typeof WEEKDAYS)[number]["id"];
export type DaypartId = (typeof DAYPARTS)[number]["id"];

/** One quiet slot, stored as `"mon:morning"`. */
export function quietSlotKey(day: WeekdayId | string, daypart: DaypartId | string): string {
  return `${day}:${daypart}`;
}

export function parseQuietSlotKey(key: unknown): { day: string; daypart: string } | null {
  const [day, daypart] = String(key ?? "").split(":");
  if (!day || !daypart) return null;
  return { day, daypart };
}

/** "Mon mornings, Tue evenings" — for a card or an email. */
export function formatQuietSlots(slots: unknown, limit = 4): string {
  const list = Array.isArray(slots) ? slots : [];
  const labels = list
    .map((slot) => {
      const parsed = parseQuietSlotKey(slot);
      if (!parsed) return null;
      const day = WEEKDAYS.find((entry) => entry.id === parsed.day)?.label;
      const part = DAYPARTS.find((entry) => entry.id === parsed.daypart)?.label?.toLowerCase();
      return day && part ? `${day} ${part}s` : null;
    })
    .filter(Boolean) as string[];

  if (labels.length === 0) return "";
  if (labels.length <= limit) return labels.join(", ");
  return `${labels.slice(0, limit).join(", ")} +${labels.length - limit} more`;
}

function labelFrom(options: TaxonomyOption[], id: unknown, other?: unknown): string {
  const key = String(id ?? "").trim();
  if (!key) return "";
  if (key === OTHER_ID) return String(other ?? "").trim() || "Other";
  return options.find((option) => option.id === key)?.label || key;
}

export function categoryLabel(id: unknown, other?: unknown): string {
  return labelFrom(PARTNER_CATEGORIES, id, other);
}

export function needLabel(id: unknown, other?: unknown): string {
  return labelFrom(PARTNER_NEEDS, id, other);
}

export function promoterTypeLabel(id: unknown, other?: unknown): string {
  return labelFrom(PROMOTER_TYPES, id, other);
}

/** Every stored need id rendered as labels, with the free-text one substituted. */
export function needLabels(ids: unknown, other?: unknown): string[] {
  const list = Array.isArray(ids) ? ids : [];
  return list.map((id) => needLabel(id, other)).filter(Boolean);
}

function isValidIn(options: TaxonomyOption[], value: unknown): boolean {
  return options.some((option) => option.id === String(value ?? ""));
}

export function isPartnerCategory(value: unknown): boolean {
  return isValidIn(PARTNER_CATEGORIES, value);
}

export function isPartnerNeed(value: unknown): boolean {
  return isValidIn(PARTNER_NEEDS, value);
}

export function isPromoterType(value: unknown): boolean {
  return isValidIn(PROMOTER_TYPES, value);
}

/**
 * Keeps only ids this taxonomy knows, so a hand-written payload cannot store a
 * value the matcher will never match and no screen can render.
 */
export function sanitiseIds(options: TaxonomyOption[], values: unknown): string[] {
  const list = Array.isArray(values) ? values : [];
  const known = new Set(options.map((option) => option.id));
  return Array.from(new Set(list.map((value) => String(value ?? "")).filter((value) => known.has(value))));
}

export function sanitiseNeeds(values: unknown): string[] {
  return sanitiseIds(PARTNER_NEEDS, values);
}

export function sanitiseCategories(values: unknown): string[] {
  return sanitiseIds(PARTNER_CATEGORIES, values);
}

export function sanitiseVibes(values: unknown): string[] {
  return sanitiseIds(VIBE_PREFERENCES, values);
}

export function sanitiseTripLengths(values: unknown): string[] {
  return sanitiseIds(TRIP_LENGTH_PREFERENCES, values);
}

/** Only slots that name a real day and a real daypart. */
export function sanitiseQuietSlots(values: unknown): string[] {
  const list = Array.isArray(values) ? values : [];
  const days = new Set(WEEKDAYS.map((entry) => entry.id as string));
  const parts = new Set(DAYPARTS.map((entry) => entry.id as string));
  return Array.from(
    new Set(
      list
        .map((value) => {
          const parsed = parseQuietSlotKey(value);
          if (!parsed || !days.has(parsed.day) || !parts.has(parsed.daypart)) return null;
          return quietSlotKey(parsed.day, parsed.daypart);
        })
        .filter(Boolean) as string[],
    ),
  );
}

export type OpenPeriod = { startDate: string; endDate: string; note?: string };

/**
 * Multi-day spaces answer in date ranges rather than dayparts: "we are empty
 * the first three weeks of November" is the shape of that answer, and a
 * Mon–Sun grid cannot hold it.
 */
export function sanitiseOpenPeriods(values: unknown): OpenPeriod[] {
  const list = Array.isArray(values) ? values : [];
  return list
    .map((entry: any) => {
      const startDate = String(entry?.startDate ?? "").slice(0, 10);
      const endDate = String(entry?.endDate ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;
      // A range that ends before it starts is a typo, not a period. Swapping is
      // friendlier than dropping the row the venue just typed.
      const [from, to] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
      const note = String(entry?.note ?? "").trim();
      return note ? { startDate: from, endDate: to, note } : { startDate: from, endDate: to };
    })
    .filter(Boolean) as OpenPeriod[];
}
