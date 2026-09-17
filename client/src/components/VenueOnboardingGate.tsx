import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Building2, Loader2 } from "lucide-react";

/**
 * The Venue Profile gate.
 *
 * Creators already have a hard onboarding gate — "Complete this public profile
 * before creating an experience" — and venues did not. A new venue signup
 * landed on the metrics dashboard: nine tabs, every figure reading zero, with
 * "List Venue" sitting there as a discoverable button rather than the required
 * next step. Most never found it, and the ones who started the seven-step
 * builder could bounce back to the dashboard or the Day Event / Multi-Day split
 * page halfway through and lose their place.
 *
 * Two cases, one gate:
 *
 *  - **A new signup** has no listing at all, and is routed into step 1.
 *  - **An account created before this flow existed** has a listing stuck in
 *    `draft`, and was never prompted about it at all. It gets the same nudge on
 *    next login — which is the half of this that was missing entirely, since
 *    creators were grandfathered and venues were not.
 *
 * Deliberately not applied to the builder itself. A gate that redirects the
 * builder into the builder is a redirect loop, and a venue part-way through
 * needs to be able to finish.
 */
export default function VenueOnboardingGate({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const isVenueAccount = user?.role === "venue_provider";

  const { data: venues, isLoading, isSuccess } = useQuery<any[]>({
    queryKey: ["/api/user/venues"],
    enabled: isAuthenticated && isVenueAccount,
  });

  const list = Array.isArray(venues) ? venues : [];
  // "Submitted" rather than "approved": waiting on a review is a finished
  // profile, and holding someone at the gate until an admin gets to it would
  // make approval a prerequisite for using the account at all.
  const hasSubmittedProfile = list.some((venue: any) => venue?.status && venue.status !== "draft");
  const hasDraftOnly = list.length > 0 && !hasSubmittedProfile;
  const needsProfile = isVenueAccount && isSuccess && !hasSubmittedProfile;

  // A brand-new account has nothing to resume, so it is routed straight in
  // rather than shown a card explaining that it should be. An account with a
  // draft gets the card, because it has something half-written and a bare
  // redirect would lose the sense that it is being picked up again.
  useEffect(() => {
    if (!needsProfile || hasDraftOnly) return;
    navigate("/venues/new");
  }, [needsProfile, hasDraftOnly, navigate]);

  if (authLoading || (isVenueAccount && isLoading)) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (needsProfile) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="mx-auto max-w-xl px-4 py-16">
          <Card>
            <CardContent className="py-10 text-center">
              <Building2 className="mx-auto mb-4 h-10 w-10 text-primary" />
              <h1 className="text-xl font-bold text-gray-950">
                Complete your venue profile before listing dates
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
                {hasDraftOnly
                  ? "You have a profile saved as a draft. Organisers can't find you or send you a deal until it's submitted — picking up where you left off takes a couple of minutes."
                  : "Organisers find spaces through this profile, so there's nothing for your dashboard to show until it exists."}
              </p>
              <Button
                className="mt-6"
                onClick={() => navigate("/venues/new")}
                data-testid="button-complete-venue-profile"
              >
                {hasDraftOnly ? "Finish my profile" : "Create venue profile"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
