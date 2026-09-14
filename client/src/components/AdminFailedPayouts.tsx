import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Payouts that did not go through, and a way to put them back in the queue.
 *
 * The scheduler's own documentation says failed payouts "can be retried by an
 * admin resetting status to 'pending'" — and there was no way to do that short
 * of a database client, so every failure was terminal. Meanwhile the reason for
 * each one sat in `error_message` and was shown to nobody, which is how an
 * organiser came to be asking where his money was while the answer was already
 * written down.
 *
 * Retrying only re-queues. The hourly payout run does the transfer, under
 * exactly the same rules as the first attempt — so retrying before the cause is
 * fixed simply fails again, which is why the raw Stripe reason is shown here
 * rather than the softened version the organiser sees.
 */

type AdminPayout = {
  id: string;
  experienceId: string;
  experienceTitle: string;
  status: string;
  scheduledFor: string | null;
  processedAt: string | null;
  grossCents: number;
  currency: string;
  errorMessage: string | null;
};

export default function AdminFailedPayouts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ["/api/admin/scheduled-payouts"];
  const { data: payouts = [], isLoading } = useQuery<AdminPayout[]>({ queryKey });

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/scheduled-payouts/${id}/retry`, {});
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/payouts"] });
      toast({
        title: "Back in the queue",
        description: result?.message
          || "The hourly payout run will pick it up. Fix the cause first or it will fail again.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "Could not re-queue", description: error.message, variant: "destructive" }),
  });

  const failed = payouts.filter((payout) => payout.status === "failed");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Payouts needing attention
        </CardTitle>
        <CardDescription>
          Every payout the scheduler could not complete, with Stripe's own reason. Fix the
          cause, then re-queue — retrying on its own changes nothing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : failed.length === 0 ? (
          <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nothing failed. Every scheduled payout has either gone through or is still waiting
            for its date.
          </p>
        ) : (
          failed.map((payout) => (
            <div
              key={payout.id}
              className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950"
              data-testid={`admin-failed-payout-${payout.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 font-medium text-gray-900 dark:text-white">
                  {payout.experienceTitle}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {(payout.currency || "eur").toUpperCase()}{" "}
                    {((payout.grossCents || 0) / 100).toFixed(2)}
                  </span>
                  <Badge className="bg-red-100 text-red-800">Failed</Badge>
                </div>
              </div>

              <p className="font-mono text-xs text-red-900 dark:text-red-100">
                {payout.errorMessage || "No reason recorded."}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Last attempted{" "}
                  {payout.processedAt
                    ? new Date(payout.processedAt).toLocaleString()
                    : "never"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retry.mutate(payout.id)}
                  disabled={retry.isPending}
                  data-testid={`button-retry-payout-${payout.id}`}
                >
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Re-queue
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
