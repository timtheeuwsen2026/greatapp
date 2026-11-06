/**
 * Has this event already happened?
 *
 * A creator booked a spot on their own event a week after it finished. The
 * checkout took the money, the capacity check passed, and the booking landed
 * on an event nobody would ever attend.
 *
 * The rule is deliberately *not* to hide or delete old events. They stay
 * visible — an organiser's past events are their track record, they carry the
 * verified-turnout figure, and a participant needs to find the thing they went
 * to. What closes is the transaction, and it closes on the server: hiding the
 * button leaves `POST /api/bookings` open to anyone with the event id.
 *
 * "Passed" means the end of the last day, not the start time. A day event
 * running 19:00–23:00 is still joinable at 19:30, and a three-day trip is
 * joinable on day two; both close at midnight after the final day. That is the
 * same boundary the platform's date fields already use — they carry a day, and
 * a booking made on the day itself is a legitimate walk-up.
 */

export type EventDatesLike = {
  startDate?: Date | string | number | null;
  endDate?: Date | string | number | null;
};

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The moment after which the event is over: midnight at the end of its last
 * day, in the server's timezone. Null when the event carries no usable date,
 * which must never be read as "has passed" — an undated draft is not a
 * finished event.
 */
export function experienceClosesAt(experience: EventDatesLike): Date | null {
  const end = toDate(experience?.endDate) || toDate(experience?.startDate);
  if (!end) return null;

  const closing = new Date(end);
  closing.setHours(23, 59, 59, 999);
  return closing;
}

export function hasExperiencePassed(
  experience: EventDatesLike,
  now: Date = new Date(),
): boolean {
  const closesAt = experienceClosesAt(experience);
  if (!closesAt) return false;
  return now.getTime() > closesAt.getTime();
}

/**
 * The message shown wherever booking is refused for this reason.
 *
 * One string so the disabled button, the API refusal and the public event page
 * say the same thing — a buyer told "sold out" by the button and "event has
 * ended" by the server has been told two different stories.
 */
export const EVENT_HAS_PASSED_MESSAGE =
  "This event has already taken place, so it can no longer be booked.";

/**
 * Has a minimum-group event missed its deadline?
 *
 * Every ticket is charged at checkout and refunded if the group is not reached
 * by the deadline. Selling after that moment would charge someone for an event
 * that is already off, so sales close the moment the deadline passes without
 * the group, before the scheduler has even marked the event failed.
 */
export type GroupDeadlineLike = {
  requireMinimumParticipants?: boolean | null;
  mvgStatus?: string | null;
  mvgDeadline?: Date | string | number | null;
};

export function hasMissedGroupDeadline(experience: GroupDeadlineLike, now: Date = new Date()): boolean {
  if (!experience?.requireMinimumParticipants || experience.mvgStatus === "met") return false;
  if (experience.mvgStatus === "failed") return true;
  const deadline = toDate(experience.mvgDeadline);
  return !!deadline && now.getTime() > deadline.getTime();
}

export const GROUP_DEADLINE_MISSED_MESSAGE =
  "Ticket sales are closed: the minimum group was not reached by the deadline. Everyone who booked gets a full refund.";

/** Why this event can no longer be booked, or null while it can. */
export function bookingClosedMessage(experience: EventDatesLike & GroupDeadlineLike, now: Date = new Date()): string | null {
  if (hasExperiencePassed(experience, now)) return EVENT_HAS_PASSED_MESSAGE;
  if (hasMissedGroupDeadline(experience, now)) return GROUP_DEADLINE_MISSED_MESSAGE;
  return null;
}
