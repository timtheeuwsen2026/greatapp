import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { OrganiserShell } from "@/components/dashboard/OrganiserShell";
import { useAuth } from "@/hooks/useAuth";
import { orderStatusLabel, PARTNER_COMMISSION_LABEL, type PartnerEventOrders, type PartnerCommissionState } from "@shared/eventOrders";
import { euro } from "@shared/venueDealCard";

type PartnerOrders = {
  events: Array<PartnerEventOrders & {
    event: { id: string; slug: string | null; title: string; when: string; city: string | null; phase: string | null };
    payoutLabel: string | null;
  }>;
  totals: { orders: number; coming: number; secured: number; paid: number };
};

const STATE_CLASS: Record<PartnerCommissionState, string> = {
  coming: "bg-primary/10 text-primary",
  secured: "bg-indigo-100 text-indigo-800",
  paid: "bg-emerald-100 text-emerald-800",
  not_paid: "bg-gray-100 text-gray-500",
};

const PHASE_LABEL: Record<string, string> = { upcoming: "Upcoming", happening: "Happening now", ended: "Ended", cancelled: "Cancelled" };

function Tile({ label, value, sub, testId }: { label: string; value: string; sub: string; testId: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 dark:bg-gray-900">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white" data-testid={testId}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

/**
 * "As partner" (Tim, 66.35 with 66.22h and 66.23e): the bookings this account
 * brought in through its own link, per event, with its commission and when it
 * is paid. Same words as everywhere: Paid out, Secured, Coming. Any account
 * can be a partner on an event; this shows only its own bookings.
 */
export default function DashboardAsPartner() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data, isLoading } = useQuery<PartnerOrders>({ queryKey: ["/api/partner/orders"], enabled: isAuthenticated });

  return (
    <OrganiserShell>
      <div className="space-y-5" data-testid="dashboard-as-partner">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">As partner</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bookings that came in through your own link, with your commission. Commission is paid with the event's payout, 24 hours after it ends.
          </p>
        </div>

        {authLoading || isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !data || data.events.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-gray-500">
            Nobody has booked through your link yet. Find an event to promote on{" "}
            <Link href="/promoter" className="text-primary underline">Promote</Link>.
          </CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Bookings" value={String(data.totals.orders)} sub="Through your link" testId="partner-total-orders" />
              <Tile label="Paid out" value={euro(data.totals.paid)} sub="Sent to your Stripe account" testId="partner-total-paid" />
              <Tile label="Secured" value={euro(data.totals.secured)} sub="Paid with the next payout" testId="partner-total-secured" />
              <Tile label="Coming" value={euro(data.totals.coming)} sub="Once the event goes ahead" testId="partner-total-coming" />
            </div>

            {data.events.map((entry) => (
              <Card key={entry.experienceId} className="overflow-hidden" data-testid={`partner-event-${entry.experienceId}`}>
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/experience/${entry.event.slug || entry.event.id}`} className="font-semibold text-gray-900 hover:text-primary dark:text-white">
                          {entry.event.title}
                        </Link>
                        {entry.event.phase && <Badge variant="outline">{PHASE_LABEL[entry.event.phase] || entry.event.phase}</Badge>}
                      </div>
                      <p className="text-sm text-gray-500">{[entry.event.when, entry.event.city].filter(Boolean).join(" · ")}</p>
                      {entry.payoutLabel && <p className="mt-1 text-xs text-gray-500">{entry.payoutLabel}</p>}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>{entry.totals.orders}</strong> {entry.totals.orders === 1 ? "booking" : "bookings"} ·{" "}
                      <strong>{euro(entry.totals.paid + entry.totals.secured + entry.totals.coming)}</strong> commission
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="text-left text-xs text-gray-500">
                        <tr className="border-b">
                          <th className="px-4 py-2 font-medium">Person</th>
                          <th className="px-4 py-2 font-medium">Ticket</th>
                          <th className="px-4 py-2 font-medium">Paid</th>
                          <th className="px-4 py-2 font-medium">Booking</th>
                          <th className="px-4 py-2 font-medium">Your commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.orders.map((row) => {
                          const standing = row.status === "paid" || row.status === "reserved";
                          return (
                            <tr key={row.bookingId} className={`border-b last:border-b-0 ${standing ? "" : "text-gray-400"}`} data-testid={`partner-order-${row.bookingId}`}>
                              <td className="px-4 py-2 font-semibold">{row.person}</td>
                              <td className="px-4 py-2">{row.ticketName}{row.tickets > 1 ? ` × ${row.tickets}` : ""}</td>
                              <td className="px-4 py-2">{euro(row.amount)}</td>
                              <td className="px-4 py-2">{row.status === "paid" ? "Booked" : orderStatusLabel(row.status)}</td>
                              <td className="px-4 py-2">
                                <span className="mr-2">{euro(row.commission)}</span>
                                <Badge className={STATE_CLASS[row.commissionState]}>{PARTNER_COMMISSION_LABEL[row.commissionState]}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </OrganiserShell>
  );
}
