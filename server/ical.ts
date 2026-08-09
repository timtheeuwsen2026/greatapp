/**
 * iCalendar (RFC 5545) reading and writing for venue availability.
 *
 * A venue's dates live in two places we do not control: whatever they already
 * run on (Airbnb, Booking.com, Google Calendar) and this platform. Two-way
 * sync keeps them from double-booking:
 *
 *   Import — we fetch their .ics feeds and write the busy dates into
 *   venue_availability as blocked, so a creator cannot request a date that is
 *   already sold.
 *
 *   Export — we publish one .ics feed per venue containing the events
 *   confirmed here, so a confirmed handshake blocks the date in their own
 *   calendar too.
 *
 * Written by hand rather than pulled from a library: the surface we need is
 * small, and .ics feeds from the big platforms are plain VEVENTs with DATE or
 * DATE-TIME stamps. Recurrence rules are deliberately not expanded — no
 * accommodation platform emits them for bookings, and silently mis-expanding
 * an RRULE would block dates a venue never blocked.
 */

/** One busy window read out of an external feed. */
export type IcalBusyPeriod = {
  /** The feed's own identifier, so re-importing updates rather than duplicates. */
  uid: string;
  start: Date;
  /** Exclusive, as iCalendar defines DTEND. */
  end: Date;
  summary: string | null;
};

const MAX_FEED_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

/** Undo RFC 5545 line folding: a CRLF followed by a space or tab continues the line. */
function unfoldLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

/**
 * Splits "DTSTART;VALUE=DATE:20260812" into its name, parameters and value.
 * Returns null for lines that are not properties.
 */
function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");

  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }

  return { name: name.toUpperCase(), params, value };
}

/**
 * Reads a DTSTART/DTEND value. All-day values (VALUE=DATE) are anchored at UTC
 * midnight — a venue blocking "the 12th" means the whole day wherever it is,
 * and shifting that by a local timezone would leak a day either side.
 */
function parseIcalDate(value: string, params: Record<string, string>): Date | null {
  const raw = value.trim();

  if (params.VALUE === "DATE" || /^\d{8}$/.test(raw)) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw);
  if (!match) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  // A floating (no Z) or TZID-qualified stamp is read as UTC. For blocking
  // whole days that is accurate enough, and it never drifts by more than the
  // offset — far safer than guessing at an unshipped timezone database.
  const date = new Date(Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6]),
  ));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Unescapes the text values RFC 5545 escapes: \n \, \; \\ */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * Pulls the busy periods out of an .ics document.
 *
 * Events marked TRANSPARENT (they do not consume time) and cancelled events
 * are skipped — Google emits both, and neither blocks a venue.
 */
export function parseIcalBusyPeriods(icsText: string): IcalBusyPeriod[] {
  if (!icsText || typeof icsText !== "string") return [];

  const periods: IcalBusyPeriod[] = [];
  let current: Partial<IcalBusyPeriod> & { transparent?: boolean; cancelled?: boolean; allDay?: boolean } | null = null;

  for (const line of unfoldLines(icsText)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === "BEGIN:VEVENT") { current = {}; continue; }

    if (trimmed === "END:VEVENT") {
      if (current && current.start && !current.transparent && !current.cancelled) {
        // A DTEND is optional. An all-day event without one covers a single
        // day; a timed one without one is treated as an instant.
        const end = current.end
          ?? (current.allDay ? new Date(current.start.getTime() + 86400000) : current.start);
        if (end.getTime() >= current.start.getTime()) {
          periods.push({
            uid: current.uid || `${current.start.toISOString()}_${end.toISOString()}`,
            start: current.start,
            end,
            summary: current.summary ?? null,
          });
        }
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const parsed = parseLine(trimmed);
    if (!parsed) continue;

    switch (parsed.name) {
      case "UID":
        current.uid = parsed.value.trim();
        break;
      case "DTSTART": {
        const date = parseIcalDate(parsed.value, parsed.params);
        if (date) {
          current.start = date;
          current.allDay = parsed.params.VALUE === "DATE" || /^\d{8}$/.test(parsed.value.trim());
        }
        break;
      }
      case "DTEND": {
        const date = parseIcalDate(parsed.value, parsed.params);
        if (date) current.end = date;
        break;
      }
      case "SUMMARY":
        current.summary = unescapeText(parsed.value).slice(0, 500);
        break;
      case "TRANSP":
        current.transparent = parsed.value.trim().toUpperCase() === "TRANSPARENT";
        break;
      case "STATUS":
        current.cancelled = parsed.value.trim().toUpperCase() === "CANCELLED";
        break;
    }
  }

  return periods;
}

/**
 * Downloads a feed. Rejects anything that is not plainly an .ics document so a
 * mistyped URL surfaces as an error the venue can read, rather than quietly
 * importing zero dates forever.
 */
export async function fetchIcalFeed(url: string): Promise<string> {
  let parsed: URL;
  try {
    // webcal:// is what Airbnb and Apple hand out; it is https underneath.
    parsed = new URL(url.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new Error("That does not look like a calendar link.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Calendar links must start with https://");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5" },
    });

    if (!response.ok) {
      throw new Error(`The calendar link returned ${response.status}.`);
    }

    const text = await response.text();
    if (text.length > MAX_FEED_BYTES) {
      throw new Error("That calendar is too large to import.");
    }
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      throw new Error("That link did not return a calendar file.");
    }
    return text;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("The calendar link timed out.");
    throw error instanceof Error ? error : new Error("Could not read that calendar link.");
  } finally {
    clearTimeout(timer);
  }
}

