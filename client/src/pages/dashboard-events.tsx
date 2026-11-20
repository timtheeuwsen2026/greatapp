import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { OrganiserShell } from "@/components/dashboard/OrganiserShell";
import { useAuth } from "@/hooks/useAuth";
import { eventPhase, formatEventWhen } from "@shared/eventTime";

type OrganiserEvent = {
  id: string;
  title: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  city?: string | null;
  maxParticipants?: number | null;
  participantCount?: number | null;
  finalParticipantCount?: number | null;
};

function stateOf(event: OrganiserEvent): { label: string; className: string } {
  if (event.status === "cancelled") return { label: "Cancelled", className: "bg-gray-100 text-gray-600" };
  if (event.status === "draft" || event.status === "pending_approval" || event.status === "pending") {
    return { label: "Not live yet", className: "bg-amber-100 text-amber-900" };
  }
  const phase = eventPhase(event as any);
  if (phase === "ended") return { label: "Ended", className: "bg-gray-100 text-gray-700" };
  if (phase === "happening") return { label: "Happening now", className: "bg-amber-100 text-amber-900" };
  return { label: "Upcoming", className: "bg-emerald-100 text-emerald-800" };
}

/**
 * "My events" in the new dashboard (Tim, 66.35, point 60): every event of the
 * organiser, soonest first, each opening on its Orders (board D2).
 */
export default function DashboardEvents() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: events = [], isLoading } = useQuery<OrganiserEvent[]>({
    queryKey: ["/api/creator/experiences"],
    enabled: isAuthenticated,
  });

  const sorted = [...events].sort((a, b) => {
    const rank = (event: OrganiserEvent) => (event.status === "cancelled" ? 2 : eventPhase(event as any) === "ended" ? 1 : 0);
    const time = (event: OrganiserEvent) => new Date(event.startDate || 0).getTime();
    return rank(a) - rank(b) || (rank(a) === 0 ? time(a) - time(b) : time(b) - time(a));
  });

  return (
    <OrganiserShell>
      <div className="space-y-4" data-testid="dashboard-events">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My events</h1>
        {authLoading || isLoading ? (
          <p className="text-sm text-gray-500">Loading your events…</p>
        ) : !isAuthenticated ? (
          <p className="text-sm text-gray-600">Log in to see your events.</p>
        ) : sorted.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-gray-500">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            No events yet. <Link href="/create-experience" className="text-primary underline">Create your first event</Link>.
          </CardContent></Card>
        ) : (
          <ul className="space-y-3">
            {sorted.map((event) => {
              const state = stateOf(event);
              const booked = event.finalParticipantCount ?? event.participantCount ?? 0;
              return (
                <li key={event.id}>
                  <Link
                    href={`/dashboard/events/${event.id}/orders`}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 transition-colors hover:border-primary/40 dark:bg-gray-900"
                    data-testid={`dashboard-event-${event.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{event.title}</span>
                        <Badge className={state.className}>{state.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {[formatEventWhen(event as any, { weekday: true }) || "Date not set", event.city].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        <strong>{booked}</strong>{event.maxParticipants ? ` of ${event.maxParticipants}` : ""} booked
                      </span>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OrganiserShell>
  );
}
