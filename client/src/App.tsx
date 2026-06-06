import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { AuthProvider } from "@/contexts/AuthContext";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AuthPage from "@/pages/auth";
import Home from "@/pages/home";
import ExperienceDetails from "@/pages/experience-details";
import AdminDashboard from "@/pages/admin-dashboard";
import CreatorDashboard from "@/pages/creator-dashboard";
import CommunityHub from "@/pages/community-hub";
import VenueDashboard from "@/pages/venue-dashboard";
import ServiceProviderDashboard from "@/pages/service-provider-dashboard";
import SimpleCreatorProfileSetup from "@/pages/simple-creator-profile-setup";
import ParticipantProfileSetup from "@/pages/participant-profile-setup";
import ConversationalProfile from "@/pages/conversational-profile";
import Checkout from "@/pages/checkout";
import VenueProfileSetup from "@/pages/venue-profile-setup";
import ServiceProviderSetup from "@/pages/service-provider-setup";
import Venues from "@/pages/venues";
import Services from "@/pages/services";
import Community from "@/pages/community";
import CommunityProfile from "@/pages/community-profile";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Experiences from "@/pages/experiences";
import AITravel from "@/pages/ai-travel";
import NotFound from "@/pages/not-found";
import WhyUs from "@/pages/why-us";
import UserFlowDemo from "@/pages/user-flow-demo";
import ProfileSetupDemo from "@/pages/profile-setup-demo";
import ProfileSetup from "@/pages/profile-setup";
import CreatorSetupDemo from "@/pages/creator-setup-demo";
import CreatorDemo from "@/pages/creator-demo";
import Creator from "@/pages/creator";
import RevenueCalculatorDemo from "@/pages/revenue-calculator-demo";
import ModularPricingDemo from "@/pages/modular-pricing-demo";
import RoleBasedPricingDemo from "@/pages/role-based-pricing-demo";
import HowItWorks from "@/pages/how-it-works";
import Profile from "@/pages/profile";
import Bookings from "@/pages/bookings";
import TravelerBookings from "@/pages/TravelerBookings";
import BookingSuccess from "@/pages/booking-success";
import RecruitSquad from "@/pages/recruit-squad";
import EventInvite from "@/pages/event-invite";
import CreatorHome from "@/pages/creator-home";
import CreatorEarnings from "@/pages/creator-earnings";
import MyExperiences from "@/pages/my-experiences";
import UserDashboard from "@/pages/user-dashboard";
import RoleSwitchTest from "@/pages/role-switch-test";
import EventBuilderPage from "@/pages/event-builder";
import ReservationsDashboard from "@/pages/reservations";
import PublicVenuePage from "@/pages/public-venue-page";
import PublicEventPage from "@/pages/public-event-page";
import About from "@/pages/about";
import AdminAPIConsole from "@/pages/admin-api-console";
import PromoterDashboard from "@/pages/promoter";
import PromoterProfileSetup from "@/pages/promoter-profile-setup";
import PromoterExperiencePool from "@/pages/promoter-experience-pool";
import AdminPromotersPage from "@/pages/admin-promoters";
import AdminPromoterDetailPage from "@/pages/admin-promoter-detail";
import { usePromoterAttribution } from "@/hooks/usePromoterAttribution";
import Navigation from "@/components/navigation";

