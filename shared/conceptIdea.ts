/**
 * The idea phase of "Create experience".
 *
 * An event now starts as an idea — a title, roughly when, roughly where, for
 * whom — and the builder picks it up from there instead of asking for all of it
 * again. This is the one place that decides what an idea is, how its answers
 * become a draft, and how a date that is not a date yet is described.
 *
 * An idea lives on an ordinary `experience_drafts` row. What marks it as a
 * Concept is the `concept` column holding the answers that have nowhere else to
 * go (a period instead of a date, the audience, the group-size range). The
 * answers that do have a home — title, description, exact dates, location,
 * linked venue, capacity — are written straight into their own columns, which
 * is what lets the builder open already filled in with no handoff code at all.
 *
 * Deliberately NOT a new value on the live `experience_status` enum: that enum
 * is read by the schedulers, the public listings, the calendar sync and the
 * payout engine, and a concept must never be bookable, reminded or paid out. The
 * draft table has no such readers, so the marker costs nothing there.
 */

import { toCalendarDateISO } from "./calendarDates";

export type ConceptDateMode = "exact" | "period" | "open";
export type ConceptDayPreference = "weekdays" | "weekends" | "any";

export const CONCEPT_DATE_MODES: readonly ConceptDateMode[] = ["exact", "period", "open"];
export const CONCEPT_DAY_PREFERENCES: readonly ConceptDayPreference[] = ["weekdays", "weekends", "any"];

/** Suggestions only — the audience field takes any text. */
export const AUDIENCE_SUGGESTIONS = ["Runners", "Swimmers", "Cyclists", "Everyone"] as const;

export const IDEA_TITLE_MAX = 120;
export const IDEA_LINE_MAX = 280;
export const IDEA_AUDIENCE_MAX = 160;
export const IDEA_PLACE_MAX = 255;
/**
 * The most people the builder will take for one event (its `maxParticipants`
 * rule). The idea phase holds to the same limit rather than saving a number the
 * builder then refuses.
 */
export const GROUP_SIZE_MAX = 200;

/** What the idea phase stores in `experience_drafts.concept`. */
export interface ConceptIdea {
  stage: "concept";
  dateMode: ConceptDateMode;
  /** YYYY-MM-DD. Only in period mode. */
  periodStart: string | null;
  periodEnd: string | null;
  dayPreference: ConceptDayPreference | null;
  audience: string | null;
  groupSizeMin: number | null;
  groupSizeMax: number | null;
  /** The place as the organiser typed or picked it, kept even if a venue is linked. */
  place: string | null;
  /** A Great venue the organiser picked in the place field, if any. */
  linkedVenueId: string | null;
}

/** The raw answers on the two idea screens. Numbers may arrive as typed text. */
export interface IdeaInput {
  title: string;
  oneLiner: string;
  dateMode: ConceptDateMode;
  /** YYYY-MM-DD */
  exactStart: string;
  exactEnd: string;
  /** HH:MM, optional */
  startTime: string;
  periodStart: string;
  periodEnd: string;
  dayPreference: ConceptDayPreference | null;
  place: string;
  linkedVenueId: string | null;
  audience: string;
  groupSizeMin: string | number | null;
  groupSizeMax: string | number | null;
}

export const EMPTY_IDEA: IdeaInput = {
  title: "",
  oneLiner: "",
  dateMode: "exact",
  exactStart: "",
  exactEnd: "",
  startTime: "",
  periodStart: "",
  periodEnd: "",
  dayPreference: null,
  place: "",
  linkedVenueId: null,
  audience: "",
  groupSizeMin: "",
  groupSizeMax: "",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed ? trimmed : null;
}

/** A whole number from a form field, or null for blank, zero, negative or nonsense. */
export function parseGroupSize(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 1) return null;
  return Math.min(number, GROUP_SIZE_MAX);
}

