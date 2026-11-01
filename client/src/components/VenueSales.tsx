import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CheckCircle2, ShoppingBag, Users } from "lucide-react";
import type { VenueEventSales } from "@shared/venueSales";

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function eventDate(value: string | null): string {
  if (!value) return "Date to be set";
  return new Date(value).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

const TIMING_BADGE: Record<VenueEventSales["timing"], { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-emerald-100 text-emerald-800" },
  past: { label: "Past", className: "bg-gray-100 text-gray-700" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500" },
};

/**
 * What has sold for each event at this venue, live.
 *
 * Venues were asking the organiser for numbers a minute before the event. This
 * shows, per event, who to expect (paid tickets plus free RSVPs and held
 * cards), how many have checked in, and each add-on to prepare with what the
 * venue earns from it. It refreshes every minute, so it is right at the door.
 */
export default function VenueSales() {
  const [, navigate] = useLocation();
  const { data: events = [], isLoading } = useQuery<VenueEventSales[]>({
    queryKey: ["/api/venue/sales"],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center" data-testid="venue-sales-empty">
          <Calendar className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">No events at your venue yet</h3>
          <p className="text-gray-600 dark:text-gray-400">
            When an organiser books your space, you'll see here what has sold, live.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="venue-sales">
      {events.map((event) => {
        const badge = TIMING_BADGE[event.timing];
        const dimmed = event.timing === "cancelled";
        return (
          <Card key={event.experienceId} className={dimmed ? "opacity-70" : undefined} data-testid={`venue-sales-${event.experienceId}`}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{event.title}</h3>
                    <Badge className={badge.className}>{badge.label}</Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                    <Calendar className="h-4 w-4" />
                    {eventDate(event.startDate)}
                    {event.venueName && <span> · {event.venueName}</span>}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(`/experience/${event.slugOrId}`)}>
                  View event
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <p className="flex items-center gap-1 text-xs text-gray-500"><Users className="h-3.5 w-3.5" /> Expected</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white" data-testid={`venue-sales-expected-${event.experienceId}`}>
                    {event.expected}
                    {event.capacity ? <span className="text-sm font-normal text-gray-500"> / {event.capacity}</span> : null}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <p className="text-xs text-gray-500">Paid tickets</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{event.booked}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <p className="text-xs text-gray-500">RSVP / reserved</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{event.reserved}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <p className="flex items-center gap-1 text-xs text-gray-500"><CheckCircle2 className="h-3.5 w-3.5" /> Checked in</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{event.checkedIn}</p>
                </div>
              </div>

              {event.addons.length > 0 && (
                <div className="rounded-lg border p-3" data-testid={`venue-sales-addons-${event.experienceId}`}>
                  <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">
                    <ShoppingBag className="h-4 w-4" /> Add-ons to prepare
                  </p>
                  <ul className="space-y-1 text-sm">
                    {event.addons.map((addon) => (
                      <li key={addon.name} className="flex justify-between gap-3">
                        <span className="text-gray-700 dark:text-gray-300">{addon.name} × {addon.quantity}</span>
                        {addon.venueEarned > 0 && (
                          <span className="text-gray-500">{money(addon.venueEarned, event.currency)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {event.addonEarned > 0 && (
                    <p className="mt-2 border-t pt-2 text-sm font-medium text-gray-900 dark:text-white">
                      Yours from add-ons (paid): {money(event.addonEarned, event.currency)}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <p className="text-xs text-gray-500">Updates every minute. Cancelled and refunded bookings are not counted.</p>
    </div>
  );
}
