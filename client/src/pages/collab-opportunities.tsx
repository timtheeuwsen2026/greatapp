import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PostCollabIdeaModal from "@/components/PostCollabIdeaModal";
import { Handshake, Plus } from "lucide-react";

type Opportunity = {
  kind: "open_event" | "flash_deal" | "experience_pool" | "collab_idea";
  id: string;
  tag: string;
  title: string;
  location: string | null;
  detail: string;
  href?: string;
  actionLabel: string;
  posterId?: string;
};

/**
 * Collab Opportunities — one place to see what is open, across every role.
 *
 * The mechanisms underneath already worked. What was missing was distribution:
 * Open Events only ever reached venues, the Experience Pool only reached
 * promoters, and nothing reached the person who simply knows somebody. Putting
 * them in one feed is what lets a promoter spot a "seeking venue" post and
 * forward it to a venue owner they know.
 *
 * The two groups are visually distinct on purpose. A fully-formed listing has a
 * date, a counterparty and a concrete action. A rough idea has none of those —
 * only a conversation to start — and dressing the two the same would promise
 * more than the second one can deliver.
 */
export default function CollabOpportunities() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [postOpen, setPostOpen] = useState(false);

  const { data, isLoading } = useQuery<{ ready: Opportunity[]; forming: Opportunity[] }>({
    queryKey: ["/api/collab/opportunities"],
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
      });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities"] });
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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

        {isLoading ? (
          <p className="text-gray-500">Loading opportunities…</p>
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
                <div className="space-y-3">
                  {ready.map((item) => (
                    <Card key={`${item.kind}-${item.id}`} data-testid={`collab-ready-${item.id}`}>
                      <CardContent className="py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <Badge variant="secondary" className="mb-2">{item.tag}</Badge>
                          <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                          <p className="text-sm text-gray-500 truncate">
                            {[item.location, item.detail].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {item.href && (
                          <Link href={item.href}>
                            <Button variant="outline" className="shrink-0">{item.actionLabel}</Button>
                          </Link>
                        )}
                      </CardContent>
                    </Card>
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
                <div className="space-y-3">
                  {forming.map((item) => (
                    <Card
                      key={item.id}
                      className="border-dashed bg-gray-50/60"
                      data-testid={`collab-forming-${item.id}`}
                    >
                      <CardContent className="py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <Badge variant="outline" className="mb-2">{item.tag}</Badge>
                          <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                          <p className="text-sm text-gray-500 truncate">
                            {[item.location, item.detail].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="shrink-0"
                          disabled={registerInterest.isPending}
                          onClick={() => registerInterest.mutate(item.id)}
                          data-testid={`button-interested-${item.id}`}
                        >
                          I'm interested
                        </Button>
                      </CardContent>
                    </Card>
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
      </div>

      <PostCollabIdeaModal open={postOpen} onOpenChange={setPostOpen} />
    </div>
  );
}
