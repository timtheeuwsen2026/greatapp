const DAY_MS = 24 * 60 * 60 * 1000;

type DateValue = Date | string | null | undefined;

export type DepositScheduleInput = {
  experienceType?: string | null;
  startDate?: DateValue;
  endDate?: DateValue;
  balanceDueDays?: number | null;
  depositAmount?: number | null;
  now?: Date;
};

function parseDate(value: DateValue): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameUtcDay(left: Date, right: Date) {
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}

export function isSingleDayExperience(input: Pick<DepositScheduleInput, "experienceType" | "startDate" | "endDate">) {
  const normalizedType = String(input.experienceType || "").trim().toLowerCase();
  if (["one-day", "single-day", "one_day", "single_day"].includes(normalizedType)) {
    return true;
  }
  if (normalizedType === "multi-day") return false;

  const startDate = parseDate(input.startDate);
  const endDate = parseDate(input.endDate);
  return Boolean(startDate && endDate && isSameUtcDay(startDate, endDate));
}

export function getDepositSchedule(input: DepositScheduleInput) {
  const depositAmount = Number(input.depositAmount || 0);
  if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
    return { available: false, balanceDueDate: null, reason: "not_configured" as const };
  }

  if (isSingleDayExperience(input)) {
    return { available: false, balanceDueDate: null, reason: "single_day" as const };
  }

  const startDate = parseDate(input.startDate);
  if (!startDate) {
    return { available: false, balanceDueDate: null, reason: "missing_start_date" as const };
  }

  const requestedDueDays = Number(input.balanceDueDays ?? 14);
  const dueDays = Number.isFinite(requestedDueDays)
    ? Math.max(1, Math.trunc(requestedDueDays))
    : 14;
  const balanceDueDate = new Date(startDate.getTime() - dueDays * DAY_MS);
  const now = input.now || new Date();

  if (balanceDueDate.getTime() <= now.getTime()) {
    return { available: false, balanceDueDate: null, reason: "balance_due_not_future" as const };
  }

  return { available: true, balanceDueDate, reason: "available" as const };
}
