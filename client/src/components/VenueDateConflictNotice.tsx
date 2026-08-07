import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CalendarCheck } from "lucide-react";

type Conflict = { startDate: string; endDate: string; source: string; notes: string | null };
type ConflictResponse = { available: boolean; conflicts: Conflict[] };

function formatRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return start.getTime() === end.getTime()
    ? start.toLocaleDateString(undefined, opts)
    : `${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${end.toLocaleDateString(undefined, opts)}`;
}

/** Where a block came from, in words a creator can act on. */
function describeSource(source: string): string {
  switch (source) {
    case "ical_import": return "booked on the venue's own calendar";
    case "handshake": return "already agreed with another creator here";
    case "google_sync": return "blocked in the venue's Google Calendar";
    default: return "blocked by the venue";
  }
}

/**
 * Whether the chosen venue is actually free on the chosen dates.
 *
 * The venue's imported calendars are the authority here — a date sold on
 * Airbnb this morning is blocked here by the next sync. Telling the creator
 * now costs them a click; finding out at handshake time costs them the plan.
 */
export function VenueDateConflictNotice({
  venueId,
  startDate,
  endDate,
}: {
  venueId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const enabled = !!venueId && !!startDate;

  const { data } = useQuery<ConflictResponse>({
    queryKey: ["/api/venues", venueId, "date-conflicts", startDate, endDate],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: String(startDate) });
      if (endDate) params.set("endDate", String(endDate));
      const res = await apiRequest("GET", `/api/venues/${venueId}/date-conflicts?${params.toString()}`);
      return res.json();
    },
  });

  if (!enabled || !data) return null;

  if (data.available) {
    return (
      <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30" data-testid="venue-dates-available">
        <CalendarCheck className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800 dark:text-green-200">
          These dates are free on the venue's calendar.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" data-testid="venue-dates-conflict">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>The venue is not free on these dates</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1">
          {data.conflicts.map((conflict, index) => (
            <li key={index} data-testid={`venue-date-conflict-${index}`}>
              {formatRange(conflict.startDate, conflict.endDate)} — {describeSource(conflict.source)}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Pick different dates, or a different venue. You won't be able to send a handshake for these.
        </p>
      </AlertDescription>
    </Alert>
  );
}
