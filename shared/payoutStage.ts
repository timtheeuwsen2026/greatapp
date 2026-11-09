// What venues, organisers and partners are told about their money for an
// event (Tim, Nov 2026): coming, secured, or paid, each with a date.
//
// - coming: the event has not happened yet, or its minimum group is still
//   forming, so the money can still go back to buyers.
// - secured: the event is on (group reached, or no minimum) and has happened;
//   the payout is scheduled, with its date.
// - paid: the payout has been sent, with the day it was sent.

export type PayoutStage = "coming" | "secured" | "paid";

export type PayoutStageInfo = { stage: PayoutStage; date: string | null; label: string };

export type PayoutStageInput = {
  eventEnd?: Date | string | null;
  requireMinimumParticipants?: boolean | null;
  mvgStatus?: string | null;
  payoutStatus?: string | null;
  scheduledFor?: Date | string | null;
  processedAt?: Date | string | null;
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shortDay(value: string | null): string {
  return value
    ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" })
    : "";
}

export function eventPayoutStage(input: PayoutStageInput, now: Date = new Date()): PayoutStageInfo {
  if (input.payoutStatus === "completed") {
    const date = iso(input.processedAt);
    return { stage: "paid", date, label: date ? `Paid on ${shortDay(date)}` : "Paid" };
  }
  const groupForming = !!input.requireMinimumParticipants && input.mvgStatus !== "met";
  const end = iso(input.eventEnd);
  const happened = !!end && new Date(end).getTime() <= now.getTime();
  if (groupForming || !happened) {
    return {
      stage: "coming",
      date: end,
      label: groupForming ? "Coming once the group is reached" : `Coming after the event${end ? ` (${shortDay(end)})` : ""}`,
    };
  }
  const date = iso(input.scheduledFor) ?? (end ? new Date(new Date(end).getTime() + 24 * 60 * 60 * 1000).toISOString() : null);
  return { stage: "secured", date, label: date ? `Secured, paid out on ${shortDay(date)}` : "Secured" };
}

/** A partner's commission status read the same way. */
export function commissionStage(status: string | null | undefined, paidAt?: Date | string | null): PayoutStageInfo | null {
  if (status === "paid") {
    const date = iso(paidAt);
    return { stage: "paid", date, label: date ? `Paid on ${shortDay(date)}` : "Paid" };
  }
  if (status === "locked") return { stage: "secured", date: null, label: "Secured" };
  if (status === "estimated") return { stage: "coming", date: null, label: "Coming" };
  return null;
}
