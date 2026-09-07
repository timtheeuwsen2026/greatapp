/**
 * Who actually turned up, and what an organiser can claim because of it.
 *
 * A blank percentage field gives an organiser nothing to negotiate with. "I
 * average 45 people per event" does — but only if the number is real, which is
 * why it is built from attendance confirmed on events that have already
 * finished, never from RSVPs, ticket sales, or anything about the event
 * currently being proposed. Otherwise anyone could claim a figure by listing an
 * event with a large capacity.
 *
 * Deliberately independent of QR scanning. Casual events will not scan
 * consistently, so a turnout figure built on scan counts would under-report
 * every one of them; a scan is one way for an organiser to confirm attendance,
 * and marking the list by hand is another, and the two count the same.
 */

export const ATTENDANCE_STATUSES = ["unknown", "attended", "no_show"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export type AttendanceBookingLike = {
  attendanceStatus?: string | null;
  ticketQuantity?: number | string | null;
};

export type EventAttendanceSummary = {
  /** People confirmed present. A booking for three counts as three. */
  attended: number;
  noShow: number;
  /** Nobody has said either way yet. */
  unmarked: number;
  /** Everyone booked, whatever happened on the day. */
  booked: number;
  /**
   * True once the organiser has answered for at least one booking. An event
   * nobody marked is silent, not a zero — counting it as zero would punish an
   * organiser for forgetting rather than describe what happened.
   */
  isConfirmed: boolean;
};

function quantityOf(booking: AttendanceBookingLike): number {
  const parsed = Number(booking?.ticketQuantity);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function summariseEventAttendance(
  bookings: AttendanceBookingLike[] | null | undefined,
): EventAttendanceSummary {
  const empty: EventAttendanceSummary = {
    attended: 0,
    noShow: 0,
    unmarked: 0,
    booked: 0,
    isConfirmed: false,
  };
  if (!Array.isArray(bookings) || bookings.length === 0) return empty;

  return bookings.reduce<EventAttendanceSummary>((summary, booking) => {
    const quantity = quantityOf(booking);
    const status = isAttendanceStatus(booking?.attendanceStatus)
      ? booking.attendanceStatus
      : "unknown";

    return {
      attended: summary.attended + (status === "attended" ? quantity : 0),
      noShow: summary.noShow + (status === "no_show" ? quantity : 0),
      unmarked: summary.unmarked + (status === "unknown" ? quantity : 0),
      booked: summary.booked + quantity,
      isConfirmed: summary.isConfirmed || status !== "unknown",
    };
  }, empty);
}

export type TurnoutEventInput = {
  experienceId: string;
  /** Only a finished event can have a turnout. */
  hasFinished: boolean;
  attendance: EventAttendanceSummary;
};

export type TurnoutSummary = {
  /** Mean attendance across the events that were actually confirmed. */
  averageTurnout: number;
  /** How many events that average rests on. */
  eventsCounted: number;
  totalAttendees: number;
  /** Finished events the organiser never answered for. */
  eventsUnconfirmed: number;
};

/**
 * An organiser's average verified turnout.
 *
 * Events with no confirmation are left out of the average rather than counted
 * as zero: an organiser who forgot to mark a list should not have their record
 * dragged down by it, and a run of unmarked events should read as "not enough
 * to say" rather than as a bad turnout.
 *
 * Returns null when nothing has been confirmed yet — a caller must show no
 * figure at all rather than a zero that looks like a measurement.
 */
export function calculateAverageTurnout(
  events: TurnoutEventInput[] | null | undefined,
  options: { excludeExperienceId?: string | null } = {},
): TurnoutSummary | null {
  if (!Array.isArray(events)) return null;

  const finished = events.filter((event) =>
    event?.hasFinished && event.experienceId !== options.excludeExperienceId);
  const confirmed = finished.filter((event) => event.attendance?.isConfirmed);

  if (confirmed.length === 0) return null;

  const totalAttendees = confirmed.reduce((total, event) => total + event.attendance.attended, 0);

  return {
    averageTurnout: Math.round((totalAttendees / confirmed.length) * 10) / 10,
    eventsCounted: confirmed.length,
    totalAttendees,
    eventsUnconfirmed: finished.length - confirmed.length,
  };
}

/** One line for a proposal or a profile, or null when there is nothing to claim. */
export function formatTurnoutClaim(summary: TurnoutSummary | null | undefined): string | null {
  if (!summary || summary.eventsCounted === 0) return null;

  const events = summary.eventsCounted === 1 ? "event" : "events";
  return `Averages ${summary.averageTurnout} people per event, `
    + `verified across ${summary.eventsCounted} completed ${events}.`;
}

/**
 * How much weight the figure carries.
 *
 * One confirmed event is a data point, not a track record, and a venue reading
 * a proposal deserves to see the difference.
 */
export function getTurnoutConfidence(
  summary: TurnoutSummary | null | undefined,
): "none" | "provisional" | "established" {
  if (!summary || summary.eventsCounted === 0) return "none";
  return summary.eventsCounted >= 3 ? "established" : "provisional";
}
