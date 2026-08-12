import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import Navigation from "@/components/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Megaphone, Calendar, MapPin, CheckCircle, XCircle, Loader2, ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeImageUrl } from "@/lib/utils";
import { type InviteTicketLine } from "@shared/inviteContext";
import { InviteValueContext } from "@/components/InviteValueContext";

type PartnerInvite = {
  status: string;
  pendingActionBy: string | null;
  dealType: string;
  terms: Record<string, any>;
  partnerName: string | null;
  email: string | null;
  claimed: boolean;
  dealSummary: string;
  experience: {
    id: string;
    slug: string | null;
    title: string;
    shortDescription: string | null;
    coverImageUrl: string | null;
    startDate: string;
    endDate: string;
    location: string;
    currency: string | null;
    capacity: number | null;
    ticketTypes: InviteTicketLine[];
  } | null;
  creator: { firstName: string | null; lastName: string | null } | null;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// apiRequest rejects with "<status>: <raw body>"; pull the readable part out.
function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      if (typeof parsed?.message === "string") return parsed.message;
    } catch { /* fall through */ }
  }
  return raw || "Please try again.";
}

export default function PartnerInvitePage() {
  const [, params] = useRoute("/partner-invite/:token");
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const token = params?.token;
  const [resolved, setResolved] = useState<"accepted" | "declined" | null>(null);

  const { data: invite, isLoading, error } = useQuery<PartnerInvite>({
    queryKey: ["/api/partner-invites", token],
    enabled: !!token,
  });

  // Claim links the deal to this account, then the existing offer endpoints
  // (the same ones the promoter dashboard uses) do accept/decline.
  const respond = useMutation({
    mutationFn: async (action: "accept" | "decline") => {
      const claimRes = await apiRequest("POST", `/api/partner-invites/${token}/claim`, {});
      const { dealId } = await claimRes.json();
      const res = await apiRequest("POST", `/api/promoter/offers/${dealId}/${action}`, {});
      return { action, data: await res.json() };
    },
    onSuccess: ({ action, data }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/partner-invites", token] });
      queryClient.invalidateQueries({ queryKey: ["/api/promoter/offers"] });
      if (action === "accept" && data.requiresPayment && data.checkoutUrl) {
        // Financial sponsorship: the partner pays via Stripe to seal the deal.
        window.location.href = data.checkoutUrl;
        return;
      }
      setResolved(action === "accept" ? "accepted" : "declined");
      toast({
        title: action === "accept" ? "Partnership confirmed" : "Offer declined",
        description: action === "accept"
          ? "The deal is live — find it in your promoter dashboard."
          : "The organiser has been told.",
      });
      if (action === "accept") setLocation("/promoter");
    },
    onError: (err: any) => {
      toast({ title: "Something went wrong", description: readableError(err), variant: "destructive" });
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
            <h1 className="text-xl font-semibold text-gray-900" data-testid="partner-invite-invalid">
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
  const alreadyResolved = resolved || (invite.status === "accepted" ? "accepted" : invite.status === "declined" ? "declined" : null);

  if (alreadyResolved) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className={`mx-auto mb-4 h-12 w-12 ${alreadyResolved === "accepted" ? "text-green-500" : "text-gray-400"}`} />
            <h1 className="text-xl font-semibold text-gray-900" data-testid="partner-invite-resolved">
              {alreadyResolved === "accepted" ? "This partnership is confirmed" : "This offer was declined"}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {alreadyResolved === "accepted"
                ? "Manage it from your promoter dashboard."
                : `${organiser} has been notified.`}
            </p>
            {alreadyResolved === "accepted" && (
              <Link href="/promoter">
                <Button className="mt-5">Open Promoter Dashboard</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-2 text-sm font-medium text-primary">
        <Megaphone className="h-4 w-4" />
        Private partnership invitation
      </div>

      <h1 className="text-3xl font-bold text-gray-950" data-testid="partner-invite-heading">
        {organiser} wants to partner with {invite.partnerName || "you"}
      </h1>
      <p className="mt-2 max-w-2xl text-gray-600">
        Review the event and the proposed deal. Accepting links this partnership to your
        account so you can track it — and your referrals — from your promoter dashboard.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card data-testid="partner-invite-event-card">
          <CardHeader>
            <CardTitle className="text-lg">The event</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {experience?.coverImageUrl && (
              <img
                src={normalizeImageUrl(experience.coverImageUrl) || ""}
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
                    : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{experience?.location}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-primary/30 bg-primary/5" data-testid="partner-invite-deal-card">
            <CardHeader>
              <CardTitle className="text-lg">The proposed deal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xl font-bold text-gray-950" data-testid="partner-invite-deal-summary">
                {invite.dealSummary}
              </p>

              {/* A commission per ticket is only worth what the tickets cost
                  and how many of them there are, so both go on the page. */}
              <InviteValueContext
                capacity={experience?.capacity}
                ticketTypes={experience?.ticketTypes}
              />

              <p className="text-sm text-gray-600">
                Nothing is agreed until you accept. Declining tells the organiser.
              </p>
            </CardContent>
          </Card>

          {!isAuthenticated ? (
            <Card>
              <CardContent className="space-y-3 py-6">
                <p className="text-sm text-gray-700">
                  Create your free account (or sign in) to accept this partnership.
                  {invite.email ? ` The invitation was sent to ${invite.email}.` : ""}
                </p>
                <Button
                  className="w-full"
                  onClick={() => {
                    const returnTo = `/partner-invite/${token}`;
                    window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
                  }}
                  data-testid="partner-invite-signin"
                >
                  Sign in or create an account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <Button
                size="lg"
                className="w-full"
                onClick={() => respond.mutate("accept")}
                disabled={respond.isPending}
                data-testid="partner-invite-accept"
              >
                {respond.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirming…
                  </>
                ) : (
                  <>Accept this partnership</>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => respond.mutate("decline")}
                disabled={respond.isPending}
                data-testid="partner-invite-decline"
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
