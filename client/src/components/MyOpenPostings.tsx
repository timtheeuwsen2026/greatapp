import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Posting = {
  id: string;
  title: string;
  status: string;
  city: string | null;
  region: string | null;
  period: string;
  groupSize: string;
  responseCount: number;
};

/**
 * Partners → My Open Postings.
 *
 * The same record the public feed shows, filtered to the person who posted it.
 * Not a copy: an organiser should not have to check Collab Opportunities and
 * their own dashboard to find out whether anyone answered. When a deal is
 * struck the record leaves the public feed and moves along Partners into Active
 * Deals — one row through a lifecycle, not two systems to reconcile.
 */
export default function MyOpenPostings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: postings = [], isLoading } = useQuery<Posting[]>({
    queryKey: ["/api/collab/ideas/mine"],
  });

  const close = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/collab/ideas/${id}`, { status: "closed" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Posting withdrawn", description: "It no longer appears in Collab Opportunities." });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/ideas/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities"] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not withdraw it",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading your postings…</div>;
  }

  if (postings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          <p className="font-medium">Nothing posted yet</p>
          <p className="text-sm mt-1">
            Post a rough idea in{" "}
            <Link href="/collab-opportunities" className="underline">
              Collab Opportunities
            </Link>{" "}
            and anyone who fits gets notified.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Postings you have made that are still open — the same record people see in
        Collab Opportunities.
      </p>

      {postings.map((posting) => (
        <Card key={posting.id} data-testid={`my-posting-${posting.id}`}>
          <CardContent className="py-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={posting.status === "open" ? "default" : "secondary"}>
                  {posting.status === "open" ? "my collab idea · open" : posting.status}
                </Badge>
                {posting.status === "open" && (
                  <span className="text-xs text-gray-400">Visible in Collab Opportunities</span>
                )}
              </div>
              <p className="font-semibold text-gray-900 truncate">{posting.title}</p>
              <p className="text-sm text-gray-500 truncate">
                {[
                  [posting.city, posting.region].filter(Boolean).join(", "),
                  posting.period,
                  posting.groupSize,
                  posting.responseCount === 0
                    ? "no responses yet"
                    : `${posting.responseCount} interested`,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>

            {posting.status === "open" && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={close.isPending}
                onClick={() => close.mutate(posting.id)}
                data-testid={`button-withdraw-${posting.id}`}
              >
                Withdraw
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
