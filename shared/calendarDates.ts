/**
 * Dates that mean a day, not a moment.
 *
 * An experience's start and end are calendar dates — a trip runs "12 to 16
 * August" wherever you are reading from. The time of day lives separately in
 * startTime/endTime. Storing them as instants derived from the creator's local
 * midnight broke that: a creator in Karachi picking 27 October stored
 * 2026-10-26T19:00:00Z, so a venue in New York saw 26 October and an accepted
 * handshake held the wrong day.
 *
 * These dates are anchored to midday UTC instead. Two things follow:
 *
 *   Reading — every existing `new Date(value).toLocaleDateString()` in the app
 *   keeps rendering the intended day, anywhere from UTC-11 to UTC+11. Nothing
 *   had to be rewritten across sixty-odd display sites, each of which would
 *   have been a chance to break a page nobody thought to check.
 *
 *   Comparing — startOfUtcDay and utcDayNumber land on the intended day too,
 *   so availability, conflicts and handshake holds all agree.
 *
 * The honest limit: UTC+12 and beyond (New Zealand, Fiji, Samoa) and UTC-12
 * still render a day out. Fixing those needs every display to render in UTC,
 * which is a bigger and riskier change than the problem currently justifies.
 */

/** Midday UTC on a given calendar day, from anything date-shaped. */
export function toCalendarDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;

  // A plain YYYY-MM-DD is already a calendar date and must not be shifted by
  // being read as UTC midnight and then re-localised.
  if (typeof value === "string") {
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (plain) {
      return new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]), 12));
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  // An instant carries a timezone. The day the person meant is the day their
  // own clock showed, which is what the local getters report.
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
}

/** The same, as an ISO string ready to send or store. Null passes through. */
export function toCalendarDateISO(value: Date | string | number | null | undefined): string | null {
  const date = toCalendarDate(value);
  return date ? date.toISOString() : null;
}

/**
 * The YYYY-MM-DD a value represents, read the way it was written.
 *
 * Used for query strings, where a bare date says exactly what it means and
 * cannot be re-interpreted by whatever timezone the server happens to run in.
 */
export function toDateOnly(value: Date | string | number | null | undefined): string | null {
  const date = toCalendarDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}
