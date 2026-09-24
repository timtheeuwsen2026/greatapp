import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import CopyableLink from "@/components/CopyableLink";
import { useAuth } from "@/hooks/useAuth";
import {
  Handshake, Loader2, MessageSquare, Shield, Users,
} from "lucide-react";

type PartnerEvent = {
  id: string;
  status: string;
  partnerType: string;
  typeLabel: string;
  dealType: string;
  dealLabel: string;
  termSummary: string;
  eventId: string;
  eventTitle: string;
  eventDate: string | null;
  shareUrl: string | null;
  refCode: string | null;
  joined: number;
  milestoneTarget: number | null;
};

/**
 * Partner Home — where a community invites its own people.
 *
 * This page did not exist anywhere. A run club could be recorded as a partner
 * inside somebody's Event Builder, and then had nowhere to accept the invite,
 * nothing to send its own members, and no way to find out how many of them
 * came. "Invite a community as a partner" was a deal that could be written down
 * but not a workflow anyone could act on.
 *
 * Third sibling to Creator Home and Venue Home: same shape, different audience.
 * No new account type and no new role — access follows from holding at least
 * one partner entry on one event, which is a relationship rather than a
 * classification. Everything below is presentation.
 *
 * The copy is deliberately in the second person — your people, your link, your
 * audience — because that is the actual relationship. The community brought
 * them; the platform is just counting.
 */
