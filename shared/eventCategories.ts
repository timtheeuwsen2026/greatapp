/**
 * One category list for the whole site (Tim, 27 Nov, design board A1
 * "Categories and formats" and U1 "What would you do"): 7 groups and about 60
 * activities. The same list is used in the event builder, the idea flow, on
 * event cards, in the Events filter, in search, on the homepage chips and as
 * the field a partner works in. The 8 interests of 66.46 are no longer used.
 *
 * Two layers: the GROUP says what it is about (stored in experiences.category,
 * the database enum), the ACTIVITY says what exactly (experiences.activity).
 * Trips and retreats are not a group: they are a format ("Multi-day").
 *
 * Nothing stored is rewritten. Every value used before (the six old categories
 * and the eight interests of 66.46) reads as its nearest group.
 */

export type EventCategoryId =
  | "move" | "recover" | "social" | "outdoors" | "culture" | "learn_make" | "business";

export type Activity = {
  id: string;
  label: string;
  group: EventCategoryId;
  /** Other words people search with ("run" for Running, "hyrox" for HIIT and gym). */
  keywords?: string[];
};

export type CategoryGroup = {
  id: EventCategoryId;
  label: string;
  /** The short line under the group on board A1. */
  hint: string;
  activities: Activity[];
};

const group = (
  id: EventCategoryId,
  label: string,
  hint: string,
  activities: Array<[id: string, label: string, keywords?: string[]]>,
): CategoryGroup => ({
  id,
  label,
  hint,
  activities: activities.map(([activityId, activityLabel, keywords]) => ({
    id: activityId,
    label: activityLabel,
    group: id,
    ...(keywords ? { keywords } : {}),
  })),
});

export const CATEGORY_GROUPS: CategoryGroup[] = [
  group("move", "Move", "Training and sport", [
    ["running", "Running", ["run", "runs", "run club", "jog", "5k", "10k", "marathon", "trail"]],
    ["yoga", "Yoga", ["hot yoga", "vinyasa", "yin"]],
    ["pilates", "Pilates", ["reformer"]],
    ["hiit_gym", "HIIT and gym", ["hiit", "gym", "hyrox", "fitness", "crossfit", "bootcamp", "strength", "training"]],
    ["swimming", "Swimming", ["swim", "open water", "triathlon"]],
    ["cycling", "Cycling", ["bike", "cycle", "ride", "spinning"]],
    ["padel_tennis", "Padel and tennis", ["padel", "tennis", "pickleball"]],
    ["climbing", "Climbing", ["bouldering", "boulder"]],
    ["dance", "Dance", ["salsa", "bachata", "dancing"]],
    ["martial_arts", "Martial arts", ["boxing", "kickboxing", "jiu jitsu", "bjj", "karate", "muay thai"]],
    ["football", "Football", ["soccer", "futsal"]],
    ["volleyball", "Volleyball", ["beach volleyball"]],
  ]),
  group("recover", "Recover", "Body and mind reset", [
    ["sauna", "Sauna"],
    ["cold_plunge", "Cold plunge", ["ice bath", "cold water"]],
    ["breathwork", "Breathwork", ["breathing"]],
    ["meditation", "Meditation", ["mindfulness"]],
    ["sound_bath", "Sound bath", ["sound healing"]],
    ["massage", "Massage"],
    ["stretching", "Stretching", ["mobility"]],
    ["journaling", "Journaling"],
  ]),
  group("social", "Social", "Meet people, no program", [
    ["coffee", "Coffee", ["matcha", "coffee rave", "brunch"]],
    ["dinner", "Dinner", ["supper club", "lunch", "food"]],
    ["walk_talk", "Walk and talk", ["walk"]],
    ["board_games", "Board games", ["games", "quiz"]],
    ["book_club", "Book club", ["books", "reading"]],
    ["language_exchange", "Language exchange", ["tandem"]],
    ["sober_social", "Sober social", ["alcohol free", "sober"]],
    ["dog_walk", "Dog walk", ["dogs"]],
  ]),
  group("outdoors", "Outdoors", "Nature and water", [
    ["hiking", "Hiking", ["hike", "trek", "mountain"]],
    ["beach_day", "Beach day", ["beach"]],
    ["surfing", "Surfing", ["surf"]],
    ["kayaking", "Kayaking", ["kayak", "paddle", "sup", "paddleboard"]],
    ["sailing", "Sailing", ["boat"]],
    ["picnic", "Picnic"],
    ["camping", "Camping"],
    ["stargazing", "Stargazing"],
  ]),
  group("culture", "Culture", "Go and see", [
    ["live_music", "Live music", ["music", "concert", "dj", "party", "rave", "festival", "nightlife"]],
    ["art", "Art", ["gallery", "exhibition"]],
    ["film", "Film", ["cinema", "movie"]],
    ["markets", "Markets", ["market", "flea market"]],
    ["theatre", "Theatre", ["comedy", "show", "stand up"]],
    ["food_tour", "Food tour", ["tasting", "wine", "tapas"]],
    ["museum", "Museum"],
  ]),
  group("learn_make", "Learn and make", "Skills and crafts", [
    ["workshop", "Workshop", ["workshops", "class"]],
    ["cooking", "Cooking", ["cookery", "baking"]],
    ["photography", "Photography", ["photo"]],
    ["writing", "Writing"],
    ["pottery_crafts", "Pottery and crafts", ["pottery", "ceramics", "crafts", "painting"]],
    ["language_class", "Language class", ["spanish", "language"]],
    ["music_lesson", "Music lesson", ["guitar", "piano", "singing"]],
    ["wellness_talk", "Talk on wellness", ["talk", "nutrition", "health"]],
  ]),
  group("business", "Business and work", "Work, careers and founders", [
    ["networking", "Networking"],
    ["founders_meetup", "Founders meetup", ["founders", "startup"]],
    ["coworking_day", "Coworking day", ["coworking", "workation"]],
    ["talk_panel", "Talk or panel", ["panel", "conference"]],
    ["pitch_night", "Pitch night", ["pitch"]],
    ["mastermind", "Mastermind"],
    ["team_day", "Team day", ["team building", "offsite"]],
    ["career_meetup", "Career meetup", ["career", "jobs"]],
  ]),
];

