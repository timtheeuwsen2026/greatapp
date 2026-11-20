import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, authHeaders, readableError } from "@/lib/queryClient";
import { useAdminCity } from "@/hooks/useAdminCity";
import { Download, Send, Wallet } from "lucide-react";

/**
 * The money overview for admins: what is on the Stripe balance, and per event
 * who is owed how much and whether they have a Stripe account to be paid into.
 *
 * The amounts are the payout run's own dry run, so this is exactly what will
 * be sent. "Pay now" runs an event's payout straight away; "Paid manually"
 * settles one person paid outside Stripe so Great never pays them again.
 */

export type OverviewLine = {
  key: string;
  role: "organiser" | "venue" | "partner" | "other";
  name: string;
  email: string | null;
  amountCents: number;
  stripeConnected: boolean;
  settled: string | null;
  held?: boolean;
};

export type OverviewEvent = {
  payoutId: string;
  experienceId: string;
  title: string;
  currency: string;
  payoutStatus: string;
  partlyPaid?: boolean;
  isTest?: boolean;
  ticketGrossCents?: number | null;
  addonGrossCents?: number | null;
  ticketFeePct?: number | null;
  note?: string | null;
  duplicates?: number;
  scheduledFor: string | null;
  processedAt: string | null;
  errorMessage: string | null;
  grossCents: number;
  platformFeeCents: number;
  lines: OverviewLine[];
  owedCents: number;
  planError: string | null;
};

export type PayoutOverview = {
  balance: { currency: string; availableCents: number; incomingCents: number } | null;
  balanceError: string | null;
  owedCents: number;
  events: OverviewEvent[];
};

const ROLE_LABEL: Record<OverviewLine["role"], string> = {
  organiser: "Organiser", venue: "Venue", partner: "Partner", other: "Other",
};

// Always "€2.00", sign in front, whatever the browser language (Tim: everything in euro).
function money(cents: number, _currency = "eur"): string {
  return `${cents < 0 ? "−" : ""}€${(Math.abs(cents) / 100).toFixed(2)}`;
}

function day(value: string | null): string {
  return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function dayTime(value: string | null): string {
  return value
    ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })
    : "—";
}

