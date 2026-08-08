import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CalendarCheck } from "lucide-react";
import { useVenueDateConflicts, type VenueDateConflict } from "@/hooks/useVenueDateConflicts";

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
 * Shown on both the Dates step and the Venue step, because either one can be
 * the thing that just changed. A creator who picks dates first and a venue
 * second must hear about the clash on the venue screen, not at submit.
 */
export function VenueDateConflictNotice({
  venueId,
  startDate,
  endDate,
  /** Where to send them to fix it. The screen they are not currently on. */
  resolution = "dates",
}: {
  venueId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  resolution?: "dates" | "venue";
}) {
  const { hasConflict, conflicts, isIdle, isError } = useVenueDateConflicts(venueId, startDate, endDate);

  if (isIdle || isError) return null;

  if (!hasConflict) {
    // Only reassure once the answer is actually "yes, free".
    if (!conflicts) return null;
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
      <AlertTitle>This venue is booked on your selected dates</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1">
          {conflicts.map((conflict: VenueDateConflict, index: number) => (
            <li key={index} data-testid={`venue-date-conflict-${index}`}>
              {formatRange(conflict.startDate, conflict.endDate)} — {describeSource(conflict.source)}
            </li>
          ))}
        </ul>
        <p className="mt-2 font-medium">
          {resolution === "dates"
            ? "Go back to the Dates step to change your dates, or choose a different venue."
            : "Choose a different venue, or go back to the Dates step to change your dates."}
        </p>
        <p className="mt-1">You won't be able to continue until this is resolved.</p>
      </AlertDescription>
    </Alert>
  );
}
