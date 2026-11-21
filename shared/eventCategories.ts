/**
 * One category list for the whole site (Tim, 66.46): the idea builder's eight
 * interests. The event builder, the idea flow, event cards, search and the
 * Events filter all use it. An event has one category, shown as its label.
 *
 * The ids are the idea flow's interest ids, so an idea's first interest becomes
 * its event's category without a translation table.
 *
 * Events made before this keep their stored value (the database enum still
 * holds the old six). Each old value reads as its nearest new category, so no
 * live data is rewritten and every old event still shows and filters correctly.
 * The four "Great pillars" (health, sports, wellness, food) are no longer asked.
 */

export type EventCategoryId =
  | "sport" | "mind_body" | "food_drink" | "music_nightlife"
  | "learning" | "travel" | "meet_people" | "other";

export const EVENT_CATEGORIES: Array<{ id: EventCategoryId; label: string }> = [
  { id: "sport", label: "Sport and movement" },
  { id: "mind_body", label: "Mind and body" },
  { id: "food_drink", label: "Food and drinks" },
  { id: "music_nightlife", label: "Music and nightlife" },
  { id: "learning", label: "Learning and creativity" },
  { id: "travel", label: "Travel and adventure" },
  { id: "meet_people", label: "Meeting new people" },
  { id: "other", label: "Something else" },
];

/** The six categories the site used before, each with its nearest new one. */
export const LEGACY_EVENT_CATEGORIES: Record<string, { label: string; now: EventCategoryId }> = {
  sports_wellness: { label: "Sports & Wellness", now: "sport" },
  retreats: { label: "Retreats", now: "travel" },
  community_social: { label: "Community & Social", now: "meet_people" },
  adventure_trips: { label: "Adventure Trips", now: "travel" },
  workations: { label: "Workations", now: "travel" },
  festivals_events: { label: "Festivals & Events", now: "music_nightlife" },
};

/** Every value the database accepts: the eight, then the six old ones. */
export const ALL_EVENT_CATEGORY_VALUES = [
  ...EVENT_CATEGORIES.map((category) => category.id),
  ...Object.keys(LEGACY_EVENT_CATEGORIES),
] as const;

const IDS = new Set<string>(EVENT_CATEGORIES.map((category) => category.id));

export function isEventCategory(value: unknown): value is EventCategoryId {
  return IDS.has(String(value ?? ""));
}

/** The current category for any stored value, old or new. Null when there is none. */
export function currentCategory(value: unknown): EventCategoryId | null {
  const id = String(value ?? "");
  if (IDS.has(id)) return id as EventCategoryId;
  return LEGACY_EVENT_CATEGORIES[id]?.now ?? null;
}

/** "Sport and movement" for any stored value, old or new; empty when there is none. */
export function categoryLabel(value: unknown): string {
  const id = currentCategory(value);
  return id ? EVENT_CATEGORIES.find((category) => category.id === id)!.label : "";
}