function statusBadge(event: OverviewEvent) {
  if (event.note) return <Badge variant="outline">{event.note.split(":")[0]}</Badge>;
  if (event.payoutStatus === "completed" && event.partlyPaid) return <Badge className="bg-amber-500">Partly paid, share held</Badge>;
  if (event.payoutStatus === "completed") return <Badge className="bg-emerald-600">Paid {day(event.processedAt)}</Badge>;
  if (event.payoutStatus === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (event.payoutStatus === "processing") return <Badge variant="secondary">Paying…</Badge>;
  return <Badge variant="secondary">Scheduled {dayTime(event.scheduledFor)}</Badge>;
}

/** The list as a spreadsheet, for paying or checking by hand. */
export function overviewCsv(overview: PayoutOverview): string {
  const rows = [["Event", "Payout status", "Person", "Role", "Email", "Amount", "Stripe connected", "Settled"]];
  for (const event of overview.events) {
    for (const line of event.lines) {
      rows.push([
        event.title, event.payoutStatus, line.name, ROLE_LABEL[line.role], line.email || "",
        (line.amountCents / 100).toFixed(2), line.stripeConnected ? "yes" : "no", line.settled || "",
      ]);
    }
  }
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default function AdminPayoutOverview() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const adminCity = useAdminCity();
  const queryKey = ["/api/admin/payout-overview", adminCity.query];
  const { data, isLoading } = useQuery<PayoutOverview>({ queryKey });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-payouts"] });
  };

  // "Pay now" asks first when a share was already paid by hand, so nobody is
  // paid twice by mistake (66.30c). The server refuses without the yes.
  const payNow = useMutation({
    mutationFn: async ({ payoutId, confirmManual }: { payoutId: string; confirmManual?: boolean }) => {
      const res = await fetch(`/api/admin/scheduled-payouts/${payoutId}/pay-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ confirmManual: !!confirmManual }),
      });
      const body = await res.json().catch(() => ({}));
      return { ...body, payoutId, httpOk: res.ok };
    },
    onSuccess: (result: any) => {
      if (result?.needsConfirmation) {
        if (window.confirm(`${result.message}\n\nPay the remaining shares now?`)) {
          payNow.mutate({ payoutId: result.payoutId, confirmManual: true });
        }
        return;
      }
      refresh();
      toast(result?.httpOk
        ? { title: "Payout sent", description: result?.message }
        : { title: "Not paid", description: result?.message, variant: "destructive" });
    },
    onError: (error) => { refresh(); toast({ title: "Not paid", description: readableError(error), variant: "destructive" }); },
  });

  const markPaid = useMutation({
    mutationFn: async ({ payoutId, recipientKey, note }: { payoutId: string; recipientKey: string; note: string }) =>
      (await apiRequest("POST", `/api/admin/scheduled-payouts/${payoutId}/mark-paid-manually`, { recipientKey, note })).json(),
    onSuccess: (result: any) => { refresh(); toast({ title: "Marked as paid", description: result?.message }); },
    onError: (error) => toast({ title: "Not marked", description: readableError(error), variant: "destructive" }),
  });

  const askAndMark = (event: OverviewEvent, line: OverviewLine) => {
    const note = window.prompt(
      `Paid ${line.name} ${money(line.amountCents, event.currency)} outside Stripe? Say how and when (for example: bank transfer on 9 Nov). Great will then never pay this share.`,
    );
    if (note && note.trim()) markPaid.mutate({ payoutId: event.payoutId, recipientKey: line.key, note: note.trim() });
  };

  const download = () => {
    if (!data) return;
    const blob = new Blob([overviewCsv(data)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `great-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card data-testid="admin-payout-overview">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-indigo-600" />
            Payouts per event
          </CardTitle>
          <CardDescription>
            Who gets how much, and who has Stripe connected. Payouts run automatically 24 hours after the event, each
            one paid from the event's own payments.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={download} disabled={!data} data-testid="button-download-payouts">
          <Download className="mr-1 h-3.5 w-3.5" /> Download list
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3" data-testid="payout-balance">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Available on Stripe</div>
                <div className="text-lg font-semibold">{data.balance ? money(data.balance.availableCents) : "—"}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Pending in Stripe</div>
                <div className="text-lg font-semibold">{data.balance ? money(data.balance.incomingCents) : "—"}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Still to pay to partners</div>
                <div className="text-lg font-semibold" data-testid="payout-owed">{money(data.owedCents)}</div>
              </div>
            </div>
            {data.balanceError && <p className="text-xs text-amber-700">Stripe balance: {data.balanceError}</p>}

            {data.events.length === 0 ? (
              <p className="text-sm text-gray-500" data-testid="payout-overview-empty">No payouts waiting.</p>
            ) : (
              data.events.map((event) => (
                <div key={event.payoutId} className="rounded-lg border" data-testid={`payout-event-${event.payoutId}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {event.title}
                        {event.isTest && <Badge variant="outline" className="ml-2">Test</Badge>}
                      </div>
                      <div className="text-xs text-gray-500">
                        Sales {money(event.grossCents, event.currency)} · Great fee {money(event.platformFeeCents, event.currency)}
                      </div>
                      {/* Why the fee is what it is: a share of tickets only (66.29e). */}
                      {typeof event.ticketGrossCents === "number" && event.grossCents > 0 && (
                        <div className="text-xs text-gray-500" data-testid={`payout-fee-split-${event.payoutId}`}>
                          Tickets {money(event.ticketGrossCents, event.currency)}
                          {(event.addonGrossCents || 0) > 0 && <> + add-ons {money(event.addonGrossCents || 0, event.currency)}</>}
                          {event.ticketFeePct != null && <>. Fee: {event.ticketFeePct}% of tickets{(event.addonGrossCents || 0) > 0 ? ", no fee on the venue's add-on price" : ""}</>}
                        </div>
                      )}
                      {event.note && <div className="text-xs text-gray-500" data-testid={`payout-note-${event.payoutId}`}>{event.note}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(event)}
                      {(event.payoutStatus === "pending" || event.payoutStatus === "failed" || event.partlyPaid) && event.owedCents > 0
                        && !String(event.errorMessage || "").startsWith("Paid manually") && (
                        <Button
                          size="sm"
                          onClick={() => payNow.mutate({ payoutId: event.payoutId })}
                          disabled={payNow.isPending}
                          data-testid={`button-pay-now-${event.payoutId}`}
                        >
                          <Send className="mr-1 h-3.5 w-3.5" /> Pay now
                        </Button>
                      )}
                    </div>
                  </div>
                  {(event.duplicates || 0) > 0 && (
                    <p className="border-b bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                      This event has {event.duplicates} more payout row{event.duplicates === 1 ? "" : "s"} for the same payout. It is counted once here.
                    </p>
                  )}
                  {(event.planError || ((event.payoutStatus === "failed" || event.partlyPaid) && event.errorMessage)) && (
                    <p className="border-b bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
                      {event.planError || event.errorMessage}
                    </p>
                  )}
                  <ul className="divide-y">
                    {event.lines.map((line) => (
                      <li key={line.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" data-testid={`payout-line-${event.payoutId}-${line.key}`}>
                        <div className="min-w-0">
                          <span className="font-medium">{line.name}</span>
                          <span className="text-gray-500"> · {ROLE_LABEL[line.role]}</span>
                          {line.email && <div className="text-xs text-gray-500">{line.email}</div>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {line.amountCents > 0 && <span className="font-medium">{money(line.amountCents, event.currency)}</span>}
                          {line.settled ? (
                            <Badge className="bg-emerald-600">{line.settled.startsWith("manual:") ? "Paid manually" : "Paid"}</Badge>
                          ) : line.held ? (
                            <Badge className="bg-amber-500">Held: {line.stripeConnected ? "paid on the next run" : "no Stripe account yet"}</Badge>
                          ) : line.stripeConnected ? (
                            <Badge variant="secondary">Stripe connected</Badge>
                          ) : (
                            <Badge variant="destructive">No Stripe account</Badge>
                          )}
                          {!line.settled && event.payoutStatus !== "processing" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => askAndMark(event, line)}
                              disabled={markPaid.isPending}
                              data-testid={`button-mark-line-paid-${event.payoutId}-${line.key}`}
                            >
                              Paid manually
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
