import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import Navigation from "@/components/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2, Calendar, MapPin, Users, CheckCircle, XCircle, Loader2,
  Handshake, ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeImageUrl } from "@/lib/utils";

type VenueInvite = {
  token: string;
  status: 'pending' | 'claimed' | 'accepted' | 'declined' | 'expired';
  expiresAt: string | null;
  contactName: string | null;
  email: string;
  venue: {
    name: string | null;
    address: string | null;
    city: string | null;
    description: string | null;
    capacity: number | null;
    propertyUrl: string | null;
  };
  deal: {
    model: string | null;
    value: number | null;
    currency: string;
  };
  experience: {
    id: string;
    slug: string | null;
    title: string;
    shortDescription: string | null;
    coverImageUrl: string | null;
    startDate: string;
    endDate: string;
    location: string;
    maxParticipants: number | null;
    currency: string | null;
    requireMinimumParticipants: boolean | null;
    minimumParticipants: number | null;
  } | null;
  creator: { firstName: string | null; lastName: string | null } | null;
  claimedVenueId: string | null;
};

const DEAL_LABELS: Record<string, string> = {
  revenue_share: 'Revenue Split',
  fixed_fee: 'Ticket Deduction',
  per_head: 'Per Head',
  minimum_spend: 'Minimum Spend',
  access_only: 'Access Only',
  venue_sponsored: 'Venue Sponsorship',
  upfront_rental: 'Upfront Rental',
};

const formatMoney = (amount: number | null | undefined, currency?: string | null) => {
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
  const code = (currency || 'EUR').toUpperCase();
  return `${symbols[code] || code + ' '}${(amount || 0).toFixed(2)}`;
};

