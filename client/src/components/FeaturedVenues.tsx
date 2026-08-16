import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicVenueCard, type PublicVenueSummary } from "@/components/PublicVenueCard";

export function FeaturedVenues({ limit = 6 }: { limit?: number }) {
  const { data: venues = [], isLoading } = useQuery<PublicVenueSummary[]>({
    queryKey: ["/api/venues"],
  });
  const approvedVenues = venues
    .filter((venue) => venue.approved === true || venue.status === "approved")
    .slice(0, limit);

  return (
    <section id="venue-directory-section" className="bg-white py-16 dark:bg-gray-950" data-testid="featured-venues-section">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-primary">Spaces on Great.</p>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Explore venues on the platform</h2>
            <p className="mt-2 max-w-2xl text-gray-600 dark:text-gray-400">
              Browse approved cafés, studios, event spaces, and retreat venues before building your next experience.
            </p>
          </div>
          <Link href="/venues">
            <Button variant="outline" className="shrink-0" data-testid="button-browse-all-venues">
              Browse all venues <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading venues">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="space-y-3 rounded-xl border p-4">
                <Skeleton className="aspect-video w-full" />
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : approvedVenues.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="featured-venues-grid">
            {approvedVenues.map((venue) => <PublicVenueCard key={venue.id} venue={venue} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center dark:bg-slate-900">
            <Building className="mx-auto mb-3 h-10 w-10 text-slate-400" aria-hidden="true" />
            <h3 className="text-lg font-semibold">Venue profiles are being prepared</h3>
            <p className="mt-1 text-sm text-muted-foreground">Approved venue listings will appear here as soon as they are ready.</p>
          </div>
        )}
      </div>
    </section>
  );
}
