import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest } from "@/lib/queryClient";
import PostCollabIdeaModal from "@/components/PostCollabIdeaModal";
import CollabListingCard, { type CollabListing } from "@/components/CollabListingCard";
import PartnerToolingGate from "@/components/PartnerToolingGate";
import { Handshake, Plus, Sparkles } from "lucide-react";

type Opportunity = CollabListing & { posterId?: string };

/**
 * Collab Opportunities — one place to see what is open, across every role.
 *
 * The mechanisms underneath already worked. What was missing was distribution:
 * Open Events only ever reached venues, the Experience Pool only reached
 * promoters, and nothing reached the person who simply knows somebody. Putting
 * them in one feed is what lets a promoter spot a "seeking venue" post and
 * forward it to a venue owner they know.
 *
 * Two tabs, kept apart on purpose. **Posted** is what somebody actually posted:
 * explicit, usually time-bound, with a person waiting on an answer. **Suggested
 * for You** is the organic layer — standing preferences matched against live
 * listings, with nothing posted at either end. Merged into one feed the second
 * buries the first: an idea that needs a venue by Friday should not have to
 * compete with twenty "might also fit" rows. Kept apart, the suggestions tab is
 * a reason to open the page on a quiet day, which the posted feed alone is not.
 *
 * Within Posted, the two groups stay visually distinct. A fully-formed listing
 * has a date, a counterparty and a concrete action. A rough idea has none of
 * those — only a conversation to start — and dressing the two the same would
 * promise more than the second one can deliver.
 */
export default function CollabOpportunities() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [postOpen, setPostOpen] = useState(false);
  const [, navigate] = useLocation();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<{
    ready: Opportunity[];
    forming: Opportunity[];
  }>({
    queryKey: ["/api/collab/opportunities"],
  });

  const suggestionsQuery = useQuery<{
    suggestions: Opportunity[];
    needsProfile: boolean;
    role: string;
  }>({
    queryKey: ["/api/collab/suggestions"],
  });

  const registerInterest = useMutation({
    mutationFn: async (ideaId: string) => {
      const res = await apiRequest("POST", `/api/collab/ideas/${ideaId}/interest`, {});
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: "Interest sent",
        description: result?.message || "This opens a conversation — nothing is booked.",
        // The interest opens a deal room. Without a way straight into it, the
        // next thing either side does is look for each other off-platform.
        action: result?.dealRoomId ? (
          <ToastAction
            altText="Open the deal room"
            onClick={() => navigate(`/deal-rooms/${result.dealRoomId}`)}
          >
            Open deal room
          </ToastAction>
        ) : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms"] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not send that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const ready = data?.ready ?? [];
  const forming = data?.forming ?? [];
  const suggestions = suggestionsQuery.data?.suggestions ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Handshake className="h-7 w-7 text-indigo-600" />
              Collab Opportunities
            </h1>
            <p className="text-gray-600 mt-1">
              Open events looking for a space, venues with a free date, and ideas
              still taking shape.
            </p>
          </div>
          <Button onClick={() => setPostOpen(true)} data-testid="button-post-collab-idea">
            <Plus className="h-4 w-4 mr-2" />
            Post a Collab Idea
          </Button>
        </div>

        {/* The whole feed is deal machinery, so it waits on an approved partner
            account the same way the Partners tab does. */}
        <PartnerToolingGate>
          <Tabs defaultValue="posted">
            <TabsList className="mb-6">
              <TabsTrigger value="posted" data-testid="tab-collab-posted">
                Posted
                {ready.length + forming.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {ready.length + forming.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="suggested" data-testid="tab-collab-suggested">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Suggested for You
                {suggestions.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{suggestions.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Posted: somebody is waiting on an answer ─────────────── */}
            <TabsContent value="posted">
              {isLoading ? (
                <p className="text-gray-500">Loading opportunities…</p>
              ) : isError ? (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="py-8 text-center">
                    <p className="font-medium text-red-900">Couldn't load opportunities</p>
                    <p className="mt-1 text-sm text-red-800">
                      Nothing has gone missing — we just couldn't reach the feed. Try again.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      disabled={isRefetching}
                      onClick={() => refetch()}
                      data-testid="button-retry-collab"
                    >
                      {isRefetching ? "Retrying…" : "Try again"}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <section className="mb-10">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                      Ready to act on — from open events, flash deals and the experience pool
                    </h2>

                    {ready.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center text-gray-500 text-sm">
                          Nothing open right now. New postings appear here as they are made.
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {ready.map((item) => (
                          <CollabListingCard
                            key={`${item.kind}-${item.id}`}
                            listing={item}
                            testId={`collab-ready-${item.id}`}
                          />
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                      Still forming — just an idea, no date or partner locked in
                    </h2>

                    {forming.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="py-8 text-center text-gray-500 text-sm">
                          No open ideas yet. Post one and anyone who fits gets told about it.
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {forming.map((item) => (
                          <CollabListingCard
                            key={item.id}
                            listing={item}
                            muted
                            actionDisabled={registerInterest.isPending}
                            onAction={() => registerInterest.mutate(item.id)}
                            testId={`collab-forming-${item.id}`}
                          />
                        ))}
                      </div>
                    )}
                  </section>

                  <p className="text-xs text-gray-500 mt-6">
                    "I'm interested" opens a conversation, not a booking. Once terms are
                    agreed it becomes a normal event and moves to Partners → Active Deals.
                  </p>
                </>
              )}
            </TabsContent>

            {/* ── Suggested: nobody posted these ───────────────────────── */}
            <TabsContent value="suggested">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                Nobody posted these — they match what you usually look for
              </h2>

              {suggestionsQuery.isLoading ? (
                <p className="text-gray-500">Finding matches…</p>
              ) : suggestionsQuery.isError ? (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="py-8 text-center">
                    <p className="font-medium text-red-900">Couldn't work out your matches</p>
                    <p className="mt-1 text-sm text-red-800">
                      This isn't "no matches" — we couldn't reach the matcher at all.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => suggestionsQuery.refetch()}
                      data-testid="button-retry-suggestions"
                    >
                      Try again
                    </Button>
                  </CardContent>
                </Card>
              ) : suggestionsQuery.data?.needsProfile ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-sm text-gray-600">
                    <p className="font-medium text-gray-900">We don't know what you're looking for yet</p>
                    <p className="mt-1">
                      Matches here come from your own profile — where you are, what you
                      run or what kind of space you have. Fill that in and this fills up.
                    </p>
                  </CardContent>
                </Card>
              ) : suggestions.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center text-sm text-gray-500">
                    Nothing fits right now. Suggestions appear as new listings are posted —
                    there's nothing to answer here, so there's no hurry.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {suggestions.map((item) => (
                    <CollabListingCard
                      key={`${item.kind}-${item.id}`}
                      listing={item}
                      actionDisabled={item.kind === "collab_idea" && registerInterest.isPending}
                      onAction={
                        item.kind === "collab_idea"
                          ? () => registerInterest.mutate(item.id)
                          : undefined
                      }
                      testId={`collab-suggested-${item.id}`}
                    />
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-500 mt-6">
                These are suggestions, not requests — nobody is waiting on an answer.
                Anything with someone waiting is under Posted.
              </p>
            </TabsContent>
          </Tabs>
        </PartnerToolingGate>
      </div>

      <PostCollabIdeaModal open={postOpen} onOpenChange={setPostOpen} />
    </div>
  );
}
