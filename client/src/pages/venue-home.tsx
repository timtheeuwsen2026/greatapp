import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CollabOpportunitiesCard from "@/components/CollabOpportunitiesCard";
import AccessDenied from "@/components/AccessDenied";
import { useVenueAuth } from "@/hooks/useRoleAuth";
import {
  Building2,
  Plus,
  DollarSign,
  CheckCircle,
  X,
} from "lucide-react";

/**
 * Venue Home — the landing the venue side never had.
 *
 * A creator arriving from the account menu lands on /creator: a short page of
 * shortcut cards, with the full tabbed dashboard one click further in. A venue
 * owner was dropped straight into the tabbed dashboard instead — nine tabs and
 * a wall of stat cards, all reading zero for someone who had just signed up.
 *
 * This gives the two sides the same shape.
 */
export default function VenueHome() {
  const [location] = useLocation();
  const { isAuthenticated, hasRequiredRole, isLoading: authLoading } = useVenueAuth();
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('profileCompleted') === 'true') {
      setShowSuccessBanner(true);
    }
  }, [location]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = '/api/login';
    }
  }, [authLoading, isAuthenticated]);

  // Listing status drives the third card, the same way profile completion does
  // on the creator side.
  const { data: venues = [] } = useQuery<any[]>({
    queryKey: ['/api/user/venues'],
    enabled: isAuthenticated,
  });

  const hasVenue = venues.length > 0;
  const hasApprovedVenue = venues.some((venue: any) => venue.status === 'approved');

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <p className="text-lg text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  // Same gate as /venue-dashboard. Without it this page showed venue-only cards
  // and live counts to whatever role happened to be active.
  if (!authLoading && !hasRequiredRole) {
    // isAuthenticated matters: without it the component defaults to "you must
    // be logged in", which tells a signed-in creator their session broke.
    return <AccessDenied requiredRole="venue_provider" isAuthenticated />;
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {showSuccessBanner && (
          <Alert className="mb-8 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              🎉 Your venue listing is complete. Organisers can now find and approach you.
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 w-6 p-0 text-green-600 hover:text-green-800"
                onClick={() => setShowSuccessBanner(false)}
                data-testid="button-close-success-banner"
              >
                <X className="h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Venue Home</h1>
          <p className="text-lg text-gray-600">
            Welcome to your venue dashboard. Choose an action to get started.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/venue-dashboard">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle className="text-xl">Venue Dashboard</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-center" data-testid="text-venue-dashboard-desc">
                  Offers, deals, bookings and availability for your spaces.
                </p>
              </CardContent>
            </Link>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/venues/new">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Plus className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle className="text-xl">Add New Venue</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-center" data-testid="text-add-venue-desc">
                  List another space and start receiving offers for it.
                </p>
              </CardContent>
            </Link>
          </Card>

          <Card
            className={`hover:shadow-lg transition-shadow cursor-pointer ${
              hasApprovedVenue ? 'border-green-200 bg-green-50' : ''
            }`}
          >
            <Link href={hasVenue ? "/venue-dashboard?tab=venues" : "/venues/new"}>
              <CardHeader className="text-center">
                <div
                  className={`mx-auto w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                    hasApprovedVenue ? 'bg-green-100' : 'bg-amber-100'
                  }`}
                >
                  {hasApprovedVenue ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <Building2 className="h-6 w-6 text-amber-600" />
                  )}
                </div>
                <CardTitle className="text-xl">
                  {hasApprovedVenue ? "Listing Live" : hasVenue ? "Listing Pending" : "List Your Venue"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-center" data-testid="text-listing-status-desc">
                  {hasApprovedVenue
                    ? "Your space is discoverable by organisers looking to host."
                    : hasVenue
                      ? "Waiting on admin approval before organisers can find you."
                      : "You need a listed venue before you can take offers."}
                </p>
              </CardContent>
            </Link>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <Link href="/venue-dashboard?tab=payouts">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
                  <DollarSign className="h-6 w-6 text-emerald-600" />
                </div>
                <CardTitle className="text-xl">Earnings & Payouts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-center" data-testid="text-venue-earnings-desc">
                  What you are owed across agreed deals, and when it lands.
                </p>
              </CardContent>
            </Link>
          </Card>

          {/* The cross-role feed. Offered here rather than forced on login: this
              account may also be a participant or an organiser, and a venue
              checking today's bookings should not be interrupted by it. */}
          <CollabOpportunitiesCard />
        </div>
      </div>
    </div>
  );
}