export default function PartnerHome() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [messageFor, setMessageFor] = useState<PartnerEvent | null>(null);
  const [messageBody, setMessageBody] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<{
    hasAccess: boolean;
    stats: { peopleBrought: number; activeEvents: number; creditsEarned: number };
    pending: PartnerEvent[];
    confirmed: PartnerEvent[];
  }>({
    queryKey: ["/api/partner-home"],
    enabled: isAuthenticated,
  });

  const respond = useMutation({
    mutationFn: async ({ entryId, accept }: { entryId: string; accept: boolean }) => {
      const res = await apiRequest("POST", `/api/partner-home/entries/${entryId}/respond`, { accept });
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: result?.accepted ? "You're in" : "Declined",
        description: result?.accepted
          ? "Your link is ready — share it with your people."
          : "The organiser has been told.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/partner-home"] });
      // The nav's badge counts invites waiting on an answer, and its own query
      // has an infinite stale time — without this it keeps showing the old
      // number until a full reload.
      queryClient.invalidateQueries({ queryKey: ["/api/partner-home/access"] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not record that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/partner-home/message", {
        entryId: messageFor?.id || null,
        message: messageBody,
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({ title: "Message sent", description: result?.message });
      setMessageFor(null);
      setMessageBody("");
    },
    onError: (error: any) => {
      toast({
        title: "Could not send that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-gray-600">
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
          Loading your partner home…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="mx-auto max-w-4xl px-4 py-16">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-8 text-center">
              <p className="font-medium text-red-900">Couldn't load your partner home</p>
              <p className="mt-1 text-sm text-red-800">
                Nothing has gone missing — we just couldn't reach it.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const stats = data?.stats || { peopleBrought: 0, activeEvents: 0, creditsEarned: 0 };
  const pending = data?.pending || [];
  const confirmed = data?.confirmed || [];

  // Not an error state: an account with no partner deals yet is a perfectly
  // ordinary account. It is told what would put something here.
  if (!data?.hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="mx-auto max-w-2xl px-4 py-16">
          <Card>
            <CardContent className="py-12 text-center">
              <Handshake className="mx-auto mb-4 h-10 w-10 text-indigo-400" />
              <h1 className="text-xl font-bold text-gray-900">No partner deals yet</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
                This is where events you're partnered on show up — the invites to
                accept, your own link to share with your people, and how many of
                them came. An organiser adding you as a partner is what fills it.
              </p>
              <div className="mt-6 flex justify-center gap-2">
                <Link href="/collab-opportunities">
                  <Button variant="outline">Browse Collab Opportunities</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
            <Handshake className="h-7 w-7 text-indigo-600" />
            Partner Home
          </h1>
          <p className="mt-1 text-gray-600">
            Events you're partnered on, and the audience you've brought to each.
          </p>
        </div>

        {/* Three numbers, and only ones that mean something. "Credits earned"
            counts milestone rewards actually unlocked — a brand's exposure has
            no figure, and inventing one would be worse than showing none. */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold" data-testid="stat-people-brought">
                {stats.peopleBrought}
              </p>
              <p className="text-xs text-gray-600">people brought total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold" data-testid="stat-active-events">
                {stats.activeEvents}
              </p>
              <p className="text-xs text-gray-600">active partner events</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold" data-testid="stat-credits-earned">
                {stats.creditsEarned}
              </p>
              <p className="text-xs text-gray-600">free tickets earned</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Invites waiting on you ─────────────────────────────────────── */}
        {pending.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Waiting on your answer
            </h2>
            <div className="space-y-3">
              {pending.map((event) => (
                <Card key={event.id} data-testid={`pending-partner-${event.id}`}>
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{event.eventTitle}</p>
                        <p className="text-xs text-gray-600">
                          {event.dealLabel} · {event.termSummary}
                        </p>
                      </div>
                      <Badge className="shrink-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
                        Awaiting your response
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={respond.isPending}
                        onClick={() => respond.mutate({ entryId: event.id, accept: true })}
                        data-testid={`button-accept-partner-${event.id}`}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={respond.isPending}
                        onClick={() => respond.mutate({ entryId: event.id, accept: false })}
                        data-testid={`button-decline-partner-${event.id}`}
                      >
                        Decline
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* ── Confirmed, with each one's own link ────────────────────────── */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Your partner events
          </h2>

          {confirmed.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-gray-500">
                Nothing confirmed yet. Accepting an invite above puts it here,
                with your own link.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {confirmed.map((event) => (
                <Card key={event.id} data-testid={`partner-event-${event.id}`}>
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{event.eventTitle}</p>
                        <p className="text-xs text-gray-600">
                          {event.eventDate
                            ? new Date(event.eventDate).toLocaleDateString(undefined, {
                                day: "numeric", month: "short", year: "numeric",
                              })
                            : "Date to be confirmed"}
                          {" · "}
                          {event.dealLabel}
                        </p>
                      </div>
                      <Badge
                        className="shrink-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                        data-testid={`partner-joined-${event.id}`}
                      >
                        {event.joined} joined
                      </Badge>
                    </div>

                    {/* Milestone barter settles on this exact count, so the
                        partner sees how close they are rather than being told
                        after the fact whether they earned it. */}
                    {event.milestoneTarget ? (
                      <div className="mb-3">
                        <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                          <span>{event.termSummary}</span>
                          <span>
                            {event.joined} / {event.milestoneTarget}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(100, (event.joined / event.milestoneTarget) * 100)}
                          className="h-1.5"
                        />
                      </div>
                    ) : (
                      <p className="mb-3 text-xs text-gray-600">{event.termSummary}</p>
                    )}

                    {event.shareUrl ? (
                      <CopyableLink
                        url={event.shareUrl}
                        note="Everyone who joins through this is counted as yours."
                        testId={`link-partner-${event.id}`}
                      />
                    ) : (
                      <p className="text-xs text-gray-500">
                        This deal has no active member or commission tracking link.
                      </p>
                    )}

                    <div className="mt-3 flex justify-end">
                      {event.dealType === 'commission_per_ticket' && (
                        <Link href="/promoter"><Button size="sm" variant="outline">Commission &amp; payouts</Button></Link>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setMessageFor(event); setMessageBody(""); }}
                        data-testid={`button-message-audience-${event.id}`}
                      >
                        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                        Message your people
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* ── Message your audience ──────────────────────────────────────── */}
        <div className="mt-8 border-t pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Message your audience</p>
              <p className="mt-0.5 text-xs text-gray-600">
                Sent through Great — no contact details are shared unless someone
                opts in.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={confirmed.length === 0}
              onClick={() => { setMessageBody(""); setMessageFor(confirmed[0] || null); }}
              data-testid="button-new-message"
            >
              New message
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={!!messageFor}
        onOpenChange={(next) => { if (!next) { setMessageFor(null); setMessageBody(""); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message the people you brought</DialogTitle>
            <DialogDescription>
              {messageFor
                ? `Everyone who joined ${messageFor.eventTitle} through your link.`
                : "Everyone who joined through your links."}
            </DialogDescription>
          </DialogHeader>

          <Textarea
            rows={5}
            placeholder="Morning all — we're meeting at the fountain at 8, bring a jumper."
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            data-testid="input-partner-message"
          />

          {/* Said plainly, because the partner will otherwise assume they are
              getting a mailing list out of this. They are not, ever. */}
          <p className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This goes out through Great, into the event's own thread. You never
            receive anybody's email address or phone number — sharing those is
            each person's own decision to make.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMessageFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={!messageBody.trim() || sendMessage.isPending}
              onClick={() => sendMessage.mutate()}
              data-testid="button-send-partner-message"
            >
              {sendMessage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