function describeDeal(deal: VenueInvite['deal']): string {
  const label = deal.model ? DEAL_LABELS[deal.model] || deal.model : 'To be agreed';
  if (deal.value === null || deal.value === undefined) return label;
  if (deal.model === 'revenue_share') return `${label} — ${deal.value}% of ticket revenue`;
  if (deal.model === 'fixed_fee') return `${label} — ${formatMoney(deal.value, deal.currency)} per ticket`;
  return `${label} — ${formatMoney(deal.value, deal.currency)}`;
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export default function VenueInvitePage() {
  const [, params] = useRoute("/venue-invite/:token");
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const token = params?.token;
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);

  const { data: invite, isLoading, error } = useQuery<VenueInvite>({
    queryKey: ["/api/venue-invites", token],
    enabled: !!token,
  });

  // Claiming creates the venue from the details the organiser entered and links
  // it to the event; the money terms are confirmed by the accept step after.
  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/venue-invites/${token}/claim`, {});
      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/venue-invites", token] });
      try {
        const acceptRes = await apiRequest("POST", `/api/venue/offers/${data.experienceId}/accept`, {});
        const accepted = await acceptRes.json();
        if (accepted.requiresPayment && accepted.checkoutUrl) {
          window.location.href = accepted.checkoutUrl;
          return;
        }
        toast({
          title: "Deal confirmed",
          description: "You're hosting this event. It's now live.",
        });
      } catch (acceptError: any) {
        toast({
          title: "Space claimed",
          description: "Confirm the offer from your venue dashboard to finish.",
        });
      }
      setLocation("/venue-dashboard");
    },
    onError: (err: any) => {
      toast({
        title: "Could not claim this venue",
        description: readableError(err),
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/venue-invites/${token}/decline`, { reason: declineReason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/venue-invites", token] });
      toast({ title: "Invitation declined", description: "We've let the organiser know." });
      setShowDecline(false);
    },
    onError: (err: any) => {
      toast({ title: "Could not decline", description: readableError(err), variant: "destructive" });
    },
  });

  if (isLoading || authLoading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-gray-600">Opening your invitation…</p>
        </div>
      </Shell>
    );
  }

  if (error || !invite) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h1 className="text-xl font-semibold text-gray-900" data-testid="invite-invalid">
              This invitation link isn't valid
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              It may have been withdrawn or already used. Ask the organiser to send a new one.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const organiser = [invite.creator?.firstName, invite.creator?.lastName].filter(Boolean).join(" ") || "The organiser";
  const experience = invite.experience;

  if (invite.status === 'declined') {
    return (
      <Shell>
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h1 className="text-xl font-semibold text-gray-900" data-testid="invite-declined">
              You've declined this invitation
            </h1>
            <p className="mt-2 text-sm text-gray-600">{organiser} has been notified.</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (invite.status === 'expired') {
    return (
      <Shell>
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h1 className="text-xl font-semibold text-gray-900" data-testid="invite-expired">
              This invitation has expired
            </h1>
            <p className="mt-2 text-sm text-gray-600">Ask {organiser} to send it again.</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-2 text-sm font-medium text-primary">
        <Handshake className="h-4 w-4" />
        Private venue invitation
      </div>

      <h1 className="text-3xl font-bold text-gray-950" data-testid="invite-heading">
        {organiser} wants to host at {invite.venue.name || 'your venue'}
      </h1>
      <p className="mt-2 max-w-2xl text-gray-600">
        Review the event and the proposed deal below. Claiming your space creates your venue
        profile — prefilled with what {organiser} entered — so you can manage bookings from
        your own dashboard.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card data-testid="invite-event-card">
          <CardHeader>
            <CardTitle className="text-lg">The event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {experience?.coverImageUrl && (
              <img
                src={normalizeImageUrl(experience.coverImageUrl) || ''}
                alt={experience.title}
                className="h-44 w-full rounded-lg object-cover"
              />
            )}
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{experience?.title}</h3>
              {experience?.shortDescription && (
                <p className="mt-1 text-sm text-gray-600">{experience.shortDescription}</p>
              )}
            </div>

            <Separator />

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
                <span>
                  {experience?.startDate && formatDate(experience.startDate)}
                  {experience?.endDate && experience.endDate !== experience.startDate
                    ? ` – ${formatDate(experience.endDate)}`
                    : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{experience?.location}</span>
              </div>
              {experience?.maxParticipants ? (
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>Up to {experience.maxParticipants} guests</span>
                </div>
              ) : null}
              {experience?.requireMinimumParticipants && experience.minimumParticipants ? (
                <Badge variant="secondary" className="mt-1">
                  Confirms at {experience.minimumParticipants} participants
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-primary/30 bg-primary/5" data-testid="invite-deal-card">
            <CardHeader>
              <CardTitle className="text-lg">The proposed deal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-2xl font-bold text-gray-950" data-testid="invite-deal-summary">
                {describeDeal(invite.deal)}
              </p>
              <p className="text-sm text-gray-600">
                Nothing is agreed until you accept. You can decline and the organiser will be told.
              </p>
            </CardContent>
          </Card>

          <Card data-testid="invite-venue-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-gray-500" />
                Your space
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">{invite.venue.name || 'Unnamed venue'}</p>
              {invite.venue.address && <p>{invite.venue.address}</p>}
              {invite.venue.capacity ? <p>Capacity: {invite.venue.capacity}</p> : null}
              <p className="text-xs text-gray-500">
                Sent to {invite.email}. You can edit every detail after claiming.
              </p>
            </CardContent>
          </Card>

          {!isAuthenticated ? (
            <Card>
              <CardContent className="space-y-3 py-6">
                <p className="text-sm text-gray-700">
                  Create your free venue account (or sign in) to claim this space and answer the offer.
                </p>
                <Button
                  className="w-full"
                  onClick={() => {
                    const returnTo = `/venue-invite/${token}`;
                    window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
                  }}
                  data-testid="invite-signin"
                >
                  Sign in or create an account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ) : showDecline ? (
            <Card>
              <CardContent className="space-y-3 py-6">
                <p className="text-sm font-medium text-gray-900">Let the organiser know why (optional)</p>
                <Textarea
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  placeholder="We're already booked that weekend…"
                  rows={3}
                  data-testid="invite-decline-reason"
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => declineMutation.mutate()}
                    disabled={declineMutation.isPending}
                    data-testid="invite-decline-confirm"
                  >
                    {declineMutation.isPending ? 'Sending…' : 'Decline invitation'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowDecline(false)}>
                    Back
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <Button
                size="lg"
                className="w-full"
                onClick={() => claimMutation.mutate()}
                disabled={claimMutation.isPending}
                data-testid="invite-claim"
              >
                {claimMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up your venue…
                  </>
                ) : (
                  <>Claim my venue &amp; accept this deal</>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowDecline(true)}
                data-testid="invite-decline"
              >
                Decline
              </Button>
              {experience && (
                <Link href={`/e/${experience.slug || experience.id}`}>
                  <Button variant="ghost" className="w-full">
                    See the public event page
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

// apiRequest rejects with "<status>: <raw body>"; pull the readable part out.
function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      if (typeof parsed?.message === 'string') return parsed.message;
    } catch {
      // fall through
    }
  }
  return raw || 'Please try again.';
}
