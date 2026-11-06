import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, readableError } from "@/lib/queryClient";
import { RefreshCw, Scale } from "lucide-react";

/**
 * Great vs Stripe, for admins.
 *
 * The payment check compares every booking with what Stripe really did with
 * its payment. What it could put right itself (a hold collected, a refund
 * recorded) is listed as fixed, so nothing changes silently; the rest stays
 * open here until it is sorted out.
 */

export type PaymentDifference = {
  id: string;
  kind: string;
  bookingId: string | null;
  experienceTitle: string | null;
  buyerEmail: string | null;
  stripePaymentIntentId: string | null;
  greatStatus: string | null;
  stripeStatus: string | null;
  amountCents: number;
  currency: string | null;
  note: string | null;
  autoFixed: boolean;
  paymentCreatedAt: string | null;
  firstSeenAt: string;
  resolvedAt: string | null;
};

export const DIFFERENCE_LABELS: Record<string, string> = {
  uncollected_hold: "Card held, money not collected",
  hold_on_cancelled_booking: "Hold left on a cancelled booking",
  paid_not_recorded: "Paid in Stripe, not in Great",
  refund_not_recorded: "Refunded in Stripe, not in Great",
  partial_refund: "Partly refunded",
  dispute: "Disputed by the buyer",
  hold_expired: "Hold expired, never collected",
  payment_not_completed: "Payment never completed",
  amount_differs: "Amounts differ",
  test_payment: "Test payment",
};

const GREAT_STATUS: Record<string, string> = {
  pending: "Pending",
  deposit_authorized: "Pending (card held)",
  deposit_paid: "Paid (deposit)",
  confirmed: "Paid",
  fully_paid: "Paid",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Failed",
};

const STRIPE_STATUS: Record<string, string> = {
  succeeded: "Collected",
  requires_capture: "Card held",
  canceled: "Cancelled / expired",
  processing: "Processing",
  requires_payment_method: "Not completed",
  requires_action: "Not completed",
  requires_confirmation: "Not completed",
  not_in_stripe: "Not in live Stripe",
};

function money(cents: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency || "eur").toUpperCase() }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
}

function day(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminPaymentDifferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showFixed, setShowFixed] = useState(false);

  const { data: rows = [], isLoading } = useQuery<PaymentDifference[]>({ queryKey: ["/api/admin/payment-differences"] });

  const runCheck = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/payment-differences/run")).json(),
    onSuccess: (summary: { checked: number; fixed: number; open: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-differences"] });
      toast({
        title: "Stripe check done",
        description: `${summary.checked} payments checked, ${summary.fixed} fixed, ${summary.open} to look at.`,
      });
    },
    onError: (error) => toast({ title: "Check not run", description: readableError(error), variant: "destructive" }),
  });

  const open = rows.filter((row) => !row.resolvedAt);
  const done = rows.filter((row) => row.resolvedAt);
  const shown = showFixed ? rows : open;
  const openCents = open.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <Card data-testid="admin-payment-differences">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-indigo-600" />
            Great vs Stripe
          </CardTitle>
          <CardDescription>
            Every booking is checked against Stripe each hour, and the last 35 days once a day. A booking counts as paid only
            when Stripe has the money. Fixes the check made itself are listed too.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runCheck.mutate()}
          disabled={runCheck.isPending}
          data-testid="button-run-payment-check"
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${runCheck.isPending ? "animate-spin" : ""}`} />
          {runCheck.isPending ? "Checking…" : "Check now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-700 dark:text-gray-300" data-testid="payment-differences-summary">
          {open.length === 0
            ? "Nothing open: Great and Stripe agree."
            : `${open.length} open ${open.length === 1 ? "difference" : "differences"}, ${money(openCents, open[0]?.currency ?? "eur")} in total.`}
          {done.length > 0 && ` ${done.length} fixed or cleared in the last 30 days.`}
        </p>

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : shown.length === 0 ? null : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm" data-testid="payment-differences-table">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Event / buyer</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3">Great</th>
                  <th className="p-3">Stripe</th>
                  <th className="p-3">What is wrong</th>
                  <th className="p-3">State</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((row) => (
                  <tr key={row.id} data-testid={`payment-difference-${row.id}`}>
                    <td className="whitespace-nowrap p-3">{day(row.paymentCreatedAt ?? row.firstSeenAt)}</td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900 dark:text-white">{row.experienceTitle || "—"}</div>
                      <div className="text-xs text-gray-500">{row.buyerEmail || ""}</div>
                    </td>
                    <td className="whitespace-nowrap p-3 text-right">{money(row.amountCents, row.currency)}</td>
                    <td className="p-3">{GREAT_STATUS[row.greatStatus || ""] || row.greatStatus || "—"}</td>
                    <td className="p-3">{STRIPE_STATUS[row.stripeStatus || ""] || row.stripeStatus || "—"}</td>
                    <td className="p-3">
                      <div className="font-medium">{DIFFERENCE_LABELS[row.kind] || row.kind}</div>
                      {row.note && <div className="text-xs text-gray-500">{row.note}</div>}
                      {row.stripePaymentIntentId && (
                        <div className="font-mono text-[11px] text-gray-400">{row.stripePaymentIntentId}</div>
                      )}
                    </td>
                    <td className="p-3">
                      {!row.resolvedAt ? (
                        <Badge variant="destructive">Open</Badge>
                      ) : row.autoFixed ? (
                        <Badge className="bg-emerald-600">Fixed automatically</Badge>
                      ) : (
                        <Badge variant="secondary">Cleared</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {done.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowFixed((value) => !value)} data-testid="toggle-fixed-differences">
            {showFixed ? "Show open only" : `Show ${done.length} fixed or cleared`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