/** Today as YYYY-MM-DD in the browser's own calendar, which is the day the organiser means. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export type IdeaErrors = Partial<Record<
  "title" | "oneLiner" | "exactStart" | "exactEnd" | "startTime" | "periodStart" | "periodEnd" | "place"
  | "audience" | "groupSizeMin" | "groupSizeMax",
  string
>>;

/** Screen 1: idea, date, place. Only the title is required. */
export function validateIdeaBasics(input: IdeaInput, today: string = localToday()): IdeaErrors {
  const errors: IdeaErrors = {};

  const title = input.title.trim();
  if (!title) errors.title = "Give your idea a short title.";
  else if (title.length > IDEA_TITLE_MAX) errors.title = `Keep the title under ${IDEA_TITLE_MAX} characters.`;

  if (input.oneLiner.trim().length > IDEA_LINE_MAX) {
    errors.oneLiner = `Keep this to ${IDEA_LINE_MAX} characters.`;
  }

  if (input.place.trim().length > IDEA_PLACE_MAX) {
    errors.place = `Keep the place under ${IDEA_PLACE_MAX} characters.`;
  }

  if (input.dateMode === "exact") {
    if (!isRealDay(input.exactStart)) {
      errors.exactStart = "Pick the date, or choose Period or No idea yet.";
    } else if (input.exactStart < today) {
      errors.exactStart = "That date is in the past.";
    }
    if (input.exactEnd) {
      if (!isRealDay(input.exactEnd)) errors.exactEnd = "That end date isn't valid.";
      else if (isRealDay(input.exactStart) && input.exactEnd < input.exactStart) {
        errors.exactEnd = "The end can't be before the start.";
      }
    }
    if (input.startTime && !TIME.test(input.startTime)) errors.startTime = "Use a time like 18:30.";
  }

  if (input.dateMode === "period") {
    if (!isRealDay(input.periodStart)) errors.periodStart = "Pick when the period starts.";
    else if (input.periodStart < today) errors.periodStart = "That date is in the past.";
    if (!isRealDay(input.periodEnd)) errors.periodEnd = "Pick when the period ends.";
    else if (isRealDay(input.periodStart) && input.periodEnd < input.periodStart) {
      errors.periodEnd = "The end can't be before the start.";
    }
  }

  return errors;
}

/** Screen 2: who is it for. Everything is optional, but a range has to make sense. */
export function validateIdeaAudience(input: IdeaInput): IdeaErrors {
  const errors: IdeaErrors = {};

  if (input.audience.trim().length > IDEA_AUDIENCE_MAX) {
    errors.audience = `Keep this under ${IDEA_AUDIENCE_MAX} characters.`;
  }

  const filled = (value: string | number | null) => value !== null && value !== undefined && String(value).trim() !== "";
  const min = parseGroupSize(input.groupSizeMin);
  const max = parseGroupSize(input.groupSizeMax);
  if (filled(input.groupSizeMin) && min === null) errors.groupSizeMin = "Use a whole number, 1 or more.";
  if (filled(input.groupSizeMax) && max === null) errors.groupSizeMax = "Use a whole number, 1 or more.";
  // parseGroupSize clamps, so the real typed number is checked here.
  const tooBig = (value: string | number | null) => Number(String(value ?? "").trim()) > GROUP_SIZE_MAX;
  if (!errors.groupSizeMin && tooBig(input.groupSizeMin)) errors.groupSizeMin = `Groups of up to ${GROUP_SIZE_MAX} people.`;
  if (!errors.groupSizeMax && tooBig(input.groupSizeMax)) errors.groupSizeMax = `Groups of up to ${GROUP_SIZE_MAX} people.`;
  if (min !== null && max !== null && min > max) errors.groupSizeMax = "The top of the range is lower than the bottom.";

  return errors;
}

export function hasErrors(errors: IdeaErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The `concept` column value for these answers. */
export function buildConcept(input: IdeaInput): ConceptIdea {
  const period = input.dateMode === "period";
  return {
    stage: "concept",
    dateMode: input.dateMode,
    periodStart: period && isRealDay(input.periodStart) ? input.periodStart : null,
    periodEnd: period && isRealDay(input.periodEnd) ? input.periodEnd : null,
    dayPreference: period ? (input.dayPreference ?? "any") : null,
    audience: cleanText(input.audience, IDEA_AUDIENCE_MAX),
    groupSizeMin: parseGroupSize(input.groupSizeMin),
    groupSizeMax: parseGroupSize(input.groupSizeMax),
    place: cleanText(input.place, IDEA_PLACE_MAX),
    linkedVenueId: cleanText(input.linkedVenueId, 64),
  };
}

/**
 * The boundary for the `concept` column. The client builds it with
 * `buildConcept`, but the API takes whatever is posted, so everything is checked
 * again here: unknown keys dropped, enums and dates verified, numbers clamped.
 * `null` clears it.
 */
export function sanitiseConcept(raw: unknown): ConceptIdea | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  // Only something that says it is a concept becomes one. An arbitrary object
  // posted to a draft must not quietly turn a normal draft into a concept.
  if (value.stage !== "concept") return null;

  const dateMode = CONCEPT_DATE_MODES.includes(value.dateMode as ConceptDateMode)
    ? (value.dateMode as ConceptDateMode)
    : "open";
  const period = dateMode === "period";
  const dayPreference = CONCEPT_DAY_PREFERENCES.includes(value.dayPreference as ConceptDayPreference)
    ? (value.dayPreference as ConceptDayPreference)
    : null;

  return {
    stage: "concept",
    dateMode,
    periodStart: period && isRealDay(value.periodStart) ? value.periodStart : null,
    periodEnd: period && isRealDay(value.periodEnd) ? value.periodEnd : null,
    dayPreference: period ? (dayPreference ?? "any") : null,
    audience: cleanText(value.audience, IDEA_AUDIENCE_MAX),
    groupSizeMin: parseGroupSize(value.groupSizeMin),
    groupSizeMax: parseGroupSize(value.groupSizeMax),
    place: cleanText(value.place, IDEA_PLACE_MAX),
    linkedVenueId: cleanText(value.linkedVenueId, 64),
  };
}

