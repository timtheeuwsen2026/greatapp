import { lazy, Suspense, useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bed, Calendar, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import Navigation from "@/components/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";

const EventBuilder = lazy(() => import("@/components/EventBuilder"));

function preloadEventBuilder() {
  void import("@/components/EventBuilder");
}

function BuilderLoading({ label = "Opening builder..." }: { label?: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm font-medium text-gray-600">{label}</p>
    </div>
  );
}

export default function EventBuilderPage() {
  const [, params] = useRoute("/event-builder/:draftId?");
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [openingType, setOpeningType] = useState<"one-day" | "multi-day" | null>(null);
  
  // Support both path parameter (/event-builder/:id) and query parameter (?edit=id)
  const urlParams = new URLSearchParams(window.location.search);
  const editExperienceId = urlParams.get('edit');
  const selectedType = urlParams.get('type');
  const draftId = params?.draftId || editExperienceId || undefined;
  const initialExperienceType = selectedType === 'multi-day'
    ? 'multi-day'
    : (selectedType === 'one-day' || selectedType === 'single-day')
      ? 'one-day'
      : undefined;
  const shouldCheckCreatorProfile = !!draftId || !!initialExperienceType;

  // Check for creator profile completion
  const { data: creatorProfile, isLoading: profileLoading } = useQuery({ 
    queryKey: ['/api/creator-profile'],
    enabled: isAuthenticated
  });

  useEffect(() => {
    if (!draftId && !initialExperienceType) {
      preloadEventBuilder();
    }
  }, [draftId, initialExperienceType]);

  const openBuilder = (type: "one-day" | "multi-day") => {
    if (openingType) return;
    setOpeningType(type);
    setLocation(`/event-builder?type=${type}`);
  };

  // Show loading state during authentication and profile checks
  if (authLoading || (shouldCheckCreatorProfile && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show profile setup prompt if no creator profile exists or profile is not completed
  if (shouldCheckCreatorProfile && isAuthenticated && (!creatorProfile || !(creatorProfile as any)?.completed)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Navigation />
        <div className="pt-20 pb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                Complete Your Creator Profile
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                To access the experience builder, you need to complete your creator profile setup first.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  onClick={() => setLocation('/creator/profile-setup')}
                  data-testid="button-complete-creator-profile"
                >
                  Complete Creator Profile
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={() => setLocation('/creator/earnings')}
                  data-testid="button-learn-more"
                >
                  Learn More
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!draftId && !initialExperienceType) {
    return (
      <ProtectedRoute requiredRole="creator">
        <div className="min-h-screen bg-white">
          <Navigation />
          <main className="pt-24 pb-16">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <div className="mb-8 max-w-3xl">
                <h1 className="text-3xl font-bold text-gray-950">What are you creating?</h1>
                <p className="mt-3 text-base leading-7 text-gray-600">
                  Choose the format first so the builder opens the right day-event or trip workflow.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  autoFocus
                  onMouseEnter={preloadEventBuilder}
                  onFocus={preloadEventBuilder}
                  onClick={() => openBuilder('one-day')}
                  disabled={openingType !== null}
                  aria-busy={openingType === 'one-day'}
                  className="group rounded-lg border-2 border-primary bg-primary p-6 text-left text-white shadow-sm transition hover:bg-primary/95 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-wait disabled:opacity-90"
                  data-testid="button-single-day-event"
                >
                  <div className="flex items-start justify-between gap-4">
                    <Calendar className="mt-1 h-6 w-6 shrink-0" />
                    {openingType === 'one-day' ? (
                      <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
                    ) : (
                      <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
                    )}
                  </div>
                  <div className="mt-6 text-xl font-semibold">
                    {openingType === 'one-day' ? 'Opening Day Event...' : 'Single-Day Event'}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/90">
                    Pilot flow: one date, start/end time, standing capacity, and MVG threshold. No rooms or beds.
                  </p>
                </button>

                <button
                  type="button"
                  onMouseEnter={preloadEventBuilder}
                  onFocus={preloadEventBuilder}
                  onClick={() => openBuilder('multi-day')}
                  disabled={openingType !== null}
                  aria-busy={openingType === 'multi-day'}
                  className="group rounded-lg border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
                  data-testid="button-multi-day-trip"
                >
                  <div className="flex items-start justify-between gap-4 text-primary">
                    <Bed className="mt-1 h-6 w-6 shrink-0" />
                    {openingType === 'multi-day' ? (
                      <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primary/70 border-t-transparent" />
                    ) : (
                      <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
                    )}
                  </div>
                  <div className="mt-6 text-xl font-semibold text-gray-950">
                    {openingType === 'multi-day' ? 'Opening Trip...' : 'Multi-Day Trip'}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-gray-600">
                    Start date to end date, sleeping capacity, rooms, services, and amenities.
                  </p>
                </button>
              </div>

              <div className="mt-8">
                <Button variant="outline" onClick={() => setLocation('/creator')}>
                  Back to Dashboard
                </Button>
              </div>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRole="creator">
      <div className="min-h-screen bg-white">
        <Navigation />
        <Suspense fallback={<BuilderLoading />}>
          <EventBuilder
            draftId={draftId}
            initialExperienceType={initialExperienceType}
            onComplete={(experienceId) => {
              // Handle successful submission
              window.location.href = `/experience/${experienceId}`;
            }}
          />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}
