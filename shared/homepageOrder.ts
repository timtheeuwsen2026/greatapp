type HappeningEvent = {
  lifecycleStatus?: string;
  currentParticipants?: number | string | null;
  startDate?: string | Date | null;
  fundingDeadline?: string | Date | null;
};

/** Confirmed events lead, then attendance; sooner dates break ties. */
export function compareHappeningEvents(a: HappeningEvent, b: HappeningEvent): number {
  const confirmed = Number(b.lifecycleStatus === "confirmed") - Number(a.lifecycleStatus === "confirmed");
  if (confirmed) return confirmed;
  const attendance = (Number(b.currentParticipants) || 0) - (Number(a.currentParticipants) || 0);
  if (attendance) return attendance;
  const date = (event: HappeningEvent) => {
    const timestamp = new Date(event.startDate || event.fundingDeadline || "").getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
  };
  return date(a) - date(b);
}
