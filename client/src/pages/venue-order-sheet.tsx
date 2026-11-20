import { useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Printer, ShoppingBag, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  eventOrdersCsv,
  orderStatusLabel,
  type EventOrderRow,
  type EventOrderTotals,
} from "@shared/eventOrders";
import { euro } from "@shared/venueDealCard";

type OrderSheet = {
  event: { id: string; slug: string | null; title: string; when: string; venue: string | null; location: string | null; capacity: number | null; status: string };
  orders: EventOrderRow[];
  totals: EventOrderTotals;
};

const STATUS_CLASS: Record<EventOrderRow["status"], string> = {
  paid: "bg-emerald-100 text-emerald-800",
  reserved: "bg-amber-100 text-amber-900",
  cancelled: "bg-gray-100 text-gray-500",
  refunded: "bg-gray-100 text-gray-500",
};

/**
 * The venue's order sheet for one event (Tim, 58.2): who ordered what, with a
 * "handed out" tick that works on the day, plus print and export. It refreshes
 * every 30 seconds, so a late order shows up at the counter without a reload.
 */
export default function VenueOrderSheet() {
  const { experienceId } = useParams<{ experienceId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = [`/api/venue/events/${experienceId}/orders`];
  const { data, isLoading, error } = useQuery<OrderSheet>({ queryKey, refetchInterval: 30_000 });

  const tick = useMutation({
    mutationFn: async ({ bookingId, handedOut }: { bookingId: string; handedOut: boolean }) =>
      apiRequest("POST", `/api/venue/orders/${bookingId}/handed-out`, { handedOut }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (err: any) => toast({ title: "Could not update", description: err?.message || "Try again", variant: "destructive" }),
  });

  const withAddons = useMemo(
    () => (data?.orders || []).filter((row) => row.addons.length > 0 && (row.status === "paid" || row.status === "reserved")),
    [data],
  );

  const exportCsv = () => {
    if (!data) return;
    const blob = new Blob([eventOrdersCsv(data.orders, "venue")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders-${(data.event.slug || data.event.id).slice(0, 60)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="py-16 text-center text-gray-500">Loading the order sheet…</div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-gray-700">This order sheet is not available to your account.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/venue-dashboard?tab=sales")}>Back to Sales</Button>
      </div>
    );
  }

  const { event, orders, totals } = data;
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6" data-testid="venue-order-sheet">
      {/* Print only the sheet: no menus, no buttons. */}
      <style>{`@media print { nav, header, footer, .no-print { display: none !important; } body { background: white; } }`}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/venue-dashboard?tab=sales")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Sales
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-orders">
            <Printer className="mr-1 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-orders">
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Order sheet: {event.title}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {[event.when, event.venue, event.location].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-3">
          <p className="flex items-center gap-1 text-xs text-gray-500"><Users className="h-3.5 w-3.5" /> Expected</p>
          <p className="text-2xl font-bold" data-testid="order-sheet-expected">
            {totals.tickets}{event.capacity ? <span className="text-sm font-normal text-gray-500"> / {event.capacity}</span> : null}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-gray-500">Orders</p>
          <p className="text-2xl font-bold">{totals.orders}</p>
        </CardContent></Card>
        {totals.addons.map((addon) => (
          <Card key={addon.name}><CardContent className="p-3">
            <p className="flex items-center gap-1 text-xs text-gray-500"><ShoppingBag className="h-3.5 w-3.5" /> {addon.name}</p>
            <p className="text-2xl font-bold" data-testid={`order-sheet-addon-${addon.name}`}>
              {addon.handedOut} <span className="text-sm font-normal text-gray-500">of {addon.quantity} handed out</span>
            </p>
            {addon.venueAmount > 0 && <p className="text-xs text-gray-500">Yours (paid): {euro(addon.venueAmount)}</p>}
          </CardContent></Card>
        ))}
      </div>

      {orders.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-gray-500">No orders yet. New orders appear here by themselves.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Add-ons</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Handed out</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((row) => {
                const live = row.status === "paid" || row.status === "reserved";
                return (
                  <tr key={row.bookingId} className={`border-t ${live ? "" : "text-gray-400 line-through decoration-gray-300"}`} data-testid={`order-row-${row.bookingId}`}>
                    <td className="px-3 py-2 font-medium">{row.person}{row.checkedIn && <span className="ml-1 text-xs font-normal text-emerald-700">checked in</span>}</td>
                    <td className="px-3 py-2">{row.ticketName}{row.tickets > 1 ? ` × ${row.tickets}` : ""}</td>
                    <td className="px-3 py-2">{row.addons.length ? row.addons.map((addon) => `${addon.name} × ${addon.quantity}`).join(", ") : "—"}</td>
                    <td className="px-3 py-2 text-right">{euro(row.amount)}</td>
                    <td className="px-3 py-2"><Badge className={STATUS_CLASS[row.status]}>{orderStatusLabel(row.status)}</Badge></td>
                    <td className="px-3 py-2">
                      {row.addons.length > 0 && live ? (
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            checked={!!row.handedOutAt}
                            disabled={tick.isPending}
                            onChange={(e) => tick.mutate({ bookingId: row.bookingId, handedOut: e.target.checked })}
                            data-testid={`checkbox-handed-out-${row.bookingId}`}
                          />
                          <span className="text-xs text-gray-500">{row.handedOutAt ? "Done" : ""}</span>
                        </label>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="no-print text-xs text-gray-500">
        {withAddons.length} of {totals.orders} orders include add-ons. Updates every 30 seconds. Cancelled and refunded orders are crossed out and not counted.
      </p>
    </div>
  );
}
