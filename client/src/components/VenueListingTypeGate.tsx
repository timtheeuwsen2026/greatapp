import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Bed, Calendar } from "lucide-react";
import Navigation from "@/components/navigation";

const VenueProfileSetup = lazy(() => import("@/pages/venue-profile-setup"));

function preloadVenueProfileSetup() {
  void import("@/pages/venue-profile-setup");
}

function VenueFormLoading() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-gray-600">Opening venue form...</p>
      </div>
    </div>
  );
}

export function VenueProfileSetupRoute() {
  return (
    <Suspense fallback={<VenueFormLoading />}>
      <VenueProfileSetup />
    </Suspense>
  );
}

// This component must remain at module scope. The browser's native file picker
// triggers an authentication refresh when focus returns to the page. A component
// declared inside Router would receive a new identity on that refresh, remounting
// VenueProfileSetup and resetting its current step.
export default function VenueListingTypeGate() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const editVenueId = params.get("edit");
  const selectedVenueType = params.get("venueType") || params.get("type");
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
              onClick={() => setLocation("/venue-dashboard")}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-primary hover:text-primary"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