/**
 * What a draft save carries for these answers.
 *
 * Every key is always present — a `null` is how an answer the organiser went
 * back and cleared reaches a draft that already holds the old one, since the
 * update route only touches the keys it is sent.
 *
 * `type` is a starting guess the builder lets them change: a single date, or an
 * exact range that spans days, reads as one-day or multi-day respectively. A
 * period is a window to find a date in, not a length, so it opens as one-day.
 */
export function buildIdeaDraftFields(input: IdeaInput) {
  const exact = input.dateMode === "exact";
  const startDay = exact && isRealDay(input.exactStart) ? input.exactStart : null;
  const endDay = startDay ? (isRealDay(input.exactEnd) ? input.exactEnd : startDay) : null;
  const spansDays = !!startDay && !!endDay && endDay > startDay;
  // Sent as midday-UTC instants, exactly as the builder sends them. A bare
  // YYYY-MM-DD is read by the draft update route as midnight UTC, which anyone
  // west of Greenwich then sees as the day before.
  const startDate = toCalendarDateISO(startDay);
  const endDate = toCalendarDateISO(endDay);
  const max = parseGroupSize(input.groupSizeMax);
  const linked = cleanText(input.linkedVenueId, 64);

  return {
    title: input.title.trim().slice(0, IDEA_TITLE_MAX),
    description: input.oneLiner.trim().slice(0, IDEA_LINE_MAX),
    type: spansDays ? ("multi-day" as const) : ("one-day" as const),
    startDate,
    endDate,
    startTime: startDate && TIME.test(input.startTime) ? input.startTime : null,
    location: input.place.trim().slice(0, IDEA_PLACE_MAX),
    selectedVenueId: linked,
    // What a draft started in the builder carries. Left out, the draft takes
    // the table's defaults — a category the organiser never chose, and no
    // venue type, which leaves the Venue step's radio cards unselected.
    category: "",
    venueType: "catalog" as const,
    maxParticipants: max,
    concept: buildConcept(input),
  };
}

/** True when a draft started life as an idea. */
export function isConceptDraft(draft: { concept?: unknown } | null | undefined): boolean {
  const concept = draft?.concept as { stage?: unknown } | null | undefined;
  return !!concept && concept.stage === "concept";
}

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
});

function asDay(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

const DAY_PREFERENCE_LABEL: Record<ConceptDayPreference, string> = {
  weekdays: "weekdays",
  weekends: "weekends",
  any: "any day",
};

/**
 * "Sat 31 Oct", "12 Aug to 16 Aug", "25 Oct to 1 Nov, weekends" or
 * "Date not decided yet" — wherever an event whose date may not be a date yet
 * has to be shown: the builder, the Collab board, a proposal.
 *
 * An exact date always wins over the period it grew out of.
 */
export function describeEventDate(input: {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  concept?: Partial<ConceptIdea> | null;
}): string {
  const start = asDay(input.startDate);
  const end = asDay(input.endDate);
  if (start) {
    if (end && end.toISOString().slice(0, 10) !== start.toISOString().slice(0, 10)) {
      return `${dayFormat.format(start)} to ${dayFormat.format(end)}`;
    }
    return weekdayFormat.format(start);
  }

  const concept = input.concept;
  if (concept?.dateMode === "period") {
    const from = asDay(concept.periodStart);
    const to = asDay(concept.periodEnd);
    if (from && to) {
      const preference = concept.dayPreference ? `, ${DAY_PREFERENCE_LABEL[concept.dayPreference]}` : "";
      return `${dayFormat.format(from)} to ${dayFormat.format(to)}${preference}`;
    }
  }
  return "Date not decided yet";
}

/**
 * The same boundary, applied to a whole draft write. Every path that writes an
 * `experience_drafts` row goes through the storage layer, so putting it there
 * covers routes that were never taught about the `concept` column. A write
 * that does not mention `concept` is returned untouched.
 */
export function withSanitisedConcept<T extends Record<string, any>>(draft: T): T {
  if (!draft || typeof draft !== "object" || !("concept" in draft)) return draft;
  return { ...draft, concept: sanitiseConcept(draft.concept) };
}
