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

import { ACTIVITIES, EVENT_CATEGORIES, activityLabel, currentCategory, isActivity } from "./eventCategories";
import { toCalendarDateISO } from "./calendarDates";

export type ConceptDateMode = "exact" | "period" | "open";
export type ConceptDayPreference = "weekdays" | "weekends" | "any";

export const CONCEPT_DATE_MODES: readonly ConceptDateMode[] = ["exact", "period", "open"];
export const CONCEPT_DAY_PREFERENCES: readonly ConceptDayPreference[] = ["weekdays", "weekends", "any"];

/** Suggestions only — the audience field takes any text. Kept for drafts made before the interests below. */
export const AUDIENCE_SUGGESTIONS = ["Runners", "Swimmers", "Cyclists", "Everyone"] as const;

/**
 * Screen 2, who is it for: the same activities as everywhere else (Tim, 27
 * Nov, board A1: 7 groups, about 60 activities). Pick 1 to 3; the first one is
 * the event's category and label. The eight interests of 66.46 are no longer
 * offered, but a draft that has them keeps them and reads them as a group.
 */
export type IdeaInterestId = string;

/** The eight interests of 66.46, kept only so old drafts still read right. */
export const IDEA_INTERESTS: Array<{ id: string; label: string; hint?: string }> = [
  { id: "sport", label: "Sport and movement", hint: "Runs, gym, Hyrox, triathlon" },
  { id: "mind_body", label: "Mind and body", hint: "Yoga, breathwork, wellness" },
  { id: "food_drink", label: "Food and drinks" },
  { id: "music_nightlife", label: "Music and nightlife" },
  { id: "learning", label: "Learning and creativity", hint: "Workshops, talks" },
  { id: "travel", label: "Travel and adventure", hint: "Retreats, trips" },
  { id: "meet_people", label: "Meeting new people" },
  { id: "other", label: "Something else" },
];
export const IDEA_INTERESTS_MAX = 3;
export const IDEA_INTEREST_OTHER_MAX = 60;

export type IdeaLevel = "anyone" | "beginners" | "experienced";
export const IDEA_LEVELS: Array<{ id: IdeaLevel; label: string }> = [
  { id: "anyone", label: "Anyone" },
  { id: "beginners", label: "Beginners" },
  { id: "experienced", label: "Experienced" },
];

/**
 * Screen 3, what do you still need (Create flow 26.1). It only decides which
 * screens follow. "Nothing" is the empty list, answered.
 */
export type IdeaNeedId = "venue" | "community" | "sponsor" | "service_provider";
export const IDEA_NEEDS: Array<{ id: IdeaNeedId; label: string; hint: string }> = [
  { id: "venue", label: "A venue or space", hint: "A place to hold it" },
  { id: "community", label: "People or a community", hint: "A run club, a group, an audience" },
  { id: "sponsor", label: "A sponsor or product", hint: "Drinks, gear, power, budget" },
  { id: "service_provider", label: "A service provider", hint: "A photographer, DJ, coach" },
];

export type IdeaInviteSource = "platform" | "link" | "email";
/**
 * How a community earns. Offered: an amount per person who checks in (26.2) and
 * the builder's own community deals, with the names of 66.36, so the idea and
 * the builder speak the same language. The last three are the first version's
 * answers, still read on ideas saved with them, no longer offered.
 */
export type PeopleEarn =
  | "per_person" | "commission_per_ticket" | "milestone_barter" | "member_discount"
  | "free_access" | "barter" | "fixed_fee";
export const PEOPLE_EARN_OPTIONS: Array<{ id: PeopleEarn; label: string; hint?: string }> = [
  { id: "per_person", label: "Per person who checks in", hint: "A fixed amount for each person they bring" },
  { id: "commission_per_ticket", label: "Commission per ticket", hint: "A percentage of every ticket sold through their link" },
  { id: "milestone_barter", label: "Bring people, get a reward", hint: "For example: bring 10, get 1 free ticket" },
  { id: "member_discount", label: "Discount for their members", hint: "Their members get a lower price" },
];
const LEGACY_EARN_LABELS: Partial<Record<PeopleEarn, string>> = {
  free_access: "Free access",
  barter: "Barter",
  fixed_fee: "Fixed fee",
};
export const COMMISSION_PCT_MAX = 50;

