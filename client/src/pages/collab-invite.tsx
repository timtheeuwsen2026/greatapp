import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  collabDealPreferenceLabel,
  collabSeekingLabel,
  COLLAB_SEEKING_TYPES,
} from "@shared/collabIdeaOptions";
import { Calendar, Handshake, Lightbulb, Loader2, MapPin, Users } from "lucide-react";

/**
 * Claiming a direct invite from a Collab Idea: great.app/collab-invite/:token
 *
 * The poster had a specific venue or brand in mind and sent them a link — most
 * often through an Instagram DM, because a handle is the only contact detail
 * they had. So this page renders for a signed-out visitor, with the idea in
 * full, and only asks for an account at the point of accepting.
 *
 * Accepting lands them on Partner Home with this idea attached as a pending
 * invite, and opens a deal room — the same acceptance mechanic an Event Builder
 * partner invite uses, rather than a second one for ideas.
 */
export default function CollabInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data, isLoading, isError } = useQuery<{
    invite: { id: string; partnerType: string; status: string; email: string | null };
    idea: {
      id: string;
      title: string;
      description: string | null;
      city: string | null;
      region: string | null;
      audience: string | null;
      photoUrl: string | null;
      seekingPartnerTypes: string[];
      typeDetails: Record<string, Record<string, string>>;
      dealPreferences: string[];
      period: string;
      groupSize: string;
      status: string;
    };
    posterName: string;
  }>({
    queryKey: [`/api/collab/invites/${token}`],
    enabled: !!token,
  });

  const accept = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/collab/invites/${token}/accept`, {});
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: "Invite accepted",
        description: result?.dealRoomId
          ? "Your deal room is open — work out the details there."
          : "The poster has been told.",
      });
      navigate(result?.dealRoomId ? `/deal-rooms/${result.dealRoomId}` : "/partner");
    },
    onError: (error: any) => {
      toast({
        title: "Could not accept that",
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
          Loading the idea…
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
                The idea may have been taken down, or the link replaced. Ask
                whoever sent it for a fresh one.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { invite, idea, posterName } = data;
  const alreadyAccepted = invite.status === "accepted";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="mx-auto max-w-lg px-4 py-12">
        <Card>
          {idea.photoUrl ? (
            <img src={idea.photoUrl} alt="" className="h-40 w-full rounded-t-xl object-cover" />
          ) : (
            <div className="flex h-24 w-full items-center justify-center rounded-t-xl bg-indigo-50">
              <Lightbulb className="h-8 w-8 text-indigo-400" />
            </div>
          )}

          <CardContent className="p-6">
            <Badge variant="secondary" className="mb-3">
              <Handshake className="mr-1 h-3 w-3" />
              Direct invite
            </Badge>

            <h1 className="text-xl font-bold text-gray-900">{idea.title}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {posterName} invited you specifically, as{" "}
              {collabSeekingLabel(invite.partnerType).toLowerCase()}.
            </p>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              {(idea.city || idea.region) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {[idea.city, idea.region].filter(Boolean).join(", ")}
                </span>
              )}
              {idea.groupSize && (
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {idea.groupSize}
                </span>
              )}
              {idea.period && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {idea.period}
                </span>
              )}
            </div>

            {/* Only the block for the type this person was invited as. A venue
                does not need to read what the poster wants from a sponsor. */}
            {idea.typeDetails?.[invite.partnerType] && (
              <div className="mt-4 rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-900">
                  What they're after from you
                </p>
                <dl className="mt-1.5 space-y-1">
                  {Object.entries(idea.typeDetails[invite.partnerType]).map(([key, value]) => {
                    const option = COLLAB_SEEKING_TYPES.find((entry) => entry.id === invite.partnerType);
                    return (
                      <div key={key} className="flex gap-2 text-xs">
                        <dt className="text-gray-500">
                          {option?.fields.find((field) => field.key === key)?.label || key}
                        </dt>
                        <dd className="text-gray-800">{String(value)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            )}

            {idea.dealPreferences?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Deal preference
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {idea.dealPreferences.map((pref) => (
                    <Badge key={pref} variant="outline">
                      {collabDealPreferenceLabel(pref)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {idea.description && (
              <p className="mt-4 whitespace-pre-line text-sm text-gray-700">{idea.description}</p>
            )}

            {alreadyAccepted ? (
              <p className="mt-5 text-sm text-gray-600" data-testid="text-collab-invite-accepted">
                You've already accepted this one — it's on your Partner Home.
              </p>
            ) : idea.status !== "open" ? (
              <p className="mt-5 text-sm text-gray-600">
                This idea is no longer open. It may already have found its match.
              </p>
            ) : isAuthenticated ? (
              <Button
                className="mt-5 w-full"
                disabled={accept.isPending}
                onClick={() => accept.mutate()}
                data-testid="button-accept-collab-invite"
              >
                {accept.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                I'm in — let's talk
              </Button>
            ) : (
              <div className="mt-5">
                <Button
                  className="w-full"
                  onClick={() => navigate(`/login?returnTo=/collab-invite/${token}`)}
                  data-testid="button-signin-to-accept-collab"
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
              Accepting opens a conversation and nothing else — no dates, no
              money, and no commitment until you both agree terms.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
