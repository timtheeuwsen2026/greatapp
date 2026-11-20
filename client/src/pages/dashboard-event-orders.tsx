import { useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { OrganiserShell } from "@/components/dashboard/OrganiserShell";
import { apiRequest, readableError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { eventOrdersCsv, type EventOrderRow, type EventOrderTotals } from "@shared/eventOrders";
import { euro, type VenueDealAddon } from "@shared/venueDealCard";

type OrganiserOrders = {
  event: { id: string; slug: string | null; title: string; when: string; venue: string | null; location: string | null; capacity: number | null; status: string };
  orders: EventOrderRow[];
  totals: EventOrderTotals;
  startsAt: string;
  addonPrices: VenueDealAddon[];
  money: { revenue: number; platformFee: number; venueShare: number; partnerCommission: number; yourShare: number };
  refunds: { count: number; amount: number };
  venue: { name: string | null; city: string | null; agreed: boolean; address: string | null; status: string | null; deal: string | null } | null;
  payout: { stage: string; date: string | null; label: string } | null;
};

// Board D2 says "Booked" for an order that stands.
const STATUS: Record<EventOrderRow["status"], { label: string; className: string }> = {
  paid: { label: "Booked", className: "bg-primary/10 text-primary" },
  reserved: { label: "Reserved", className: "bg-amber-100 text-amber-900" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500" },
  refunded: { label: "Refunded", className: "bg-gray-100 text-gray-500" },
};

function Tile({ label, value, sub, highlight, testId, title }: { label: string; value: string; sub?: string; highlight?: boolean; testId: string; title?: string }) {
  return (
    <div
      className={`rounded-xl border p-4 ${highlight ? "border-primary bg-primary text-white" : "bg-white dark:bg-gray-900"}`}
      title={title}
    >
      <p className={`text-xs font-semibold ${highlight ? "text-white/85" : "text-gray-600 dark:text-gray-400"}`}>{label}</p>
      <p className={`mt-1 truncate text-2xl font-bold ${highlight ? "text-white" : "text-gray-900 dark:text-white"}`} data-testid={testId}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${highlight ? "text-white/85" : "text-gray-500"}`}>{sub}</p>}
    </div>
  );
}

/**
 * The organiser's Orders of one event (Tim, 66.35, board D2): what sold, who
 * ordered what, the add-ons with the venue's part and your margin, the venue,
 * and your share. Cancelled and refunded orders are listed but never counted.
 */
export default function DashboardEventOrders() {
  const { experienceId } = useParams<{ experienceId: string }>();
  const { toast } = useToast();
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { data, isLoading, error } = useQuery<OrganiserOrders>({
    queryKey: [`/api/creator/experiences/${experienceId}/orders`],
    refetchInterval: 60_000,
  });

  const send = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/creator/experiences/${experienceId}/message-everyone`, { message })).json(),
    onSuccess: (result: any) => {
      setMessageOpen(false);
      setMessage("");
      toast({ title: "Message sent", description: result?.message });
    },
    onError: (err) => toast({ title: "Not sent", description: readableError(err), variant: "destructive" }),
  });

  const exportCsv = () => {
    if (!data) return;
    const blob = new Blob([eventOrdersCsv(data.orders, "organiser")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders-${(data.event.slug || data.event.id).slice(0, 60)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || error || !data) {
    return (
      <OrganiserShell>
        <p className="text-sm text-gray-500">{isLoading ? "Loading the orders…" : "These orders are not available to your account."}</p>
      </OrganiserShell>
    );
  }

  const live = data.orders.filter((row) => row.status === "paid" || row.status === "reserved");
  const paidOrders = live.filter((row) => row.status === "paid");
  const spotsLeft = data.event.capacity ? Math.max(0, data.event.capacity - data.totals.tickets) : null;
  // Tim's 66.35 also asks for RSVPs (reserved, not paid yet) and check-ins.
  const reservedTickets = live.filter((row) => row.status === "reserved").reduce((sum, row) => sum + row.tickets, 0);
  const checkedInTickets = live.filter((row) => row.checkedIn).reduce((sum, row) => sum + row.tickets, 0);
  const bookedSub = [
    spotsLeft !== null ? `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left` : null,
    reservedTickets > 0 ? `${reservedTickets} reserved` : null,
    checkedInTickets > 0 ? `${checkedInTickets} checked in` : null,
  ].filter(Boolean).join(" · ");
  const addonsText = data.totals.addons.map((addon) => `${addon.name} × ${addon.quantity}`).join(", ");
  const price = (name: string) => data.addonPrices.find((addon) => addon.name.toLowerCase() === name.toLowerCase());
  const shareBreakdown = `Revenue ${euro(data.money.revenue)} − platform fee ${euro(data.money.platformFee)} − venue ${euro(data.money.venueShare)} − partner commission ${euro(data.money.partnerCommission)}`;

  return (
    <OrganiserShell>
      <div className="space-y-5" data-testid="organiser-orders">
        <div>
          <p className="text-sm">
            <Link href="/dashboard/events" className="font-medium text-primary hover:underline">My events</Link>
            <span className="mx-1 text-gray-400">›</span>
            <span className="font-medium text-primary">{data.event.title}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Orders</h1>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full" onClick={exportCsv} data-testid="button-export-orders">Export</Button>
              <Button className="rounded-full" onClick={() => setMessageOpen(true)} disabled={live.length === 0} data-testid="button-message-everyone">
                Message everyone
              </Button>
            </div>
          </div>
          {/* The event's own tabs (board D2). Orders is built; People and
              Details open the current pages for now. */}
          <div className="mt-3 flex gap-2 text-sm">
            <span className="rounded-full border-2 border-primary px-4 py-1 font-semibold text-primary">Orders</span>
            <Link href="/creator-dashboard?tab=community" className="rounded-full border px-4 py-1 text-gray-700 hover:border-primary/40">People</Link>
            <Link href={`/experience/${data.event.slug || data.event.id}`} className="rounded-full border px-4 py-1 text-gray-700 hover:border-primary/40">Details</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Booked" testId="orders-booked"
            value={`${data.totals.tickets}${data.event.capacity ? ` of ${data.event.capacity}` : ""}`}
            sub={bookedSub || undefined} />
          <Tile label="Add-ons to prepare" testId="orders-addons"
            value={addonsText || "None"}
            sub={data.venue?.name ? `At ${data.venue.name}` : undefined} />
          <Tile label="Revenue" testId="orders-revenue" value={euro(data.money.revenue)}
            sub={`${paidOrders.length} ${paidOrders.length === 1 ? "booking" : "bookings"}`} />
          <Tile label="Your share" testId="orders-your-share" value={euro(data.money.yourShare)} highlight
            sub={data.payout?.label ? `Tickets, fee and margin · ${data.payout.label}` : "Tickets, fee and margin"} title={shareBreakdown} />
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {data.orders.length === 0 ? (
                <p className="p-6 text-center text-sm text-gray-500">No orders yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-left text-xs text-gray-500">
                      <tr className="border-b">
                        <th className="px-4 py-3 font-medium">Person</th>
                        <th className="px-4 py-3 font-medium">Ticket</th>
                        <th className="px-4 py-3 font-medium">Add-ons</th>
                        <th className="px-4 py-3 font-medium">Paid</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((row) => {
                        const standing = row.status === "paid" || row.status === "reserved";
                        return (
                          <tr key={row.bookingId} className={`border-b ${standing ? "" : "text-gray-400"}`} data-testid={`organiser-order-${row.bookingId}`}>
                            <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white" title={row.email || undefined}>{row.person}</td>
                            <td className="px-4 py-3">{row.ticketName}{row.tickets > 1 ? ` × ${row.tickets}` : ""}</td>
                            <td className={`px-4 py-3 ${row.addons.length ? "" : "text-gray-400"}`}>
                              {row.addons.length ? row.addons.map((addon) => `${addon.name} × ${addon.quantity}`).join(", ") : "None"}
                            </td>
                            <td className="px-4 py-3">{euro(row.amount)}</td>
                            <td className="px-4 py-3">
                              <Badge className={STATUS[row.status].className}>{STATUS[row.status].label}</Badge>
                              {row.checkedIn && <span className="ml-2 text-xs text-emerald-700">checked in</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="px-4 py-3 font-semibold" colSpan={3}>Total</td>
                        <td className="px-4 py-3 font-semibold" colSpan={2} data-testid="orders-total">
                          {euro(paidOrders.reduce((sum, row) => sum + row.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {data.refunds.count > 0 && (
                <p className="border-t px-4 py-2 text-xs text-gray-500">
                  {data.refunds.count} cancelled or refunded {data.refunds.count === 1 ? "order is" : "orders are"} listed but not counted.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4 text-sm" data-testid="orders-addon-split">
                <p className="text-base font-semibold text-gray-900 dark:text-white">Add-ons</p>
                {data.totals.addons.length === 0 ? (
                  <p className="text-gray-500">No add-ons ordered yet.</p>
                ) : (
                  data.totals.addons.map((addon) => {
                    const unit = price(addon.name);
                    return (
                      <div key={addon.name} className="border-b pb-3">
                        <div className="flex justify-between gap-2">
                          <span><strong>{addon.name}</strong>, {addon.quantity} sold</span>
                          {unit && <strong>{euro(unit.unitPrice)} each</strong>}
                        </div>
                        <p className="mt-1 text-gray-600 dark:text-gray-400">
                          {unit ? <>To the venue {euro(unit.venueAmount)}. Your margin {euro(unit.organiserMargin)} </> : null}
                          (you receive {euro(addon.margin)} in total).
                        </p>
                      </div>
                    );
                  })
                )}
                <p className="text-gray-600 dark:text-gray-400">
                  <strong className="text-gray-900 dark:text-white">Orders stay open</strong> until the event starts
                  {data.startsAt ? ` (${data.startsAt})` : ""}. The venue sees new orders live and is mailed about every order after the 24-hour reminder.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 p-4 text-sm" data-testid="orders-venue">
                <p className="text-base font-semibold text-gray-900 dark:text-white">Venue</p>
                {data.venue ? (
                  <>
                    <p><strong>{data.venue.name || "Venue"}</strong>{data.venue.city ? `, ${data.venue.city}` : ""}</p>
                    {data.venue.status && (
                      <Badge className={data.venue.agreed ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-900 hover:bg-amber-100"}>
                        {data.venue.status}
                      </Badge>
                    )}
                    {data.venue.deal && <p className="text-gray-600 dark:text-gray-400">{data.venue.deal}</p>}
                    <p className="text-gray-600 dark:text-gray-400">
                      {data.venue.agreed ? "The venue sees this list and is mailed each day." : "Tickets are open. The venue sees this list and is mailed each day."}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-500">No venue on this event.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Message everyone who booked</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">
            They get it as an update on the event, a notice in the app and a mail. Cancelled and refunded bookings are left out.
          </p>
          <Textarea rows={5} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)}
            placeholder="For example: we meet at the entrance at 9:15, bring water." data-testid="input-message-everyone" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageOpen(false)}>Cancel</Button>
            <Button onClick={() => send.mutate()} disabled={!message.trim() || send.isPending} data-testid="button-send-message-everyone">
              {send.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganiserShell>
  );
}
