import { groupDeadlineAt, type EventTimeLike } from "@shared/eventTime";

export const DEFAULT_MVG_DEADLINE_DAYS = 7;

export const MVG_PREPUBLICATION_FAILURE_REASON =
  "MVG deadline expired before publication";

export const MVG_DEADLINE_FAILURE_REASON =
  "MVG not reached by the deadline";

export function normalizeMvgDeadlineDays(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MVG_DEADLINE_DAYS;
  return Math.max(0, Math.trunc(parsed));
}

/**
 * The minimum-group deadline (66.21, 64.2): a number of hours before the
 * event's start time, in the event's own city time. 0 is the start itself,
 * when ticket sales close anyway. A setting in days counts as 24 hours a day.
 *
 * It used to be the end of a day in UTC, so "0 days" ran past the start
 * (until 23:59 UTC, 00:59 in Barcelona) and TEST 2 was refunded at 01:00.
 * The check runs every 15 minutes, so a refund follows within 15 minutes.
 */
export function calculateMvgDeadline(
  event: EventTimeLike | Date | string,
  deadlineDays: unknown,
  deadlineHours?: unknown,
): Date {
  const timing: EventTimeLike = event instanceof Date || typeof event === "string" ? { startDate: event } : event;
  const hours = Number(deadlineHours);
  const before = deadlineHours !== undefined && deadlineHours !== null && deadlineHours !== "" && Number.isFinite(hours) && hours >= 0
    ? hours
    : normalizeMvgDeadlineDays(deadlineDays) * 24;
  const deadline = groupDeadlineAt(timing, before);
  if (!deadline) {
    throw new Error("Cannot calculate MVG deadline without a valid start date");
  }
  return deadline;
}

export function isMvgDeadlineDue(
  experience: {
    requireMinimumParticipants?: boolean | null;
    mvgStatus?: string | null;
    mvgDeadline?: Date | string | null;
    mvgResolvedAt?: Date | string | null;
    mvgFailedAt?: Date | string | null;
  },
  now = new Date(),
): boolean {
  if (
    !experience.requireMinimumParticipants ||
    experience.mvgStatus !== "pending" ||
    !experience.mvgDeadline ||
    experience.mvgResolvedAt ||
    experience.mvgFailedAt
  ) {
    return false;
  }

  const deadline = new Date(experience.mvgDeadline);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() <= now.getTime();
}
