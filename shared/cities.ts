/**
 * Cities (Tim's point 66.24).
 *
 * Every event, venue, community, partner offer and collab opportunity belongs to
 * one city. The site shows one city at a time; a visitor picks it, or it is
 * guessed from the country of their internet address.
 *
 * A city is stored by its name ("Barcelona"), the same way venues already stored
 * it. A place that is not one of the live cities (a retreat in Ubud) keeps its
 * own name: it shows under "All cities" until that city goes live.
 */

export interface LiveCity {
  /** Used in the address: /barcelona */
  slug: string;
  /** Stored on records and shown on screen. */
  name: string;
  /** Countries whose visitors are offered this city first. */
  countries: string[];
  /** The city's own clock, for start times and deadlines (66.21). */
  timeZone: string;
  /** Other ways people write it, and the neighbourhoods we see in addresses. */
  aliases: string[];
  /** Postcodes in this city, so an address without the city name still counts. */
  postcode: RegExp;
}

export const LIVE_CITIES: LiveCity[] = [
  {
    slug: "barcelona",
    name: "Barcelona",
    countries: ["ES"],
    timeZone: "Europe/Madrid",
    aliases: [
      "bcn", "barna", "raval", "poblenou", "poble nou", "gotic", "gothic", "el born", "gracia",
      "eixample", "barceloneta", "sant marti", "sarria", "sant gervasi", "ciutat vella", "poble sec",
      "montjuic", "sants", "les corts", "horta", "ciutadella", "bogatell", "sant antoni",
    ],
    postcode: /\b08\d{3}\b/,
  },
  {
    slug: "amsterdam",
    name: "Amsterdam",
    countries: ["NL"],
    timeZone: "Europe/Amsterdam",
    aliases: [
      "a'dam", "oud zuid", "oud-zuid", "de pijp", "jordaan", "vondelpark",
      "amsterdam oost", "amsterdam noord", "amsterdam west", "amstel", "beethovenstraat",
    ],
    postcode: /\b10\d{2}\s?[a-z]{2}\b/i,
  },
];

/** Shown when a visitor's city is unknown or not live (Tim: "If the city is unknown, show Barcelona"). */
export const DEFAULT_CITY = "Barcelona";

/** The choice "All cities" in the city menu and the admin switch. */
export const ALL_CITIES = "all";

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function mentions(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(haystack);
}

export function liveCityByName(name: string | null | undefined): LiveCity | undefined {
  if (!name) return undefined;
  const folded = fold(name);
  return LIVE_CITIES.find((city) => fold(city.name) === folded || city.slug === folded);
}

export function liveCityBySlug(slug: string | null | undefined): LiveCity | undefined {
  if (!slug) return undefined;
  return LIVE_CITIES.find((city) => city.slug === slug.toLowerCase());
}

/** A live city named outright in the text ("Run Club Amsterdam Oud Zuid"). */
export function namedLiveCity(text: string | null | undefined): LiveCity | undefined {
  if (!text) return undefined;
  const folded = fold(text);
  return LIVE_CITIES.find((city) => mentions(folded, fold(city.name)));
}

/**
 * Which live city a piece of text points at: a city field, an address, a title.
 * "Carrer del Rec, 26, 08003 Barcelona" and "Raval" are Barcelona;
 * "Beethovenstraat" is Amsterdam. Returns undefined when it names no live city.
 */
export function detectLiveCity(...texts: Array<string | null | undefined>): LiveCity | undefined {
  for (const text of texts) {
    if (!text) continue;
    const folded = fold(text);
    for (const city of LIVE_CITIES) {
      if (mentions(folded, fold(city.name))) return city;
    }
  }
  for (const text of texts) {
    if (!text) continue;
    const folded = fold(text);
    for (const city of LIVE_CITIES) {
      if (city.aliases.some((alias) => mentions(folded, fold(alias))) || city.postcode.test(text)) return city;
    }
  }
  return undefined;
}

/**
 * The name to store for a city someone typed or picked: a live city gets its
 * own spelling ("barcelona" becomes "Barcelona", "Raval" becomes "Barcelona"),
 * anything else is kept as typed, tidied. Empty stays empty.
 */
export function normalizeCityName(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const live = detectLiveCity(trimmed);
  if (live) return live.name;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** The city a visitor from this country is offered first, if it is live. */
export function liveCityForCountry(countryCode: string | null | undefined): LiveCity | undefined {
  if (!countryCode) return undefined;
  const code = countryCode.toUpperCase();
  return LIVE_CITIES.find((city) => city.countries.includes(code));
}

/** True when a record's city matches the chosen one ("all" matches everything). */
export function inCity(recordCity: string | null | undefined, chosen: string | null | undefined): boolean {
  if (!chosen || chosen === ALL_CITIES) return true;
  const want = normalizeCityName(chosen);
  const have = normalizeCityName(recordCity);
  return !!want && !!have && fold(want) === fold(have);
}

/**
 * The city of an event: its own city field, else the venue's city, else what
 * its address or title says. Used for records made before the field existed.
 */
export function cityOfEvent(event: {
  city?: string | null;
  location?: string | null;
  manualVenueAddress?: string | null;
  title?: string | null;
  venueCity?: string | null;
}): string | null {
  const own = normalizeCityName(event.city);
  if (own) return own;
  const venue = normalizeCityName(event.venueCity);
  if (venue) return venue;
  // A title only counts when it names the city itself: "Born to run" is not El Born.
  return (detectLiveCity(event.location, event.manualVenueAddress) ?? namedLiveCity(event.title))?.name ?? null;
}

/** Path of a city's homepage: /amsterdam. "All cities" is the plain homepage. */
export function cityPath(name: string | null | undefined): string {
  const live = liveCityByName(name ?? "");
  return live ? `/${live.slug}` : "/";
}

export interface CityCounts {
  /** Upcoming public events per live city, in menu order. */
  cities: Array<{ name: string; slug: string; count: number }>;
  /** Upcoming public events everywhere, retreats elsewhere included. */
  total: number;
}

/** The numbers in the city menu: "Amsterdam 24 events". */
export function countEventsByCity(
  events: Array<Parameters<typeof cityOfEvent>[0]>,
  isUpcoming: (event: any) => boolean = () => true,
): CityCounts {
  const upcoming = events.filter(isUpcoming);
  return {
    cities: LIVE_CITIES.map((city) => ({
      name: city.name,
      slug: city.slug,
      count: upcoming.filter((event) => inCity(cityOfEvent(event), city.name)).length,
    })),
    total: upcoming.length,
  };
}