/** The groups as a flat list: { id, label }. The builder's group, the Events filter and the homepage chips. */
export const EVENT_CATEGORIES: Array<{ id: EventCategoryId; label: string; hint: string }> =
  CATEGORY_GROUPS.map(({ id, label, hint }) => ({ id, label, hint }));

/** Every activity, in the order of the board. */
export const ACTIVITIES: Activity[] = CATEGORY_GROUPS.flatMap((entry) => entry.activities);

/**
 * Values stored before this list, each with its nearest group: the six
 * categories of the first builder and the eight interests of 66.46.
 */
export const LEGACY_EVENT_CATEGORIES: Record<string, { label: string; now: EventCategoryId }> = {
  sports_wellness: { label: "Sports & Wellness", now: "move" },
  retreats: { label: "Retreats", now: "recover" },
  community_social: { label: "Community & Social", now: "social" },
  adventure_trips: { label: "Adventure Trips", now: "outdoors" },
  workations: { label: "Workations", now: "business" },
  festivals_events: { label: "Festivals & Events", now: "culture" },
  sport: { label: "Sport and movement", now: "move" },
  mind_body: { label: "Mind and body", now: "recover" },
  food_drink: { label: "Food and drinks", now: "social" },
  music_nightlife: { label: "Music and nightlife", now: "culture" },
  learning: { label: "Learning and creativity", now: "learn_make" },
  travel: { label: "Travel and adventure", now: "outdoors" },
  meet_people: { label: "Meeting new people", now: "social" },
  // "other" (an event that never chose, an idea's "Something else", a
  // partner's "Other") belongs to no group: no label and no filter chip.
  // The partner fields of the old partner profile (partnerTaxonomy).
  arts_culture: { label: "Arts & Culture", now: "culture" },
  business_professional: { label: "Business & Professional", now: "business" },
};

