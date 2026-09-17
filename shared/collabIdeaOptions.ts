/**
 * The vocabulary a Collab Idea is posted in.
 *
 * Two lists, both multi-select, and that is the change. "Looking for" was a
 * single-select dropdown, which forced a poster who needed a beach spot *and* a
 * sponsor for power *and* a run club for bodies to pick one and describe the
 * rest in prose — where the matcher could not see them. Deal preference was
 * free text, which gave a counterparty no idea what was actually acceptable.
 *
 * Ids are what gets stored, so labels can be reworded without orphaning saved
 * postings. `venue` / `service_provider` keep the ids the single-select column
 * already used, so existing rows read correctly under the new list.
 */

export type CollabSeekingTypeId =
  | "venue"
  | "sponsor"
  | "community"
  | "service_provider"
  | "other";

export type CollabSeekingOption = {
  id: CollabSeekingTypeId;
  label: string;
  /**
   * The extra questions this type needs. Shown only when the type is selected —
   * asking every poster for "kind of space" and "what do you need from a
   * sponsor" at once is what made the form feel like a survey.
   */
  fields: Array<{ key: string; label: string; placeholder: string }>;
};

export const COLLAB_SEEKING_TYPES: CollabSeekingOption[] = [
  {
    id: "venue",
    label: "A venue or space",
    fields: [
      { key: "area", label: "Area", placeholder: "Barceloneta" },
      { key: "kindOfSpace", label: "Kind of space", placeholder: "Beach spot" },
    ],
  },
  {
    id: "sponsor",
    label: "A sponsor",
    fields: [
      { key: "need", label: "What do you need from a sponsor?", placeholder: "Power / electricity on site" },
    ],
  },
  {
    id: "community",
    label: "A partner community",
    fields: [
      { key: "audience", label: "Whose audience are you after?", placeholder: "Run clubs, 25-40, Barcelona" },
    ],
  },
  {
    id: "service_provider",
    label: "A service provider",
    fields: [
      { key: "service", label: "What service?", placeholder: "Photographer for the morning" },
    ],
  },
  {
    id: "other",
    label: "Other",
    fields: [
      { key: "detail", label: "What are you looking for?", placeholder: "Tell us in your own words" },
    ],
  },
];

export type CollabDealPreferenceId =
  | "revenue_split"
  | "barter"
  | "upfront_fee"
  | "content_for_exposure"
  | "open_to_discuss";

export const COLLAB_DEAL_PREFERENCES: Array<{ id: CollabDealPreferenceId; label: string }> = [
  { id: "revenue_split", label: "Revenue split (tickets)" },
  { id: "barter", label: "Barter" },
  { id: "upfront_fee", label: "Upfront fee" },
  { id: "content_for_exposure", label: "Content for exposure" },
  { id: "open_to_discuss", label: "Open to discuss" },
];

/**
 * Shown under the buttons whenever Revenue split is selected.
 *
 * Fixed copy rather than a tooltip: a venue reading "revenue split" reasonably
 * assumes it covers the bar, and discovering otherwise at settlement is the
 * argument this sentence exists to prevent.
 */
export const REVENUE_SPLIT_CAVEAT =
  "Revenue split applies to ticket sales only — not bar or in-venue purchases.";

const SEEKING_IDS = new Set<string>(COLLAB_SEEKING_TYPES.map((type) => type.id));
const DEAL_IDS = new Set<string>(COLLAB_DEAL_PREFERENCES.map((deal) => deal.id));

export function isCollabSeekingType(value: unknown): value is CollabSeekingTypeId {
  return SEEKING_IDS.has(String(value ?? ""));
}

export function collabSeekingLabel(value: unknown): string {
  return COLLAB_SEEKING_TYPES.find((type) => type.id === value)?.label
    // Older postings stored "organizer" and "promoter" under the old
    // single-select list; they still have to render.
    || (value === "organizer" ? "An organiser" : value === "promoter" ? "An affiliate" : "A partner");
}

export function collabDealPreferenceLabel(value: unknown): string {
  return COLLAB_DEAL_PREFERENCES.find((deal) => deal.id === value)?.label || String(value ?? "");
}

/** Keep only types this list knows. An unknown id matches nobody. */
export function sanitiseSeekingTypes(values: unknown): CollabSeekingTypeId[] {
  const list = Array.isArray(values) ? values : [values];
  return Array.from(new Set(
    list
      .map((value) => String(value ?? ""))
      .filter((value): value is CollabSeekingTypeId => SEEKING_IDS.has(value)),
  ));
}

export function sanitiseDealPreferences(values: unknown): CollabDealPreferenceId[] {
  const list = Array.isArray(values) ? values : [values];
  return Array.from(new Set(
    list
      .map((value) => String(value ?? ""))
      .filter((value): value is CollabDealPreferenceId => DEAL_IDS.has(value)),
  ));
}

/**
 * The per-type answers, keyed by type and then by field.
 *
 * Only fields belonging to a selected type survive: a poster who ticks Venue,
 * fills in the space fields, then unticks it should not leave a stale "kind of
 * space" behind for the matcher to read.
 */
export function sanitiseTypeDetails(
  input: unknown,
  selectedTypes: CollabSeekingTypeId[],
): Record<string, Record<string, string>> {
  const source = input && typeof input === "object" ? (input as Record<string, any>) : {};
  const out: Record<string, Record<string, string>> = {};

  for (const typeId of selectedTypes) {
    const option = COLLAB_SEEKING_TYPES.find((type) => type.id === typeId);
    if (!option) continue;
    const answers = source[typeId] && typeof source[typeId] === "object" ? source[typeId] : {};
    const cleaned: Record<string, string> = {};
    for (const field of option.fields) {
      const value = String(answers[field.key] ?? "").trim().slice(0, 300);
      if (value) cleaned[field.key] = value;
    }
    if (Object.keys(cleaned).length) out[typeId] = cleaned;
  }

  return out;
}

/**
 * "Revenue split (tickets), Barter" — for an email subject line or a card.
 *
 * Falls back to whatever the old free-text field held, so a posting made before
 * the multi-select existed still describes itself.
 */
export function describeDealPreferences(idea: {
  dealPreferences?: unknown;
  dealPreference?: unknown;
}): string {
  const ids = sanitiseDealPreferences(idea?.dealPreferences);
  if (ids.length) return ids.map(collabDealPreferenceLabel).join(", ");
  const legacy = String(idea?.dealPreference ?? "").trim();
  return legacy || "Open to discuss";
}

/**
 * Which partner deal type an idea's stated preference suggests.
 *
 * A suggestion, never a lock — the deal is still agreed in the dealroom. This
 * is only here so the Event Builder opens with the answer the poster already
 * gave rather than an empty deal picker.
 */
export function suggestedDealTypeFor(idea: {
  dealPreferences?: unknown;
  dealPreference?: unknown;
}): string | null {
  const ids = sanitiseDealPreferences(idea?.dealPreferences);
  if (ids.includes("revenue_split")) return "commission_per_ticket";
  if (ids.includes("content_for_exposure")) return "content_license";
  if (ids.includes("upfront_fee")) return "financial_sponsorship";
  if (ids.includes("barter")) return "brand_barter";

  // Nothing structured to read: guess from the free text rather than from
  // nothing, but only on words that are unambiguous.
  const legacy = String(idea?.dealPreference ?? "").toLowerCase();
  if (legacy.includes("revenue") || legacy.includes("split")) return "commission_per_ticket";
  if (legacy.includes("barter")) return "brand_barter";
  return null;
}
