import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import EventBuilder from "@/components/EventBuilder";
import { useAuth } from "@/hooks/useAuth";
import Navigation from "@/components/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function EventBuilderPage() {
  const [, params] = useRoute("/event-builder/:draftId?");
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Support both path parameter (/event-builder/:id) and query parameter (?edit=id)
  const urlParams = new URLSearchParams(window.location.search);
  const editExperienceId = urlParams.get('edit');
  const selectedType = urlParams.get('type');
  const draftId = params?.draftId || editExperienceId || undefined;
  const initialExperienceType = selectedType === 'multi-day' ? 'multi-day' : selectedType === 'one-day' ? 'one-day' : undefined;

  // Check for creator profile completion
  const { data: creatorProfile, isLoading: profileLoading } = useQuery({ 
    queryKey: ['/api/creator-profile'],
    enabled: isAuthenticated
  });

  // Show loading state during authentication and profile checks
  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show profile setup prompt if no creator profile exists or profile is not completed
  if (isAuthenticated && (!creatorProfile || !(creatorProfile as any)?.completed)) {
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
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) {
                setLocation('/creator');
              }
            }}
          >
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>What are you creating?</DialogTitle>
                <DialogDescription>
                  Choose the format first so the builder can show the right dates, capacity, and room fields.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setLocation('/event-builder?type=one-day')}
                  className="rounded-lg border border-primary/20 bg-white p-5 text-left shadow-sm transition hover:border-primary hover:shadow-md"
                  data-testid="button-single-day-event"
                >
                  <div className="text-lg font-semibold text-gray-900">Single-Day Event</div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    One date, start/end time, and standing capacity. No rooms or beds.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setLocation('/event-builder?type=multi-day')}
                  className="rounded-lg border border-primary/20 bg-white p-5 text-left shadow-sm transition hover:border-primary hover:shadow-md"
                  data-testid="button-multi-day-trip"
                >
                  <div className="text-lg font-semibold text-gray-900">Multi-Day Trip</div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    Start date to end date, sleeping capacity, and room/bed inventory.
                  </p>
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRole="creator">
      <div className="min-h-screen bg-white">
        <Navigation />
        <EventBuilder 
          draftId={draftId}
          initialExperienceType={initialExperienceType}
          onComplete={(experienceId) => {
            // Handle successful submission
            window.location.href = `/experience/${experienceId}`;
          }}
        />
      </div>
    </ProtectedRoute>
  );
}
