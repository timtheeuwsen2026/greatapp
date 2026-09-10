import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Check, X } from "lucide-react";

/**
 * The other half of the tooling gate.
 *
 * Venues already had a review queue; creators had none, which is why choosing
 * the Creator role was enough to reach the deal-type builder, the revenue
 * calculator and the Partners tab. Gating those on approval only works if
 * somebody can actually approve — so this is the queue that makes the gate
 * passable rather than a wall.
 *
 * The stopgap, deliberately: manual approval standing in for the verification
 * and onboarding architecture, so the copying risk closes now rather than when
 * that ships.
 */
type PendingCreator = {
  id: string;
  userId: string;
  displayName: string;
  tagline?: string | null;
  location?: string | null;
  bio?: string | null;
  profilePhoto?: string | null;
  expertiseTags?: string[] | null;
  experienceLevel?: string | null;
  payoutEmail?: string | null;
  createdAt?: string | null;
};

export default function AdminCreatorApprovals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pending = [], isLoading, isError } = useQuery<PendingCreator[]>({
    queryKey: ["/api/admin/creator-profiles/pending"],
  });

  const decide = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/creator-profiles/${id}/approval`, { approved });
      return res.json();
    },
    onSuccess: (_result, variables) => {
      toast({
        title: variables.approved ? "Creator approved" : "Creator held back",
        description: variables.approved
          ? "The builder and Partners tab are now open to them."
          : "They keep their account, but the deal tooling stays closed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/creator-profiles/pending"] });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't record that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading creator approvals…</p>;
  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="py-6 text-sm text-red-900">
          Couldn't load the creator queue. Reload and try again.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Creator Approvals</h2>
        <p className="text-sm text-gray-500">
          Completed creator profiles waiting on review. Until a profile is approved,
          the account can build its profile but cannot reach the event builder,
          the revenue calculator or the Partners tab.
        </p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-gray-500">
            Nothing waiting. New creators appear here as soon as they complete a profile.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((creator) => (
            <Card key={creator.id} data-testid={`creator-approval-${creator.id}`}>
              <CardContent className="flex flex-wrap items-start gap-4 py-4">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarImage src={creator.profilePhoto || ""} />
                  <AvatarFallback>{(creator.displayName || "?").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">{creator.displayName}</p>
                  <p className="text-sm text-gray-500">
                    {[creator.tagline, creator.location, creator.experienceLevel]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {creator.bio && (
                    <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">{creator.bio}</p>
                  )}
                  {!!creator.expertiseTags?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {creator.expertiseTags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  {creator.payoutEmail && (
                    <p className="mt-2 text-xs text-gray-400">Payouts to {creator.payoutEmail}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: creator.id, approved: true })}
                    data-testid={`button-approve-creator-${creator.id}`}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: creator.id, approved: false })}
                    data-testid={`button-hold-creator-${creator.id}`}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Hold
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
