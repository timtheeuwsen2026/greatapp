import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MONEY_STATE_HINT,
  MONEY_STATE_LABEL,
  type OrganiserEventMoney,
  type OrganiserMoney,
} from "@shared/organiserMoney";
import { euro } from "@shared/venueDealCard";

/**
 * The organiser's numbers (Tim, 27 Nov, point 5), from one source:
 * GET /api/creator/money (@shared/organiserMoney). Overview shows only the
 * main numbers; Money shows the split; the Orders page shows the same split
 * per event. Nothing here computes money on its own.
 */
export function useOrganiserMoney(enabled = true) {
  return useQuery<OrganiserMoney>({
    queryKey: ["/api/creator/money"],
    enabled,
    refetchInterval: 30_000,
  });
}

function Stat({ label, value, hint, testId, strong }: { label: string; value: string; hint?: string; testId: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${strong ? "border-transparent bg-primary text-white" : "bg-white dark:bg-gray-900"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${strong ? "text-white/80" : "text-gray-500"}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${strong ? "text-white" : "text-gray-900 dark:text-white"}`} data-testid={testId}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${strong ? "text-white/80" : "text-gray-500"}`}>{hint}</p>}
    </div>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Overview: Confirmed, Held, your expected share, upcoming events, people coming. */
export function OrganiserOverviewNumbers() {
  const { data, isLoading } = useOrganiserMoney();
  if (isLoading || !data) {
    return <p className="text-sm text-gray-500">Loading your numbers…</p>;
  }
  return (
    <div className="space-y-2" data-testid="organiser-overview-numbers">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label={MONEY_STATE_LABEL.confirmed}
          value={euro(data.confirmed.revenue)}
          hint={`${plural(data.confirmed.bookings, "booking", "bookings")} · ${MONEY_STATE_HINT.confirmed}`}
          testId="overview-confirmed"
        />
        <Stat
          label={MONEY_STATE_LABEL.held}
          value={euro(data.held.revenue)}
          hint={`${plural(data.held.bookings, "booking", "bookings")} · Paid, waiting for the minimum.`}
          testId="overview-held"
        />
        <Stat
          label="Your expected share"
          value={euro(data.expectedShare)}
          hint="Of confirmed and held, after fee, venue and partners. See Money."
          testId="overview-expected-share"
          strong
        />
        <Stat
          label="Upcoming events"
          value={String(data.upcomingEvents)}
          hint="Live events still to come"
          testId="overview-upcoming-events"
        />
        <Stat
          label="People coming"
          value={String(data.peopleComing)}
          hint="Booked on your upcoming events"
          testId="overview-people-coming"
        />
      </div>
      {data.testBookings > 0 && (
        <p className="text-xs text-gray-500" data-testid="overview-test-note">
          {plural(data.testBookings, "test booking is", "test bookings are")} not counted: bookings by test accounts are never paid out.
        </p>
      )}
    </div>
  );
}

function SplitRows({ title, split, hint }: { title: string; split: OrganiserMoney["confirmed"]; hint: string }) {
  const feePct = split.ticketSales > 0 ? Math.round((split.platformFee / split.ticketSales) * 1000) / 10 : null;
  return (
    <div className="space-y-2 text-sm">
      <div>
        <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      <div className="flex justify-between"><span>Revenue</span><span className="font-medium">{euro(split.revenue)}</span></div>
      <div className="flex justify-between text-xs text-gray-500"><span>Tickets {euro(split.ticketSales)} · add-ons {euro(split.addonSales)}</span></div>
      <div className="flex justify-between">
        <span>Platform fee{feePct !== null ? ` (${feePct}% of tickets)` : ""}</span>
        <span className="font-medium">−{euro(split.platformFee)}</span>
      </div>
      <div className="flex justify-between"><span>Venue share</span><span className="font-medium">−{euro(split.venueShare)}</span></div>
      <div className="flex justify-between"><span>Partner commission</span><span className="font-medium">−{euro(split.partnerCommission)}</span></div>
      <hr />
      <div className="flex justify-between font-semibold"><span>Your share</span><span className="text-primary">{euro(split.yourShare)}</span></div>
    </div>
  );
}

/** Money: the split of confirmed and held money, then every event. */
export function OrganiserMoneyBreakdown() {
  const { data, isLoading } = useOrganiserMoney();
  return (
    <Card data-testid="organiser-money-breakdown">
      <CardHeader>
        <CardTitle>Your money</CardTitle>
        <p className="text-sm text-gray-500">The same numbers as Overview, your events and their Orders.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading || !data ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <SplitRows title={MONEY_STATE_LABEL.confirmed} split={data.confirmed} hint={MONEY_STATE_HINT.confirmed} />
              <SplitRows title={MONEY_STATE_LABEL.held} split={data.held} hint={MONEY_STATE_HINT.held} />
            </div>
            <EventMoneyTable events={data.events} />
            {data.testBookings > 0 && (
              <p className="text-xs text-gray-500">
                {plural(data.testBookings, "test booking is", "test bookings are")} not counted: bookings by test accounts are never paid out.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const STATE_BADGE: Record<OrganiserEventMoney["state"], string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  held: "bg-amber-100 text-amber-900",
  cancelled: "bg-gray-100 text-gray-600",
};

function EventMoneyTable({ events }: { events: OrganiserEventMoney[] }) {
  const shown = events.filter((event) => event.revenue > 0 || event.bookings > 0);
  if (shown.length === 0) return <p className="text-sm text-gray-500">No paid bookings yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-gray-500">
          <tr className="border-b">
            <th className="py-2 pr-3 font-medium">Event</th>
            <th className="py-2 pr-3 font-medium">State</th>
            <th className="py-2 pr-3 text-right font-medium">Revenue</th>
            <th className="py-2 pr-3 text-right font-medium">Platform fee</th>
            <th className="py-2 pr-3 text-right font-medium">Venue</th>
            <th className="py-2 pr-3 text-right font-medium">Partners</th>
            <th className="py-2 text-right font-medium">Your share</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((event) => (
            <tr key={event.experienceId} className="border-b" data-testid={`money-event-${event.experienceId}`}>
              <td className="py-2 pr-3">
                <Link href={`/dashboard/events/${event.experienceId}/orders`} className="font-medium text-gray-900 hover:text-primary dark:text-white">
                  {event.title}
                </Link>
              </td>
              <td className="py-2 pr-3"><Badge className={STATE_BADGE[event.state]}>{MONEY_STATE_LABEL[event.state]}</Badge></td>
              <td className="py-2 pr-3 text-right">{euro(event.revenue)}</td>
              <td className="py-2 pr-3 text-right">−{euro(event.platformFee)}</td>
              <td className="py-2 pr-3 text-right">−{euro(event.venueShare)}</td>
              <td className="py-2 pr-3 text-right">−{euro(event.partnerCommission)}</td>
              <td className="py-2 text-right font-semibold">{euro(event.yourShare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The add-ons line on an event card: "Coffee × 1 · Juice × 2", from the same source. */
export function EventCardAddons({ experienceId }: { experienceId: string }) {
  const { data } = useOrganiserMoney();
  const event = data?.events.find((row) => row.experienceId === experienceId);
  if (!event || event.addons.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-gray-600 dark:text-gray-300" data-testid={`event-card-addons-${experienceId}`}>
      <span className="font-medium">Add-ons:</span>{" "}
      {event.addons.map((addon) => `${addon.name} × ${addon.quantity}`).join(" · ")}
    </p>
  );
}
