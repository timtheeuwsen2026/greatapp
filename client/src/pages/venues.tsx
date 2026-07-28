import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Users, DollarSign, Building, ChevronLeft, ChevronRight } from "lucide-react";
import Navigation from "@/components/navigation";
import { Link } from "wouter";
import { normalizeImageUrl } from "@/lib/utils";
import { normalizeVenueDealModel } from "@shared/venueDealModels";

const VENUES_PER_PAGE = 9;

// What the listed base price is charged per, by pricing model.
const PRICING_UNIT_LABELS: Record<string, string> = {
  per_room_night: 'room / night',
  per_head: 'participant',
  fixed_fee: 'ticket',
  upfront_rental: 'event',
  revenue_share: 'ticket',
  access_only: 'event',
  minimum_spend: 'event',
};

const VENUE_CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', IDR: 'Rp', THB: '฿', MXN: 'MX$', AUD: 'A$',
};

// Venues default to EUR on this platform; never assume dollars.
function formatVenueBasePrice(basePrice: string, currency?: string | null): string {
  const code = String(currency || 'EUR').toUpperCase();
  const symbol = VENUE_CURRENCY_SYMBOLS[code] || `${code} `;
  return `${symbol}${parseFloat(basePrice).toLocaleString()}`;
}

type Venue = {
  id: string;
  name: string;
  tagline?: string;
  description: string;
  city: string;
  location: string;
  capacity: number;
  coverImageUrl?: string;
  pricingModel?: string;
  basePrice?: string;
  currency?: string;
  categories?: string[];
  vibes?: string[];
  amenities?: string[];
  status?: string;
  approved: boolean;
  createdAt: string;
  slug: string;
};

export default function Venues() {
  const { data: venues, isLoading } = useQuery<Venue[]>({
    queryKey: ['/api/venues'],
  });
  const [currentPage, setCurrentPage] = useState(1);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-gray-600">Loading venues...</p>
          </div>
        </div>
      </div>
    );
  }

  // API now returns only approved venues for public view
  const approvedVenues = venues || [];
  const totalPages = Math.max(1, Math.ceil(approvedVenues.length / VENUES_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * VENUES_PER_PAGE;
  const paginatedVenues = approvedVenues.slice(pageStart, pageStart + VENUES_PER_PAGE);

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
    document.getElementById("venues-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Venues</h1>
            <p className="text-gray-600 mt-2">Discover amazing spaces for your next experience</p>
          </div>
          <div className="flex gap-3">
            <Link href="/services">
              <Button variant="outline">Browse Services</Button>
            </Link>
            <Link href="/venue-profile-setup">
              <Button>
                <Building className="w-4 h-4 mr-2" />
                List Your Venue
              </Button>
            </Link>
          </div>
        </div>

        {approvedVenues.length === 0 ? (
          <div className="text-center py-12">
            <Building className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No venues yet</h3>
            <p className="text-gray-600 mb-6">Be the first to list your venue on the platform!</p>
            <Link href="/venue-profile-setup">
              <Button>List Your Venue</Button>
            </Link>
          </div>
        ) : (
          <div id="venues-results" className="scroll-mt-4">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Featured Venues
              <span className="ml-2 text-base font-normal text-gray-500">({approvedVenues.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedVenues.map((venue) => (
                <VenueCard key={venue.id} venue={venue} />
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="mt-10 flex flex-col items-center gap-3" aria-label="Venues pagination" data-testid="venues-pagination">
                <p className="text-sm text-gray-600">
                  Showing {pageStart + 1}–{Math.min(pageStart + VENUES_PER_PAGE, approvedVenues.length)} of {approvedVenues.length} venues
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(safeCurrentPage - 1)}
                    disabled={safeCurrentPage === 1}
                    aria-label="Previous page"
                    data-testid="pagination-previous"
                  >
                    <ChevronLeft className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Previous</span>
                  </Button>

                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <Button
                      key={page}
                      type="button"
                      variant={safeCurrentPage === page ? "default" : "outline"}
                      size="sm"
                      className="min-w-9"
                      onClick={() => goToPage(page)}
                      aria-label={`Page ${page}`}
                      aria-current={safeCurrentPage === page ? "page" : undefined}
                      data-testid={`pagination-page-${page}`}
                    >
                      {page}
                    </Button>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(safeCurrentPage + 1)}
                    disabled={safeCurrentPage === totalPages}
                    aria-label="Next page"
                    data-testid="pagination-next"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4 sm:ml-1" />
                  </Button>
                </div>
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VenueCard({ venue }: { venue: Venue }) {
  const categories = venue.categories || [];
  const vibes = venue.vibes || [];

  return (
    <Link href={`/v/${venue.slug}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        {venue.coverImageUrl && (
          <div className="aspect-video w-full overflow-hidden rounded-t-lg">
            <img
              src={normalizeImageUrl(venue.coverImageUrl) || ''}
              alt={venue.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <CardHeader>
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg">{venue.name}</CardTitle>
          </div>
          <CardDescription className="flex items-center text-sm text-gray-600">
            <MapPin className="w-4 h-4 mr-1" />
            {venue.city || venue.location}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {venue.tagline && (
            <p className="text-gray-600 italic mb-2 text-sm">{venue.tagline}</p>
          )}
          <p className="text-gray-700 mb-4 line-clamp-2">{venue.description}</p>
          
          <div className="space-y-3">
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {categories.slice(0, 3).map((cat) => (
                  <Badge key={cat} variant="secondary" className="text-xs">
                    {cat.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}
            
            {vibes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {vibes.slice(0, 3).map((vibe) => (
                  <Badge key={vibe} variant="outline" className="text-xs">
                    {vibe}
                  </Badge>
                ))}
                {vibes.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{vibes.length - 3} more
                  </Badge>
                )}
              </div>
            )}

            <div className="flex justify-between items-center text-sm text-gray-600">
              <div className="flex items-center">
                <Users className="w-4 h-4 mr-1" />
                Up to {venue.capacity} people
              </div>
              {venue.basePrice && (
                <div className="flex items-center">
                  <DollarSign className="w-4 h-4 mr-1" />
                  {formatVenueBasePrice(venue.basePrice, venue.currency)}
                  {venue.pricingModel && `/${PRICING_UNIT_LABELS[normalizeVenueDealModel(venue.pricingModel) || ''] || 'event'}`}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}