// ─── Writing ────────────────────────────────────────────────────────────────

/** Escapes a text value for an .ics property. */
function escapeText(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds a property line to the 75-octet limit RFC 5545 asks for. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

function formatIcalDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function formatIcalDateTime(date: Date): string {
  return `${formatIcalDate(date)}T${
    String(date.getUTCHours()).padStart(2, "0")
  }${String(date.getUTCMinutes()).padStart(2, "0")}${
    String(date.getUTCSeconds()).padStart(2, "0")
  }Z`;
}

export type IcalExportEvent = {
  uid: string;
  start: Date;
  /** Exclusive. For a stay ending on the 16th, pass the 17th. */
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  /**
   * When this event last changed. Stamping "now" on every fetch told the
   * subscriber every booking had just been edited, every time it polled.
   */
  stamp?: Date | null;
};

/**
 * Builds the venue's outbound feed. Events are all-day: a venue's external
 * calendar cares that the property is taken on those dates, not the hour.
 */
export function buildIcalFeed(calendarName: string, events: IcalExportEvent[], stampedAt: Date): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Great//Venue Availability//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`),
  ];

  for (const event of events) {
    if (!(event.start instanceof Date) || Number.isNaN(event.start.getTime())) continue;
    const end = event.end instanceof Date && !Number.isNaN(event.end.getTime())
      ? event.end
      : new Date(event.start.getTime() + 86400000);

    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:${escapeText(event.uid)}`));
    const stamp = event.stamp instanceof Date && !Number.isNaN(event.stamp.getTime())
      ? event.stamp
      : stampedAt;
    lines.push(`DTSTAMP:${formatIcalDateTime(stamp)}`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(event.start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcalDate(end)}`);
    lines.push(foldLine(`SUMMARY:${escapeText(event.summary)}`));
    if (event.description) lines.push(foldLine(`DESCRIPTION:${escapeText(event.description)}`));
    if (event.location) lines.push(foldLine(`LOCATION:${escapeText(event.location)}`));
    // OPAQUE is the point of the whole feed: these dates are taken.
    lines.push("TRANSP:OPAQUE");
    lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// ─── Overlap ────────────────────────────────────────────────────────────────

/** The UTC day a moment falls on, as a day number. */
export function utcDayNumber(value: Date | string): number {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return NaN;
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
}

/** Midnight UTC on the day a moment falls on. */
export function startOfUtcDay(value: Date | string): Date {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * The last day an event touches.
 *
 * Handles both kinds of calendar entry with one rule. An all-day event's DTEND
 * is exclusive — 3rd to 6th means the 3rd, 4th and 5th — while a timed event's
 * DTEND is the real finishing moment. Stepping back a millisecond before
 * taking the day gives the right answer for both, and for an event that ends
 * exactly at midnight.
 */
export function lastDayTouched(start: Date, end: Date): Date {
  if (!(end instanceof Date) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return startOfUtcDay(start);
  }
  const lastMoment = new Date(end.getTime() - 1);
  const last = startOfUtcDay(lastMoment);
  const first = startOfUtcDay(start);
  return last.getTime() < first.getTime() ? first : last;
}

/**
 * Whether two date ranges collide, compared by whole days.
 *
 * Availability is a day-level idea. A venue blocked 6am to 3pm on the 3rd is
 * unavailable on the 3rd — comparing the underlying instants said otherwise,
 * because a creator picking "the 3rd" sends midnight and midnight is not
 * inside 6am-to-3pm. Both ends are inclusive: one group leaving the morning
 * another arrives is still a clash for a venue taken whole.
 */
export function rangesOverlap(
  aStart: Date | string,
  aEnd: Date | string | null | undefined,
  bStart: Date | string,
  bEnd: Date | string | null | undefined,
): boolean {
  const a1 = utcDayNumber(aStart);
  const a2 = utcDayNumber(aEnd || aStart);
  const b1 = utcDayNumber(bStart);
  const b2 = utcDayNumber(bEnd || bStart);
  if ([a1, a2, b1, b2].some(Number.isNaN)) return false;
  return a1 <= Math.max(b1, b2) && b1 <= Math.max(a1, a2);
}
