import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, Handshake, Loader2, MapPin } from "lucide-react";

/**
 * Claiming a Partners-step invite: great.app/invite/:token
 *
 * The invited party is very often a run club or a coffee shop that has never
 * heard of this platform, so the page renders for a signed-out visitor: the
 * token is the credential, the deal is on screen, and signing in is only asked
 * for at the moment they say yes — because accepting has to attach to an
 * account, which is what Partner Home hangs off.
 *
 * Deliberately not /partner-invite/:token. That path resolves against
 * `promotion_deals`, a different record with its own counter-proposal and
 * Stripe flow. Sharing the path would have meant one lookup guessing which kind
 * of invite a token was.
 *
 * The organiser's contact details are not on this page. Accepting is what opens
 * a channel between the two.
 */
export default function EventPartnerInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data, isLoading, isError } = useQuery<{
    partner: {
      id: string;
      partnerName: string;
      partnerType: string;
      typeLabel: string;
      dealType: string;
      dealLabel: string;
      termSummary: string;
      status: string;
    };
    event: {
      id: string;
      slug: string | null;
      title: string;
      startDate: string | null;
      location: string | null;
      coverImageUrl: string | null;
    } | null;
    organizerName: string;
  }>({
    queryKey: [`/api/event-partner-invites/${token}`],
    enabled: !!token,
  });

  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      const res = await apiRequest("POST", `/api/event-partner-invites/${token}/respond`, { accept });
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: result?.accepted ? "You're in" : "Declined",
        description: result?.accepted
          ? "Your own link is on Partner Home — share it with your people."
          : "The organiser has been told.",
      });
      // Partner Home is where they land, so its feed and the nav's badge both
      // have to be current before they get there.
      queryClient.invalidateQueries({ queryKey: ["/api/partner-home"] });
      queryClient.invalidateQueries({ queryKey: ["/api/partner-home/access"] });
      queryClient.invalidateQueries({ queryKey: [`/api/event-partner-invites/${token}`] });
      if (result?.accepted) navigate("/partner");
    },
    onError: (error: any) => {
      toast({
        title: "Could not record that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="mx-auto max-w-lg px-4 py-20 text-center text-gray-600">
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
          Loading your invite…
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="mx-auto max-w-lg px-4 py-20">
          <Card>
            <CardContent className="py-10 text-center">
              <h1 className="text-lg font-semibold text-gray-900">
                This invite link isn't valid
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                It may have been replaced, or the event may have been taken down.
                Ask whoever sent it for a fresh link.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { partner, event, organizerName } = data;
  const answered = partner.status === "confirmed" || partner.status === "declined";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="mx-auto max-w-lg px-4 py-12">
        <Card>
          {event?.coverImageUrl && (
            <img src={event.coverImageUrl} alt="" className="h-40 w-full rounded-t-xl object-cover" />
          )}
          <CardContent className="p-6">
            <Badge variant="secondary" className="mb-3">
              <Handshake className="mr-1 h-3 w-3" />
              Partner invite
            </Badge>

            <h1 className="text-xl font-bold text-gray-900">
              {organizerName} wants to partner with you
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              on <strong>{event?.title || "an upcoming event"}</strong>, as{" "}
              {partner.typeLabel.toLowerCase()}.
            </p>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              {event?.startDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {new Date(event.startDate).toLocaleDateString(undefined, {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
              )}
              {event?.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {event.location}
                </span>
              )}
            </div>

            <div className="mt-5 rounded-xl bg-indigo-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                The deal on the table
              </p>
              <p className="mt-1 text-sm font-semibold text-indigo-900">{partner.dealLabel}</p>
              <p className="text-sm text-indigo-800">{partner.termSummary}</p>
            </div>

            {answered ? (
              <p className="mt-5 text-sm text-gray-600" data-testid="text-invite-answered">
                You've already {partner.status === "confirmed" ? "accepted" : "declined"} this
                one. {partner.status === "confirmed" && "Your link is on Partner Home."}
              </p>
            ) : isAuthenticated ? (
              <div className="mt-5 flex gap-2">
                <Button
                  className="flex-1"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate(true)}
                  data-testid="button-accept-event-partner-invite"
                >
                  {respond.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Accept
                </Button>
                <Button
                  variant="outline"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate(false)}
                  data-testid="button-decline-event-partner-invite"
                >
                  Decline
                </Button>
              </div>
            ) : (
              /* Sign-in is asked for here rather than at the door, so the
                 invited party can read the terms before deciding whether this
                 is worth making an account for. */
              <div className="mt-5">
                <Button
                  className="w-full"
                  onClick={() => navigate(`/login?returnTo=/invite/${token}`)}
                  data-testid="button-signin-to-accept"
                >
                  Sign in to accept
                </Button>
                <p className="mt-2 text-center text-xs text-gray-500">
                  New to Great? Creating an account takes a minute, and this
                  invite will be waiting.
                </p>
              </div>
            )}

            <p className="mt-4 text-xs text-gray-500">
              Accepting gives you your own trackable link for this event, so
              everyone you bring is counted as yours.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
