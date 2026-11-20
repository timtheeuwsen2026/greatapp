import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type VenueStatus = Record<string, { status: "waiting" | "agreed"; venueName: string | null }>;

/**
 * "Waiting for venue" (Tim, 59.4): an event can sell before its venue has
 * accepted. Until Tim decides whether that is allowed, the event page and the
 * organiser's list say plainly that the venue has not agreed yet.
 */
export function WaitingForVenueBadge({ experienceId, withName = false, className = "" }: { experienceId: string; withName?: boolean; className?: string }) {
  const { data } = useQuery<VenueStatus>({
    queryKey: [`/api/venue-status?ids=${experienceId}`],
    enabled: !!experienceId,
    staleTime: 60_000,
  });
  const entry = data?.[experienceId];
  if (entry?.status !== "waiting") return null;
  return (
    <Badge className={`bg-amber-100 text-amber-900 text-xs ${className}`} data-testid={`badge-waiting-for-venue-${experienceId}`}>
      <Clock className="mr-1 h-3 w-3" />
      Waiting for venue{withName && entry.venueName ? `: ${entry.venueName}` : ""}
    </Badge>
  );
}
