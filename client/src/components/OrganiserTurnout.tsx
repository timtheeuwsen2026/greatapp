import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  formatTurnoutClaim,
  getTurnoutConfidence,
  type TurnoutSummary,
} from "@shared/attendance";

/**
 * An organiser's average verified turnout.
 *
 * A blank percentage field gives an organiser nothing to negotiate with. "I
 * average 45 people per event" does — and it gives them a reason to keep the
 * number growing.
 *
 * The figure only ever comes from attendance confirmed on events that have
 * already finished. Never RSVPs, never ticket sales, and never anything about
 * the event being proposed — otherwise anyone could claim a number by listing
 * something with a large capacity, and the claim would be worth nothing to the
 * venue reading it.
 */
export default function OrganiserTurnout({
  creatorId,
  excludeExperienceId,
  className = "",
}: {
  creatorId?: string | null;
  /** The event under discussion, kept out of its own evidence. */
  excludeExperienceId?: string | null;
  className?: string;
}) {
  const query = excludeExperienceId ? `?excludeExperienceId=${excludeExperienceId}` : "";
  const { data } = useQuery<TurnoutSummary>({
    queryKey: ["/api/creators", creatorId, "turnout", excludeExperienceId ?? ""],
    queryFn: async () => {
      const res = await fetch(`/api/creators/${creatorId}/turnout${query}`);
      if (!res.ok) throw new Error("Failed to load turnout");
      return res.json();
    },
    enabled: !!creatorId,
  });

  const claim = formatTurnoutClaim(data);
  // Nothing confirmed yet means no figure at all. A zero here would read as a
  // measurement of an empty room rather than as an absence of evidence.
  if (!claim) return null;

  const confidence = getTurnoutConfidence(data);

  return (
    <div
      className={`rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40 ${className}`}
      data-testid="organiser-turnout"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
          <Users className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Averages {data!.averageTurnout} people per event
          </p>
          <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-200">
            Verified attendance across {data!.eventsCounted}{" "}
            completed {data!.eventsCounted === 1 ? "event" : "events"}
            {/* One event is a data point, not a track record, and a venue
                reading a proposal deserves to see the difference. */}
            {confidence === "provisional" ? " — early days, but real numbers." : "."}
          </p>
        </div>
      </div>
    </div>
  );
}
