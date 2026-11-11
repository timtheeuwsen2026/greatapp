import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, readableError } from "@/lib/queryClient";
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

function money(cents: number, currency = "eur"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `€${(cents / 100).toFixed(2)}`;
  }
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
  const queryKey = ["/api/admin/payout-overview"];
  const { data, isLoading } = useQuery<PayoutOverview>({ queryKey });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduled-payouts"] });
  };

  const payNow = useMutation({
    mutationFn: async (payoutId: string) => (await apiRequest("POST", `/api/admin/scheduled-payouts/${payoutId}/pay-now`, {})).json(),
    onSuccess: (result: any) => { refresh(); toast({ title: "Payout sent", description: result?.message }); },
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
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(event)}
                      {(event.payoutStatus === "pending" || event.payoutStatus === "failed" || event.partlyPaid) && event.owedCents > 0 && (
                        <Button
                          size="sm"
                          onClick={() => payNow.mutate(event.payoutId)}
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
                            <Badge className="bg-amber-500">Held: {line.stripeConnected ? "paid on the next run" : "no Stripe account"}</Badge>
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