function Router() {
  const [, setLocation] = useLocation();

  // Capture promoter attribution from ?ref= URL params on any page
  usePromoterAttribution();

  // Redirect components - use useEffect to avoid React render warnings
  const RedirectToEventBuilder = () => {
    useEffect(() => {
      setLocation('/event-builder');
    }, []);
    return <div className="flex items-center justify-center min-h-screen">Redirecting to Event Builder...</div>;
  };

  const RedirectToCreatorProfileSetup = () => {
    useEffect(() => {
      setLocation('/creator/profile-setup');
    }, []);
    return <div className="flex items-center justify-center min-h-screen">Redirecting...</div>;
  };

  const RedirectToCreator = () => {
    useEffect(() => {
      setLocation('/creator');
    }, []);
    return <div className="flex items-center justify-center min-h-screen">Redirecting...</div>;
  };

  const RedirectToExperiences = () => {
    useEffect(() => {
      setLocation('/experiences');
    }, []);
    return <div className="flex items-center justify-center min-h-screen">Redirecting...</div>;
  };

  const VenueListingTypeGate = () => {
    const params = new URLSearchParams(window.location.search);
    const editVenueId = params.get('edit');
    const selectedVenueType = params.get('venueType') || params.get('type');

    if (editVenueId || selectedVenueType) {
      return <VenueProfileSetup />;
    }

    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setLocation('/venue-dashboard');
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>What kind of space are you listing?</DialogTitle>
              <DialogDescription>
                Choose the listing type first so the venue form shows the right capacity, room, and availability fields.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setLocation('/venues/new?venueType=daytime')}
                className="rounded-lg border border-primary/20 bg-white p-5 text-left shadow-sm transition hover:border-primary hover:shadow-md"
                data-testid="button-day-event-space"
              >
                <div className="text-lg font-semibold text-gray-900">Day Event Space</div>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Studios, coworking spaces, pop-ups, workshops, and one-day event venues.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLocation('/venues/new?venueType=multi_day')}
                className="rounded-lg border border-primary/20 bg-white p-5 text-left shadow-sm transition hover:border-primary hover:shadow-md"
                data-testid="button-trip-location"
              >
                <div className="text-lg font-semibold text-gray-900">Trip Location</div>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Retreat centers, villas, hotels, lodges, and overnight locations with rooms or beds.
                </p>
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/" component={Home} />

      {/* Homepage CTA Routes - Redirects */}
      <Route path="/create-trip" component={RedirectToEventBuilder} />
      <Route path="/trips" component={RedirectToExperiences} />
      <Route path="/venues/new" component={VenueListingTypeGate} />

      <Route path="/experiences" component={Experiences} />
      <Route path="/experience/:id" component={ExperienceDetails} />
      <Route path="/experiences/:id" component={ExperienceDetails} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/creator-dashboard" component={CreatorDashboard} />
      <Route path="/community-hub" component={CommunityHub} />
      <Route path="/venue-dashboard" component={VenueDashboard} />
      <Route path="/service-provider-dashboard" component={ServiceProviderDashboard} />
      <Route path="/promoter" component={PromoterDashboard} />
      <Route path="/promoter/profile-setup" component={PromoterProfileSetup} />
      <Route path="/my-referrals" component={() => { window.location.replace('/my-impact'); return null; }} />
      <Route path="/my-impact" component={PromoterDashboard} />
      <Route path="/promoter/experience-pool" component={PromoterExperiencePool} />
      <Route path="/reservations" component={ReservationsDashboard} />
      {/* Standardized Setup Page Routes */}
      <Route path="/creator-profile-setup" component={SimpleCreatorProfileSetup} />
      <Route path="/participant-profile-setup" component={ConversationalProfile} />
      <Route path="/venue-profile-setup" component={VenueProfileSetup} />
      <Route path="/service-provider-setup" component={ServiceProviderSetup} />
      
      {/* Legacy Routes - Redirect to standardized routes */}
      <Route path="/creator/setup" component={SimpleCreatorProfileSetup} />
      <Route path="/conversational-creator-setup" component={SimpleCreatorProfileSetup} />
      <Route path="/conversational-creator-setup-v2" component={SimpleCreatorProfileSetup} />
      <Route path="/participant/setup" component={ConversationalProfile} />
      <Route path="/conversational-profile" component={RedirectToCreatorProfileSetup} />
      <Route path="/venue/setup" component={VenueProfileSetup} />
      <Route path="/service-provider/setup" component={ServiceProviderSetup} />
      
      <Route path="/checkout/:id" component={Checkout} />
      <Route path="/booking-success" component={BookingSuccess} />
      <Route path="/recruit" component={RecruitSquad} />
      <Route path="/community/profile/:userId" component={CommunityProfile} />
      <Route path="/event/:id" component={EventInvite} />
      <Route path="/creator" component={CreatorHome} />
      <Route path="/creator/earnings" component={CreatorEarnings} />
      <Route path="/creator/profile-setup" component={SimpleCreatorProfileSetup} />
      <Route path="/venue/profile-setup" component={VenueProfileSetup} />
      <Route path="/service/profile-setup" component={ServiceProviderSetup} />
      <Route path="/venues" component={Venues} />
      <Route path="/v/:slug" component={PublicVenuePage} />
      <Route path="/e/:slugOrId" component={PublicEventPage} />
      <Route path="/services" component={Services} />
      
      {/* Event Builder Route */}
      <Route path="/create-experience" component={EventBuilderPage} />
      <Route path="/event-builder/:draftId?" component={EventBuilderPage} />
      
      {/* Legacy routes - redirect to /event-builder */}
      <Route path="/journey-builder" component={RedirectToEventBuilder} />
      <Route path="/journey-builder-complete" component={RedirectToEventBuilder} />
      <Route path="/journey-builder-basic" component={RedirectToEventBuilder} />
      <Route path="/journey-builder-v2" component={RedirectToEventBuilder} />
      <Route path="/create-experience-demo" component={RedirectToEventBuilder} />
      <Route path="/community" component={Community} />
      <Route path="/ai-travel" component={AITravel} />
      <Route path="/why-us" component={WhyUs} />
      <Route path="/user-flow-demo" component={UserFlowDemo} />
      <Route path="/profile-setup-demo" component={ProfileSetupDemo} />
      <Route path="/profile-setup" component={ProfileSetup} />
      <Route path="/creator-setup-demo" component={CreatorSetupDemo} />
      <Route path="/creator-demo">
        <RouteErrorBoundary fallbackRoute="/creator-dashboard" fallbackText="Creator Dashboard">
          <CreatorDemo />
        </RouteErrorBoundary>
      </Route>
      <Route path="/creator-onboarding" component={RedirectToCreator} />
      <Route path="/revenue-calculator-demo" component={RevenueCalculatorDemo} />
      <Route path="/modular-pricing-demo" component={ModularPricingDemo} />
      <Route path="/role-based-pricing-demo" component={RoleBasedPricingDemo} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/profile" component={Profile} />
      <Route path="/bookings" component={Bookings} />
      <Route path="/my-bookings" component={TravelerBookings} />
      <Route path="/my-experiences" component={MyExperiences} />
      <Route path="/user-dashboard" component={UserDashboard} />
      <Route path="/role-switch-test" component={RoleSwitchTest} />
      <Route path="/event-builder" component={EventBuilderPage} />
      <Route path="/event-builder/:draftId" component={EventBuilderPage} />
      <Route path="/about" component={About} />
      <Route path="/admin/api-console" component={AdminAPIConsole} />
      <Route path="/admin/promoters" component={AdminPromotersPage} />
      <Route path="/admin/promoters/:promoterId" component={AdminPromoterDetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary onError={(error, errorInfo) => {
      console.error('App Error Boundary caught:', error, errorInfo);
    }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