/** Every value the database enum accepts: the seven groups, then every value used before. */
export const ALL_EVENT_CATEGORY_VALUES = [
  ...EVENT_CATEGORIES.map((category) => category.id),
  "sports_wellness", "retreats", "community_social", "adventure_trips", "workations", "festivals_events",
  "sport", "mind_body", "food_drink", "music_nightlife", "learning", "travel", "meet_people", "other",
] as const;

const GROUP_IDS = new Set<string>(EVENT_CATEGORIES.map((category) => category.id));
const ACTIVITY_BY_ID = new Map<string, Activity>(ACTIVITIES.map((activity) => [activity.id, activity]));

export function isEventCategory(value: unknown): value is EventCategoryId {
  return GROUP_IDS.has(String(value ?? ""));
}

export function isActivity(value: unknown): boolean {
  return ACTIVITY_BY_ID.has(String(value ?? ""));
}

export function activityById(value: unknown): Activity | null {
  return ACTIVITY_BY_ID.get(String(value ?? "")) ?? null;
}

/** "Running" for an activity id; empty when it is not one. */
export function activityLabel(value: unknown): string {
  return activityById(value)?.label ?? "";
}

/**
 * The group for any stored value: a group id, an activity id, or a value used
 * before (the old six, the eight interests). Null when there is none.
 */
export function currentCategory(value: unknown): EventCategoryId | null {
  const id = String(value ?? "");
  if (GROUP_IDS.has(id)) return id as EventCategoryId;
  const activity = ACTIVITY_BY_ID.get(id);
  if (activity) return activity.group;
  return LEGACY_EVENT_CATEGORIES[id]?.now ?? null;
}

/** "Move" for any stored value, old or new; empty when there is none. */
export function categoryLabel(value: unknown): string {
  const id = currentCategory(value);
  return id ? EVENT_CATEGORIES.find((category) => category.id === id)!.label : "";
}

/** The activities of one group. */
export function activitiesOf(groupId: unknown): Activity[] {
  const id = currentCategory(groupId);
  return CATEGORY_GROUPS.find((entry) => entry.id === id)?.activities ?? [];
}

/**
 * The label an event card shows: the activity when the event has one
 * ("Running"), otherwise its group ("Move"). One label, nothing above it.
 */
export function eventCategoryLabel(event: { category?: unknown; activity?: unknown } | null | undefined): string {
  if (!event) return "";
  return activityLabel(event.activity) || categoryLabel(event.category);
}

/**
 * The words a search may match for an event's category: the group, the
 * activity and the activity's other words ("run" finds Running).
 */
export function categorySearchWords(event: { category?: unknown; activity?: unknown }): string[] {
  const words: string[] = [];
  const groupLabel = categoryLabel(event.category);
  if (groupLabel) words.push(groupLabel);
  const activity = activityById(event.activity);
  if (activity) words.push(activity.label, ...(activity.keywords ?? []));
  return words;
}

/**
 * The activity a free text names, if any: "Run club" → Running. Used to read
 * a search or a homepage chip as an activity. Exact label or keyword only.
 */
export function activityForText(text: unknown): Activity | null {
  const query = String(text ?? "").trim().toLowerCase();
  if (!query) return null;
  for (const activity of ACTIVITIES) {
    if (activity.label.toLowerCase() === query || activity.id === query) return activity;
  }
  for (const activity of ACTIVITIES) {
    if ((activity.keywords ?? []).includes(query)) return activity;
  }
  return null;
}

/**
 * True when an event is this activity. An event made before activities
 * existed has none: it matches when its title names the activity or one of
 * its other words ("Sunday 5k run" is Running).
 */
export function eventMatchesActivity(
  event: { activity?: unknown; title?: unknown } | null | undefined,
  activityId: string,
): boolean {
  if (!event) return false;
  const activity = activityById(activityId);
  if (!activity) return false;
  if (event.activity) return event.activity === activity.id;
  const title = ` ${String(event.title ?? "").toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, " ")} `;
  return [activity.label, ...(activity.keywords ?? [])]
    .some((word) => title.includes(` ${word.toLowerCase()} `));
}