/** How a service provider is paid (Tim, 66.4x): the builder's three service deals. */
export type ServicePay = "fee" | "barter" | "content_license";
export const SERVICE_PAY_OPTIONS: Array<{ id: ServicePay; label: string; hint: string }> = [
  { id: "fee", label: "Fee", hint: "A fixed amount for the job" },
  { id: "barter", label: "Barter", hint: "A free ticket, product or exposure instead of money" },
  { id: "content_license", label: "Content licence", hint: "You may use what they make, for example photos" },
];
/** Tim: the standard per-person rate is about €2, set in the people step. */
export const DEFAULT_AMOUNT_PER_PERSON = 2;
export const AMOUNT_PER_PERSON_MAX = 500;
export const SERVICE_FEE_MAX = 20000;

/** A service fee in euros: positive, two decimals, capped. Null for anything else. */
export function parseServiceFee(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(number) || number <= 0 || number > SERVICE_FEE_MAX) return null;
  return Math.round(number * 100) / 100;
}

/** What the venue could live with: the same five answers as the Collab Idea form. */
export const VENUE_DEAL_IDS = ["revenue_split", "barter", "upfront_fee", "content_for_exposure", "open_to_discuss"] as const;
export type VenueDealId = (typeof VENUE_DEAL_IDS)[number];

/**
 * One open slot: a need with how the organiser wants to fill it. Not a separate
 * object (26.3): it lives on the event's concept, and the posting on the Collab
 * board is written from it.
 */
export interface IdeaSlot {
  /** Show it on the Collab board. */
  board: boolean;
  /** Invite somebody they already have in mind. */
  direct: boolean;
  inviteSource: IdeaInviteSource;
  /** Picked from the people on Great. */
  inviteUserId: string | null;
  inviteName: string | null;
  inviteEmail: string | null;
  /** Venue */
  kindOfSpace: string | null;
  dealPreferences: VenueDealId[];
  /** People or community */
  ownCommunity: boolean;
  earn: PeopleEarn | null;
  amountPerPerson: number | null;
  /** Commission per ticket, in percent. */
  commissionPct: number | null;
  /** Sponsor or product */
  need: string | null;
  giveBack: string | null;
  /** Service provider */
  service: string | null;
  servicePay: ServicePay | null;
  /** Euros, for a fee. Optional. */
  feeAmount: number | null;
  /** Set once the direct invite exists, so sending again never invites twice. */
  inviteUrl: string | null;
}

export const SLOT_TEXT_MAX = 300;

export function emptySlot(need: IdeaNeedId): IdeaSlot {
  return {
    // Every idea goes on the Collab board by default (Tim, 27 Nov, point 1),
    // the people slot too; the organiser can still switch it off per need.
    board: true,
    direct: need === "community",
    inviteSource: need === "community" ? "link" : "platform",
    inviteUserId: null,
    inviteName: null,
    inviteEmail: null,
    kindOfSpace: null,
    dealPreferences: [],
    ownCommunity: false,
    earn: need === "community" ? "per_person" : null,
    amountPerPerson: need === "community" ? DEFAULT_AMOUNT_PER_PERSON : null,
    need: null,
    giveBack: null,
    service: null,
    servicePay: null,
    feeAmount: null,
    commissionPct: null,
    inviteUrl: null,
  };
}

export const IDEA_NOTE_MAX = 1000;

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
  /** From the place finder (27 Nov, point 1): the place's city and its pin. */
  placeCity?: string | null;
  placeLat?: number | null;
  placeLng?: number | null;
  /** A Great venue the organiser picked in the place field, if any. */
  linkedVenueId: string | null;
  /** Screen 2 tags. Absent on drafts made before them. */
  interests?: IdeaInterestId[];
  interestOther?: string | null;
  level?: IdeaLevel | null;
  /** Screen 3. Null until answered; an empty list is "Nothing". */
  needs?: IdeaNeedId[] | null;
  slots?: Partial<Record<IdeaNeedId, IdeaSlot>>;
  /** Review screen: "Anything else?" */
  note?: string | null;
  /** The Collab board posting written from the slots, once sent. */
  collabIdeaId?: string | null;
  sentAt?: string | null;
}

