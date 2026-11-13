/**
 * When an event really starts and ends (Tim's point 66.21).
 *
 * An event is stored as calendar days (startDate/endDate, anchored around
 * midday UTC, see calendarDates.ts) plus clock times (startTime/endTime,
 * "18:00"). The clock times mean the time in the event's own city. Before
 * this, every part of the platform made up its own "now": the booking page
 * kept TEST 3 open at 12:00 although it started at 00:00, the payout counted
 * from 07:00 UTC, and the minimum-group check ran at 23:59 UTC.
 *
 * Now there is one start and one end moment per event, in the city's time
 * zone, and booking, the minimum-group deadline, add-on cut-off and the
 * payout all count from them.
 */
import { cityOfEvent, liveCityByName } from "./cities";

/** Barcelona time. Used for an event whose city has no time zone of its own yet. */
export const DEFAULT_TIME_ZONE = "Europe/Madrid";

export type EventTimeLike = {
  startDate?: Date | string | number | null;
  endDate?: Date | string | number | null;
  startTime?: string | null;
  endTime?: string | null;
  city?: string | null;
  location?: string | null;
  title?: string | null;
};

type Day = { year: number; month: number; day: number };

function toInstant(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (plain) return new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]), 12));
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The calendar day a stored date stands for (they are anchored around midday UTC). */
function calendarDay(value: Date | string | number | null | undefined): Day | null {
  const date = toInstant(value);
  if (!date) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** "18:00", "18:00:00", "6:00 PM" → [18, 0]. Null when there is no usable time. */
export function parseClockTime(value: string | null | undefined): [number, number] | null {
  if (!value) return null;
  const match = /^\s*(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?\s*$/i.exec(value);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return [hours, minutes];
}

/** How far a time zone is ahead of UTC at a given moment, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The moment a wall-clock time in a time zone happens: 10 Nov 00:00 Madrid is 9 Nov 23:00 UTC. */
export function zonedTime(day: Day, hours: number, minutes: number, timeZone: string): Date {
  const wall = Date.UTC(day.year, day.month - 1, day.day, hours, minutes);
  let offset = zoneOffsetMs(new Date(wall), timeZone);
  let moment = wall - offset;
  // Around a clock change the offset at the guess and at the answer can differ.
  const corrected = zoneOffsetMs(new Date(moment), timeZone);
  if (corrected !== offset) {
    offset = corrected;
    moment = wall - offset;
  }
  return new Date(moment);
}

/** The time zone an event's clock times are in: its city's. */
export function eventTimeZone(event: EventTimeLike | null | undefined): string {
  if (!event) return DEFAULT_TIME_ZONE;
  return liveCityByName(cityOfEvent(event as any) ?? "")?.timeZone ?? DEFAULT_TIME_ZONE;
}

/** When the event starts. Without a start time: the start of its first day. */
export function eventStartsAt(event: EventTimeLike | null | undefined): Date | null {
  const day = calendarDay(event?.startDate) ?? calendarDay(event?.endDate);
  if (!day) return null;
  const [hours, minutes] = parseClockTime(event?.startTime) ?? [0, 0];
  return zonedTime(day, hours, minutes, eventTimeZone(event));
}

/**
 * When the event ends. Without an end time: the end of its last day. An end
 * time earlier than the start time on the same day runs past midnight.
 */
export function eventEndsAt(event: EventTimeLike | null | undefined): Date | null {
  const day = calendarDay(event?.endDate) ?? calendarDay(event?.startDate);
  if (!day) return null;
  const zone = eventTimeZone(event);
  const clock = parseClockTime(event?.endTime);
  if (!clock) return new Date(zonedTime(day, 23, 59, zone).getTime() + 59_999);
  let end = zonedTime(day, clock[0], clock[1], zone);
  const start = eventStartsAt(event);
  if (start && end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return end;
}

export type EventPhase = "upcoming" | "happening" | "ended";

/** Before the start, between start and end, or after the end. */
export function eventPhase(event: EventTimeLike | null | undefined, now: Date = new Date()): EventPhase | null {
  const start = eventStartsAt(event);
  const end = eventEndsAt(event);
  if (!start || !end) return null;
  if (now.getTime() < start.getTime()) return "upcoming";
  if (now.getTime() < end.getTime()) return "happening";
  return "ended";
}

export const EVENT_PHASE_LABEL: Record<EventPhase, string> = {
  upcoming: "Upcoming",
  happening: "Happening now",
  ended: "Ended",
};

/**
 * The minimum-group deadline: a number of hours before the start (0 = at the
 * start time, when ticket sales close anyway).
 */
export function groupDeadlineAt(event: EventTimeLike | null | undefined, hoursBeforeStart: number): Date | null {
  const start = eventStartsAt(event);
  if (!start) return null;
  const hours = Number.isFinite(hoursBeforeStart) ? Math.max(0, hoursBeforeStart) : 0;
  return new Date(start.getTime() - hours * 60 * 60 * 1000);
}

/** The payout runs 24 hours after the event ends. */
export const PAYOUT_DELAY_MS = 24 * 60 * 60 * 1000;

export function payoutDueAt(event: EventTimeLike | null | undefined): Date | null {
  const end = eventEndsAt(event);
  return end ? new Date(end.getTime() + PAYOUT_DELAY_MS) : null;
}

/**
 * A moment as people read it in the event's city: "Tue 10 Nov 2026, 00:00".
 * Always 24-hour time and day-month order (Tim, 61.6).
 */
export function formatInZone(
  moment: Date | string | number | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE,
  options: { weekday?: boolean; year?: boolean; time?: boolean } = {},
): string {
  const date = toInstant(moment);
  if (!date) return "";
  const { weekday = true, year = true, time = true } = options;
  const dayPart = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    ...(weekday ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" as const } : {}),
  }).format(date).replace(/,/g, "");
  if (!time) return dayPart;
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return `${dayPart}, ${clock}`;
}

/** "Tue 10 Nov 2026, 00:00": the event's start in its own city's time. */
export function formatEventStart(
  event: EventTimeLike | null | undefined,
  options?: { weekday?: boolean; year?: boolean },
): string {
  const start = eventStartsAt(event);
  if (!start) return "";
  // No start time set: the day only, rather than a made-up 00:00.
  const hasTime = !!parseClockTime(event?.startTime);
  return formatInZone(start, eventTimeZone(event), { ...options, time: hasTime });
}

/** "Tue 10 Nov 2026, 00:00 – 01:00", or with both days for a multi-day event. */
export function formatEventWhen(event: EventTimeLike | null | undefined, options?: { weekday?: boolean; year?: boolean }): string {
  const start = eventStartsAt(event);
  const end = eventEndsAt(event);
  if (!start) return "";
  const zone = eventTimeZone(event);
  const startText = formatInZone(start, zone, { ...options, time: !!parseClockTime(event?.startTime) });
  if (!end || !event?.endTime) {
    const lastDay = calendarDay(event?.endDate);
    const firstDay = calendarDay(event?.startDate);
    const multiDay = lastDay && firstDay && (lastDay.year !== firstDay.year || lastDay.month !== firstDay.month || lastDay.day !== firstDay.day);
    return multiDay ? `${formatInZone(start, zone, { ...options, time: false })} – ${formatInZone(end, zone, { ...options, time: false })}` : startText;
  }
  const sameDay = formatInZone(start, zone, { ...options, time: false }) === formatInZone(end, zone, { ...options, time: false });
  const endText = sameDay
    ? new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(end)
    : formatInZone(end, zone, options);
  return `${startText} – ${endText}`;
}
