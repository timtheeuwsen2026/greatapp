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

export function calculateMvgDeadline(
  startDate: Date | string,
  deadlineDays: unknown,
): Date {
  const deadline = new Date(startDate);
  if (Number.isNaN(deadline.getTime())) {
    throw new Error("Cannot calculate MVG deadline without a valid start date");
  }

  deadline.setUTCDate(
    deadline.getUTCDate() - normalizeMvgDeadlineDays(deadlineDays),
  );
  deadline.setUTCHours(23, 59, 59, 999);
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
