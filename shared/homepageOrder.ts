import { hasExperiencePassed } from "./eventLifecycle";

type HappeningEvent = {
  lifecycleStatus?: string | null;
  currentParticipants?: number | string | null;
  maxParticipants?: number | string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
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

/**
 * The homepage's two rows: what can still be joined, and what already proved
 * itself.
 *
 * The top row used to be chosen on status alone, and a finished event keeps
 * the status it finished with. So every past event stayed in "Happening now",
 * and because that row is ordered by signups, last month's full runs sat in
 * front of next week's new ones — six finished events ahead of the two a
 * visitor could actually join. The same six then appeared again in the row
 * below. An event that has taken place belongs in the second row only.
 *
 * "Taken place" is the end of its last day, the same boundary that closes
 * booking, so an event stays in the top row for as long as it can be joined.
 */
export function splitHomepageRows<T extends HappeningEvent>(
  events: T[] | null | undefined,
  now: Date = new Date(),
): { happening: T[]; proven: T[] } {
  const list = Array.isArray(events) ? events : [];

  const happening = list
    .filter((event) => event.lifecycleStatus === "forming" || event.lifecycleStatus === "confirmed")
    .filter((event) => !hasExperiencePassed(event, now))
    .sort(compareHappeningEvents);

  // What already filled up or already happened, ranked by how many came. An
  // event nobody joined proves nothing and is left out.
  const proven = list
    .filter((event) => {
      const joined = Number(event.currentParticipants) || 0;
      const capacity = Number(event.maxParticipants) || 0;
      const soldOut = capacity > 0 && joined >= capacity;
      return joined > 0
        && (hasExperiencePassed(event, now) || soldOut || event.lifecycleStatus === "completed");
    })
    .sort((a, b) => (Number(b.currentParticipants) || 0) - (Number(a.currentParticipants) || 0));

  return { happening, proven };
}
