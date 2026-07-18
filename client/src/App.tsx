import { lazy, Suspense, useEffect, useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { AuthProvider } from "@/contexts/AuthContext";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ArrowRight, Bed, Calendar } from "lucide-react";
import AuthPage from "@/pages/auth";
import ResetPasswordPage from "@/pages/reset-password";
import Home from "@/pages/home";
import ExperienceDetails from "@/pages/experience-details";
import AdminDashboard from "@/pages/admin-dashboard";
import CreatorDashboard from "@/pages/creator-dashboard";
import CommunityHub from "@/pages/community-hub";
import VenueDashboard from "@/pages/venue-dashboard";
import ServiceProviderDashboard from "@/pages/service-provider-dashboard";
import SimpleCreatorProfileSetup from "@/pages/simple-creator-profile-setup";
import ParticipantProfileSetup from "@/pages/participant-profile-setup";
import Checkout from "@/pages/checkout";
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
import Messages from "@/pages/messages";
import { PersistentChatDrawer } from "@/components/PersistentChatDrawer";
import EmailPreferencesPage from "@/pages/email-preferences";
import UnsubscribePage from "@/pages/unsubscribe";

const VenueProfileSetup = lazy(() => import("@/pages/venue-profile-setup"));

function preloadVenueProfileSetup() {
  void import("@/pages/venue-profile-setup");
}

function VenueFormLoading({ label = "Opening venue form..." }: { label?: string }) {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>
    </div>
  );
}

function VenueProfileSetupRoute() {
  return (
    <Suspense fallback={<VenueFormLoading />}>
      <VenueProfileSetup />
    </Suspense>
  );
}

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
    const [openingType, setOpeningType] = useState<"daytime" | "multi_day" | null>(null);

    useEffect(() => {
      if (!editVenueId && !selectedVenueType) {
        preloadVenueProfileSetup();
      }
    }, [editVenueId, selectedVenueType]);

    const openVenueSetup = (venueType: "daytime" | "multi_day") => {
      if (openingType) return;
      setOpeningType(venueType);
      setLocation(`/venues/new?venueType=${venueType}`);
    };

    if (editVenueId || selectedVenueType) {
      return <VenueProfileSetupRoute />;
    }

    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <main className="pt-24 pb-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 max-w-3xl">
              <h1 className="text-3xl font-bold text-gray-950">What kind of space are you listing?</h1>
              <p className="mt-3 text-base leading-7 text-gray-600">
                Choose the listing type first so the venue form shows the right capacity, room, and availability fields.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                autoFocus
                onMouseEnter={preloadVenueProfileSetup}
                onFocus={preloadVenueProfileSetup}
                onClick={() => openVenueSetup("daytime")}
                disabled={openingType !== null}
                aria-busy={openingType === "daytime"}
                className="group rounded-lg border-2 border-primary bg-primary p-6 text-left text-white shadow-sm transition hover:bg-primary/95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-wait disabled:opacity-90"
                data-testid="button-day-event-space"
              >
                <div className="flex items-start justify-between gap-4">
                  <Calendar className="mt-1 h-6 w-6 shrink-0" />
                  {openingType === "daytime" ? (
                    <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                  ) : (
                    <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
                  )}
                </div>
                <div className="mt-6 text-xl font-semibold">
                  {openingType === "daytime" ? "Opening Day Event Space..." : "Day Event Space"}
                </div>
                <p className="mt-3 text-sm leading-6 text-white/90">
                  Studios, coworking spaces, coffee shops, pop-ups, workshops, and one-day event venues.
                </p>
              </button>

              <button
                type="button"
                onMouseEnter={preloadVenueProfileSetup}
                onFocus={preloadVenueProfileSetup}
                onClick={() => openVenueSetup("multi_day")}
                disabled={openingType !== null}
                aria-busy={openingType === "multi_day"}
                className="group rounded-lg border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
                data-testid="button-trip-location"
              >
                <div className="flex items-start justify-between gap-4 text-primary">
                  <Bed className="mt-1 h-6 w-6 shrink-0" />
                  {openingType === "multi_day" ? (
                    <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary/70 border-t-transparent" />
                  ) : (
                    <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
                  )}
                </div>
                <div className="mt-6 text-xl font-semibold text-gray-950">
                  {openingType === "multi_day" ? "Opening Trip Location..." : "Multi-Day Trip Location"}
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  Retreat centers, villas, hotels, lodges, and overnight locations with rooms or beds.
                </p>
              </button>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => setLocation('/venue-dashboard')}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-primary hover:text-primary"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  };

  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/email-preferences" component={EmailPreferencesPage} />
      <Route path="/unsubscribe" component={UnsubscribePage} />
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
      <Route path="/messages" component={Messages} />
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
      <Route path="/participant-profile-setup" component={ParticipantProfileSetup} />
      <Route path="/venue-profile-setup" component={VenueProfileSetupRoute} />
      <Route path="/service-provider-setup" component={ServiceProviderSetup} />
      
      {/* Legacy Routes - Redirect to standardized routes */}
      <Route path="/creator/setup" component={SimpleCreatorProfileSetup} />
      <Route path="/conversational-creator-setup" component={SimpleCreatorProfileSetup} />
      <Route path="/conversational-creator-setup-v2" component={SimpleCreatorProfileSetup} />
      <Route path="/participant/setup" component={ParticipantProfileSetup} />
      <Route path="/conversational-profile" component={RedirectToCreatorProfileSetup} />
      <Route path="/venue/setup" component={VenueProfileSetupRoute} />
      <Route path="/service-provider/setup" component={ServiceProviderSetup} />
      
      <Route path="/checkout/:id" component={Checkout} />
      <Route path="/booking-success" component={BookingSuccess} />
      <Route path="/recruit" component={RecruitSquad} />
      <Route path="/community/profile/:userId" component={CommunityProfile} />
      <Route path="/event/:id" component={EventInvite} />
      <Route path="/creator" component={CreatorHome} />
      <Route path="/creator/earnings" component={CreatorEarnings} />
      <Route path="/creator/profile-setup" component={SimpleCreatorProfileSetup} />
      <Route path="/venue/profile-setup" component={VenueProfileSetupRoute} />
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
            <PersistentChatDrawer />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