/** The raw answers on the idea screens. Numbers may arrive as typed text. */
export interface IdeaInput {
  title: string;
  oneLiner: string;
  dateMode: ConceptDateMode;
  /** YYYY-MM-DD */
  exactStart: string;
  exactEnd: string;
  /** HH:MM, optional */
  startTime: string;
  /** HH:MM, optional here; the builder asks for it before publishing (A2). */
  endTime: string;
  periodStart: string;
  periodEnd: string;
  dayPreference: ConceptDayPreference | null;
  place: string;
  /** The city of the place, from the place finder: never asked a second time. */
  placeCity: string | null;
  placeLat: number | null;
  placeLng: number | null;
  linkedVenueId: string | null;
  audience: string;
  groupSizeMin: string | number | null;
  groupSizeMax: string | number | null;
  interests: IdeaInterestId[];
  interestOther: string;
  level: IdeaLevel;
  needs: IdeaNeedId[] | null;
  slots: Partial<Record<IdeaNeedId, IdeaSlot>>;
  note: string;
  photoUrl: string;
  collabIdeaId: string | null;
  sentAt: string | null;
}

export const EMPTY_IDEA: IdeaInput = {
  title: "",
  oneLiner: "",
  dateMode: "exact",
  exactStart: "",
  exactEnd: "",
  startTime: "",
  endTime: "",
  periodStart: "",
  periodEnd: "",
  dayPreference: null,
  place: "",
  placeCity: null,
  placeLat: null,
  placeLng: null,
  linkedVenueId: null,
  audience: "",
  groupSizeMin: "",
  groupSizeMax: "",
  interests: [],
  interestOther: "",
  level: "anyone",
  needs: null,
  slots: {},
  note: "",
  photoUrl: "",
  collabIdeaId: null,
  sentAt: null,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRealDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The place finder's city and pin (27 Nov, point 1), only when there is one,
 * so a concept saved before them reads back exactly as it was.
 */
function placeFields(value: { placeCity?: unknown; placeLat?: unknown; placeLng?: unknown } | null): Partial<Pick<ConceptIdea, "placeCity" | "placeLat" | "placeLng">> {
  if (!value) return {};
  const out: Partial<Pick<ConceptIdea, "placeCity" | "placeLat" | "placeLng">> = {};
  const city = cleanText(value.placeCity, 80);
  const lat = coordinate(value.placeLat, 90);
  const lng = coordinate(value.placeLng, 180);
  if (city) out.placeCity = city;
  if (lat !== null && lng !== null) {
    out.placeLat = lat;
    out.placeLng = lng;
  }
  return out;
}

/** The first pick that is an activity (an idea saved before may start with an old interest). */
function firstActivity(interests: unknown): string | null {
  return sanitiseInterests(interests).find((id) => isActivity(id)) ?? null;
}

/** A latitude or longitude, or null. */
function coordinate(value: unknown, limit: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? Math.round(number * 1e6) / 1e6 : null;
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
  "title" | "oneLiner" | "exactStart" | "exactEnd" | "startTime" | "endTime" | "periodStart" | "periodEnd" | "place"
  | "audience" | "groupSizeMin" | "groupSizeMax" | "interests" | "interestOther" | "needs" | "note",
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
    if (input.endTime && !TIME.test(input.endTime)) errors.endTime = "Use a time like 21:00.";
    // On one day the end comes after the start; a trip ends on a later day, so any time is fine.
    const oneDay = !input.exactEnd || input.exactEnd === input.exactStart;
    if (!errors.startTime && !errors.endTime && oneDay && input.startTime && input.endTime && input.endTime <= input.startTime) {
      errors.endTime = "The end time is before the start.";
    }
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

/** Screen 2: who is it for. One to three interests; the group size is optional, but a range has to make sense. */
export function validateIdeaAudience(input: IdeaInput): IdeaErrors {
  const errors: IdeaErrors = {};

  if (input.audience.trim().length > IDEA_AUDIENCE_MAX) {
    errors.audience = `Keep this under ${IDEA_AUDIENCE_MAX} characters.`;
  }
  const interests = input.interests ?? [];
  if (interests.length === 0) errors.interests = "Pick at least one.";
  else if (interests.length > IDEA_INTERESTS_MAX) errors.interests = `Pick up to ${IDEA_INTERESTS_MAX}.`;
  if (interests.includes("other")) {
    const other = (input.interestOther ?? "").trim();
    if (!other) errors.interestOther = "Say what it is, in a few words.";
    else if (other.length > IDEA_INTEREST_OTHER_MAX) errors.interestOther = `Keep this under ${IDEA_INTEREST_OTHER_MAX} characters.`;
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

const INTEREST_IDS = new Set<string>([
  ...ACTIVITIES.map((entry) => entry.id),
  ...EVENT_CATEGORIES.map((entry) => entry.id),
  ...IDEA_INTERESTS.map((entry) => entry.id),
]);
const LEVEL_IDS = new Set<string>(IDEA_LEVELS.map((entry) => entry.id));
const NEED_IDS = new Set<string>(IDEA_NEEDS.map((entry) => entry.id));
const EARN_IDS = new Set<string>([...PEOPLE_EARN_OPTIONS.map((entry) => entry.id), ...Object.keys(LEGACY_EARN_LABELS)]);
const SERVICE_PAY_IDS = new Set<string>(SERVICE_PAY_OPTIONS.map((entry) => entry.id));

/** A percentage from a form field: above 0, at most COMMISSION_PCT_MAX, one decimal. */
export function parseCommissionPct(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", ".").replace("%", "").trim());
  if (!Number.isFinite(number) || number <= 0 || number > COMMISSION_PCT_MAX) return null;
  return Math.round(number * 10) / 10;
}
const SOURCE_IDS = new Set<string>(["platform", "link", "email"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitiseInterests(raw: unknown): IdeaInterestId[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map(String).filter((id) => INTEREST_IDS.has(id))))
    .slice(0, IDEA_INTERESTS_MAX) as IdeaInterestId[];
}

export function sanitiseNeeds(raw: unknown): IdeaNeedId[] | null {
  if (!Array.isArray(raw)) return null;
  // In the order of the list, whatever order they were ticked in, so the screens follow it.
  const picked = new Set(raw.map(String));
  return IDEA_NEEDS.map((entry) => entry.id).filter((id) => picked.has(id) && NEED_IDS.has(id));
}

/** A money amount per person: positive, two decimals, capped. Null for anything else. */
export function parseAmountPerPerson(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(number) || number <= 0 || number > AMOUNT_PER_PERSON_MAX) return null;
  return Math.round(number * 100) / 100;
}

/** One slot, cleaned: only the fields its own need asks for survive. */
export function sanitiseSlot(need: IdeaNeedId, raw: unknown): IdeaSlot {
  const base = emptySlot(need);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const value = raw as Record<string, unknown>;
  const inviteSource = SOURCE_IDS.has(String(value.inviteSource)) ? (value.inviteSource as IdeaInviteSource) : base.inviteSource;
  const email = cleanText(value.inviteEmail, 254);
  const slot: IdeaSlot = {
    ...base,
    board: typeof value.board === "boolean" ? value.board : base.board,
    direct: typeof value.direct === "boolean" ? value.direct : base.direct,
    inviteSource,
    inviteUserId: inviteSource === "platform" ? cleanText(value.inviteUserId, 64) : null,
    inviteName: inviteSource === "platform" ? cleanText(value.inviteName, 120) : null,
    inviteEmail: inviteSource !== "platform" && email && EMAIL.test(email) ? email.toLowerCase() : null,
    inviteUrl: cleanText(value.inviteUrl, 500),
  };
  if (need === "venue") {
    slot.kindOfSpace = cleanText(value.kindOfSpace, SLOT_TEXT_MAX);
    slot.dealPreferences = Array.isArray(value.dealPreferences)
      ? Array.from(new Set(value.dealPreferences.map(String)))
        .filter((id): id is VenueDealId => (VENUE_DEAL_IDS as readonly string[]).includes(id))
      : [];
  }
  if (need === "community") {
    slot.ownCommunity = value.ownCommunity === true;
    slot.earn = EARN_IDS.has(String(value.earn)) ? (value.earn as PeopleEarn) : base.earn;
    slot.amountPerPerson = slot.earn === "per_person" ? parseAmountPerPerson(value.amountPerPerson) : null;
    slot.commissionPct = slot.earn === "commission_per_ticket" ? parseCommissionPct(value.commissionPct) : null;
  }
  if (need === "sponsor") {
    slot.need = cleanText(value.need, SLOT_TEXT_MAX);
    slot.giveBack = cleanText(value.giveBack, SLOT_TEXT_MAX);
  }
  if (need === "service_provider") {
    slot.service = cleanText(value.service, SLOT_TEXT_MAX);
    slot.servicePay = SERVICE_PAY_IDS.has(String(value.servicePay)) ? (value.servicePay as ServicePay) : null;
    slot.feeAmount = slot.servicePay === "fee" ? parseServiceFee(value.feeAmount) : null;
  }
  return slot;
}

/** The slots for the needs that are ticked. A need unticked later leaves nothing behind. */
export function sanitiseSlots(needs: IdeaNeedId[] | null, raw: unknown): Partial<Record<IdeaNeedId, IdeaSlot>> {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Partial<Record<IdeaNeedId, IdeaSlot>> = {};
  for (const need of needs ?? []) out[need] = sanitiseSlot(need, source[need]);
  return out;
}

const interestLabel = (id: IdeaInterestId, other?: string | null) =>
  id === "other"
    ? (other?.trim() || "Something else")
    : (activityLabel(id) || EVENT_CATEGORIES.find((entry) => entry.id === id)?.label
      || IDEA_INTERESTS.find((entry) => entry.id === id)?.label || id);

/**
 * "Sport and movement, music and nightlife · anyone" — screen 2's interests and
 * level as one line. Tim's pre-launch "For" line adds the group size after it.
 */
export function describeInterests(interests: IdeaInterestId[] | undefined, other?: string | null, level?: IdeaLevel | null): string | null {
  const list = sanitiseInterests(interests ?? []);
  if (list.length === 0) return null;
  const words = list.map((id, index) => {
    const label = interestLabel(id, other);
    // Only the built-in labels are lowered; what somebody typed stays as typed.
    return index === 0 || id === "other" ? label : label.charAt(0).toLowerCase() + label.slice(1);
  });
  const levelText = level && LEVEL_IDS.has(level) ? IDEA_LEVELS.find((entry) => entry.id === level)!.label.toLowerCase() : null;
  return [words.join(", "), levelText].filter(Boolean).join(" · ");
}

export function describeGroupSize(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min && max) return min === max ? `${min} people` : `${min} to ${max} people`;
  if (max) return `Up to ${max} people`;
  if (min) return `From ${min} people`;
  return null;
}

/** The whole "For" line: "Sport and movement · anyone · 10 to 60 people". Older drafts read their typed audience. */
export function describeIdeaFor(concept: Partial<ConceptIdea> | null | undefined): string | null {
  if (!concept) return null;
  const who = describeInterests(concept.interests, concept.interestOther, concept.level) ?? (concept.audience?.trim() || null);
  const parts = [who, describeGroupSize(concept.groupSizeMin, concept.groupSizeMax)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** "€2.00 per person who checks in", "Free access", … */
export function describePeopleEarn(slot: (Pick<IdeaSlot, "earn" | "amountPerPerson"> & { commissionPct?: number | string | null }) | null | undefined): string | null {
  if (!slot?.earn) return null;
  if (slot.earn === "per_person") {
    // The form holds what was typed until it is saved, so read it as a number here.
    const amount = parseAmountPerPerson(slot.amountPerPerson);
    return amount ? `€${amount.toFixed(2)} per person who checks in` : "Per person who checks in";
  }
  if (slot.earn === "commission_per_ticket") {
    const pct = parseCommissionPct(slot.commissionPct);
    return pct ? `Commission per ticket: ${pct}%` : "Commission per ticket";
  }
  return PEOPLE_EARN_OPTIONS.find((entry) => entry.id === slot.earn)?.label ?? LEGACY_EARN_LABELS[slot.earn] ?? null;
}

/** "Fee: €150.00", "Barter", "Content licence". */
export function describeServicePay(slot: { servicePay?: ServicePay | null; feeAmount?: number | string | null } | null | undefined): string | null {
  if (!slot?.servicePay) return null;
  const option = SERVICE_PAY_OPTIONS.find((entry) => entry.id === slot.servicePay);
  if (!option) return null;
  const fee = slot.servicePay === "fee" ? parseServiceFee(slot.feeAmount) : null;
  return fee ? `Fee: €${fee.toFixed(2)}` : option.label;
}

/** The `concept` column value for these answers. */
export function buildConcept(input: IdeaInput): ConceptIdea {
  const period = input.dateMode === "period";
  const interests = sanitiseInterests(input.interests);
  const level = LEVEL_IDS.has(input.level) ? input.level : "anyone";
  const interestOther = interests.includes("other") ? cleanText(input.interestOther, IDEA_INTEREST_OTHER_MAX) : null;
  const needs = sanitiseNeeds(input.needs);
  return {
    stage: "concept",
    dateMode: input.dateMode,
    periodStart: period && isRealDay(input.periodStart) ? input.periodStart : null,
    periodEnd: period && isRealDay(input.periodEnd) ? input.periodEnd : null,
    dayPreference: period ? (input.dayPreference ?? "any") : null,
    // Interests replace the typed audience; the line they make is kept in the old
    // field too, so every place that reads `audience` keeps showing something true.
    audience: interests.length
      ? cleanText(describeInterests(interests, interestOther, level), IDEA_AUDIENCE_MAX)
      : cleanText(input.audience, IDEA_AUDIENCE_MAX),
    groupSizeMin: parseGroupSize(input.groupSizeMin),
    groupSizeMax: parseGroupSize(input.groupSizeMax),
    place: cleanText(input.place, IDEA_PLACE_MAX),
    ...placeFields(input.place.trim() ? input : null),
    linkedVenueId: cleanText(input.linkedVenueId, 64),
    interests,
    interestOther,
    level,
    needs,
    slots: sanitiseSlots(needs, input.slots),
    note: cleanText(input.note, IDEA_NOTE_MAX),
    collabIdeaId: cleanText(input.collabIdeaId, 64),
    sentAt: cleanText(input.sentAt, 40),
  };
}

export type SlotErrors = Partial<Record<"find" | "invite" | "inviteEmail" | "amountPerPerson" | "commissionPct" | "feeAmount" | "kindOfSpace" | "need" | "service", string>>;

/** One need's screen. Text answers are optional; who to invite and the amount are not, once chosen. */
export function validateIdeaSlot(need: IdeaNeedId, slot: IdeaSlot | undefined): SlotErrors {
  const errors: SlotErrors = {};
  const value = slot ?? emptySlot(need);
  const ownOnly = need === "community" && value.ownCommunity;
  if (!value.board && !value.direct && !ownOnly) {
    errors.find = need === "community"
      ? "Choose Post to board, Invite directly or I bring my own community."
      : "Choose Post to board, Invite directly, or both.";
  }
  if (value.direct && !value.inviteUrl) {
    if (value.inviteSource === "platform" && !value.inviteUserId) errors.invite = "Pick who to invite, or invite by link or email.";
    if (value.inviteSource === "email") {
      const email = (value.inviteEmail ?? "").trim();
      if (!email || !EMAIL.test(email)) errors.inviteEmail = "Enter their email address.";
    }
  }
  if (need === "community" && value.earn === "per_person" && parseAmountPerPerson(value.amountPerPerson) === null) {
    errors.amountPerPerson = `Enter an amount between €0.01 and €${AMOUNT_PER_PERSON_MAX}.`;
  }
  if (need === "community" && value.earn === "commission_per_ticket" && parseCommissionPct(value.commissionPct) === null) {
    errors.commissionPct = `Enter a percentage between 0.1 and ${COMMISSION_PCT_MAX}.`;
  }
  // The fee amount is optional: "to agree" is a fine answer at the idea stage.
  if (need === "service_provider" && value.servicePay === "fee" && value.feeAmount !== null && value.feeAmount !== undefined
    && String(value.feeAmount).trim() !== "" && parseServiceFee(value.feeAmount) === null) {
    errors.feeAmount = `Enter an amount between €0.01 and €${SERVICE_FEE_MAX}, or leave it empty.`;
  }
  return errors;
}

/** Screen 3 must be answered: something, or "Nothing". */
export function validateIdeaNeeds(input: IdeaInput): IdeaErrors {
  return input.needs === null ? { needs: "Pick what you still need, or Nothing." } : {};
}

/** The needs whose slot asks for a posting: on the board, or with somebody invited directly. */
export function needsToPost(input: Pick<IdeaInput, "needs" | "slots">): IdeaNeedId[] {
  return (input.needs ?? []).filter((need) => {
    const slot = input.slots?.[need];
    return !!slot && (slot.board || slot.direct);
  });
}

/** The midday instant for a day, as the builder and the draft routes send dates. */
function dayInstant(day: string | null | undefined): string | null {
  return isRealDay(day) ? `${day}T12:00:00.000Z` : null;
}

/**
 * The Collab board posting written from the slots (26.3). Null when there is
 * nothing to post. `listed` is false when every slot is "Invite directly" only,
 * so the row carries the invites and the board never shows it.
 */
export function buildCollabIdeaPayload(input: IdeaInput, draftId: string | null) {
  const needs = needsToPost(input);
  if (needs.length === 0) return null;
  const onBoard = needs.filter((need) => input.slots[need]?.board);
  // Cleaned the way the draft stores them: trimmed, and only each need's own fields.
  const concept = buildConcept(input);
  const venue = concept.slots?.venue;
  const community = concept.slots?.community;
  const sponsor = concept.slots?.sponsor;
  const service = concept.slots?.service_provider;
  const typeDetails: Record<string, Record<string, string>> = {};
  if (venue?.kindOfSpace) typeDetails.venue = { kindOfSpace: venue.kindOfSpace };
  if (community) {
    const earn = describePeopleEarn(community);
    if (earn) typeDetails.community = { earn };
  }
  if (sponsor && (sponsor.need || sponsor.giveBack)) {
    typeDetails.sponsor = {
      ...(sponsor.need ? { need: sponsor.need } : {}),
      ...(sponsor.giveBack ? { giveBack: sponsor.giveBack } : {}),
    };
  }
  if (service && (service.service || service.servicePay)) {
    const pay = describeServicePay(service);
    typeDetails.service_provider = {
      ...(service.service ? { service: service.service } : {}),
      ...(pay ? { pay } : {}),
    };
  }

  const exact = input.dateMode === "exact";
  const period = input.dateMode === "period";
  const start = exact ? input.exactStart : period ? input.periodStart : null;
  const end = exact ? (input.exactEnd || input.exactStart) : period ? input.periodEnd : null;
  const description = [input.oneLiner.trim(), input.note.trim()].filter(Boolean).join("\n\n");

  return {
    title: input.title.trim().slice(0, IDEA_TITLE_MAX),
    description: description || null,
    // The board lists what it is asked to find; an invite-only posting still
    // needs its types for the invites that hang off it.
    seekingPartnerTypes: onBoard.length ? onBoard : needs,
    typeDetails,
    dealPreferences: venue?.dealPreferences ?? [],
    audience: describeIdeaFor(concept),
    city: input.placeCity?.trim() || input.place.trim() || null,
    groupSizeMin: concept.groupSizeMin,
    groupSizeMax: concept.groupSizeMax,
    estimatedStart: dayInstant(start),
    estimatedEnd: dayInstant(end),
    photoUrl: input.photoUrl.trim() || null,
    listed: onBoard.length > 0,
    experienceDraftId: draftId,
  };
}

/** The idea answers back out of a saved draft, so the flow can be reopened where it stopped. */
export function ideaInputFromDraft(draft: Record<string, any> | null | undefined): IdeaInput | null {
  if (!draft || !isConceptDraft(draft)) return null;
  const concept = sanitiseConcept(draft.concept)!;
  const day = (value: unknown) => {
    if (!value) return "";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  };
  const startDay = day(draft.startDate);
  const endDay = day(draft.endDate);
  return {
    ...EMPTY_IDEA,
    title: String(draft.title ?? ""),
    oneLiner: String(draft.description ?? ""),
    dateMode: concept.dateMode,
    exactStart: concept.dateMode === "exact" ? startDay : "",
    exactEnd: concept.dateMode === "exact" && endDay && endDay !== startDay ? endDay : "",
    startTime: typeof draft.startTime === "string" ? draft.startTime : "",
    endTime: typeof draft.endTime === "string" ? draft.endTime : "",
    periodStart: concept.periodStart ?? "",
    periodEnd: concept.periodEnd ?? "",
    dayPreference: concept.dayPreference,
    place: concept.place ?? String(draft.location ?? ""),
    placeCity: concept.placeCity ?? draft.city ?? null,
    placeLat: coordinate(concept.placeLat ?? draft.latitude, 90),
    placeLng: coordinate(concept.placeLng ?? draft.longitude, 180),
    linkedVenueId: concept.linkedVenueId,
    // Interests are shown as chips; the old free-text audience only comes back when there are none.
    audience: concept.interests?.length ? "" : (concept.audience ?? ""),
    groupSizeMin: concept.groupSizeMin ?? "",
    groupSizeMax: concept.groupSizeMax ?? "",
    interests: concept.interests ?? [],
    interestOther: concept.interestOther ?? "",
    level: concept.level ?? "anyone",
    needs: concept.needs ?? null,
    slots: concept.slots ?? {},
    note: concept.note ?? "",
    photoUrl: String(draft.coverImageUrl ?? ""),
    collabIdeaId: concept.collabIdeaId ?? null,
    sentAt: concept.sentAt ?? null,
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

  const interests = sanitiseInterests(value.interests);
  const needs = sanitiseNeeds(value.needs);
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
    ...placeFields(value),
    linkedVenueId: cleanText(value.linkedVenueId, 64),
    interests,
    interestOther: interests.includes("other") ? cleanText(value.interestOther, IDEA_INTEREST_OTHER_MAX) : null,
    level: LEVEL_IDS.has(String(value.level)) ? (value.level as IdeaLevel) : null,
    needs,
    slots: sanitiseSlots(needs, value.slots),
    note: cleanText(value.note, IDEA_NOTE_MAX),
    collabIdeaId: cleanText(value.collabIdeaId, 64),
    sentAt: cleanText(value.sentAt, 40),
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
    endTime: startDate && TIME.test(input.endTime ?? "") ? input.endTime : null,
    location: input.place.trim().slice(0, IDEA_PLACE_MAX),
    // The city comes from the place (66.32c): the builder does not ask it again.
    ...(input.place.trim() && cleanText(input.placeCity, 80) ? { city: cleanText(input.placeCity, 80) } : {}),
    latitude: input.place.trim() ? coordinate(input.placeLat, 90) : null,
    longitude: input.place.trim() ? coordinate(input.placeLng, 180) : null,
    selectedVenueId: linked,
    // The category is inferred, not asked (point 30): the first activity
    // picked is the event's activity, and its group the category (board A1).
    // Left out, the draft would take the table's default, a category nobody chose.
    category: currentCategory(firstActivity(input.interests)) ?? currentCategory(sanitiseInterests(input.interests)[0]) ?? "",
    activity: firstActivity(input.interests),
    venueType: "catalog" as const,
    maxParticipants: max,
    // The review screen's optional photo is the event's cover. Only a full URL:
    // the draft schema refuses anything else, and one bad field fails the whole save.
    coverImageUrl: /^https?:\/\//i.test(input.photoUrl ?? "") ? input.photoUrl.trim() : "",
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
