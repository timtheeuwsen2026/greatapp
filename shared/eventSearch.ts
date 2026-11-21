/**
 * Search for events and ideas (Tim, bug 1, 21 Nov 2026).
 *
 * What was wrong: the Events page matched the words anywhere in the
 * description, kept the order the database returned, and never set ended
 * events apart. "Running" in Barcelona showed old, ended events and events
 * that only mentioned running somewhere in their text.
 *
 * How it works now:
 *  - It matches on the title, the category, the city and the host first. An
 *    event that only says it in its description comes after those: Good Soles
 *    runs are titled "Sunday Social 5k", and "Running" must still find them.
 *  - Words are matched by their stem at the start of a word, so "Running",
 *    "runs" and "runners" all find "Run club" and "5km run", while "run" does
 *    not find "brunch".
 *  - Every word typed must match.
 *  - Upcoming (and happening) first, soonest first; ended events come last,
 *    most recent first, so the page can grey them out under "Past events".
 *
 * One rule for Home, Events and, once they exist, ideas: anything with a
 * title, a category, a city and a host can be searched.
 */

import { eventEndsAt, eventPhase, eventStartsAt, type EventPhase } from "./eventTime";
import { cityOfEvent } from "./cities";

/** Small words that say nothing about what someone is looking for. */
const STOP_WORDS = new Set(["a", "an", "and", "the", "in", "at", "of", "for", "to", "with", "on", "near", "y", "de", "la", "el"]);

/**
 * A rough English stem: enough for "running" → "run", "runners" → "run",
 * "workshops" → "workshop", "yoga" → "yoga". Short words are left alone.
 */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  for (const suffix of ["ings", "ing", "ers", "er", "es", "s"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  // "runn" → "run", "swimm" → "swim": a doubled last letter left by the suffix.
  if (w.length >= 4 && w[w.length - 1] === w[w.length - 2] && !/[aeiouls]/.test(w[w.length - 1])) {
    w = w.slice(0, -1);
  }
  return w;
}

/** Letters and digits only, accents folded: "Gràcia" and "gracia" are one word. */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function searchTerms(query: string): string[] {
  return words(query).filter((word) => !STOP_WORDS.has(word)).map(stem);
}

export interface Searchable {
  title?: string | null;
  category?: string | null;
  city?: string | null;
  location?: string | null;
  hostName?: string | null;
  manualVenueName?: string | null;
  description?: string | null;
}

/** The words a search may match for one event: title, category, city and host. */
export function searchableWords(item: Searchable): string[] {
  const parts = [
    item.title,
    String(item.category ?? "").replace(/_/g, " "),
    cityOfEvent(item as any) ?? item.city,
    item.hostName,
  ];
  return parts.flatMap((part) => (part ? words(String(part)) : [])).map(stem);
}

/** True when every word typed starts one of the item's words. An empty search matches everything. */
export function matchesSearch(item: Searchable, query: string): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const haystack = searchableWords(item);
  return terms.every((term) => haystack.some((word) => word.startsWith(term)));
}

export type SearchMode = "all" | "any";

/**
 * How well an item matches: 2 on the title, category, city or host; 1 only
 * through its description; 0 not at all. "all" needs every word typed, "any"
 * one of them (a chip such as "Run clubs" names a kind of event).
 */
export function searchRank(item: Searchable, query: string, mode: SearchMode = "all"): 0 | 1 | 2 {
  const terms = searchTerms(query);
  if (terms.length === 0) return 2;
  const test = (haystack: string[]) => {
    const hit = (term: string) => haystack.some((word) => word.startsWith(term));
    return mode === "all" ? terms.every(hit) : terms.some(hit);
  };
  const strong = searchableWords(item);
  if (test(strong)) return 2;
  const withDescription = strong.concat(words(String(item.description ?? "")).map(stem));
  return test(withDescription) ? 1 : 0;
}

/**
 * The search, start to finish: matches only, upcoming first (soonest first,
 * strong matches before description-only ones), ended last.
 */
export function searchEvents<T extends Searchable>(items: T[], query: string, mode: SearchMode = "all", now: Date = new Date()): SplitResult<T> {
  const ranked = new Map<T, number>();
  for (const item of items) {
    const rank = searchRank(item, query, mode);
    if (rank > 0) ranked.set(item, rank);
  }
  const { upcoming, past } = splitByWhen(Array.from(ranked.keys()), now);
  // Stable: the date order stays within each rank.
  const byRank = (a: T, b: T) => (ranked.get(b) ?? 0) - (ranked.get(a) ?? 0);
  return { upcoming: [...upcoming].sort(byRank), past: [...past].sort(byRank) };
}

/** True when any of these words matches: for a chip like "Run clubs" that names a kind of event. */
export function matchesAnyWord(item: Searchable, query: string): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const haystack = searchableWords(item);
  return terms.some((term) => haystack.some((word) => word.startsWith(term)));
}

export interface SplitResult<T> {
  /** Upcoming and happening now, soonest first. Events with no date yet come after them. */
  upcoming: T[];
  /** Ended, most recent first. */
  past: T[];
}

/** Upcoming first, soonest first; ended last, most recent first. */
export function splitByWhen<T>(items: T[], now: Date = new Date()): SplitResult<T> {
  const dated = items.map((item) => ({
    item,
    phase: eventPhase(item as any, now) as EventPhase | null,
    start: eventStartsAt(item as any)?.getTime() ?? null,
    end: eventEndsAt(item as any)?.getTime() ?? null,
  }));
  const upcoming = dated
    .filter((entry) => entry.phase !== "ended")
    // No date yet (an idea, or a draft-like listing) sorts after the dated ones.
    .sort((a, b) => (a.start ?? Number.MAX_SAFE_INTEGER) - (b.start ?? Number.MAX_SAFE_INTEGER))
    .map((entry) => entry.item);
  const past = dated
    .filter((entry) => entry.phase === "ended")
    .sort((a, b) => (b.end ?? b.start ?? 0) - (a.end ?? a.start ?? 0))
    .map((entry) => entry.item);
  return { upcoming, past };
}
