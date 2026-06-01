import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Users, DollarSign, Building, Clock } from "lucide-react";
import Navigation from "@/components/navigation";
import { Link } from "wouter";
import { normalizeImageUrl } from "@/lib/utils";

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

  const approvedVenues = venues?.filter(venue => venue.approved) || [];
  const pendingVenues = venues?.filter(venue => !venue.approved) || [];

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
              <Button variant="outline">
                Browse Services
              </Button>
            </Link>
            <Link href="/venue-profile-setup">
              <Button>
                <Building className="w-4 h-4 mr-2" />
                List Your Venue
              </Button>
            </Link>
          </div>
        </div>

        {approvedVenues.length === 0 && pendingVenues.length === 0 ? (
          <div className="text-center py-12">
            <Building className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No venues yet</h3>
            <p className="text-gray-600 mb-6">Be the first to list your venue on the platform!</p>
            <Link href="/venue-profile-setup">
              <Button>List Your Venue</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {approvedVenues.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-6">Featured Venues</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {approvedVenues.map((venue) => (
                    <VenueCard key={venue.id} venue={venue} />
                  ))}
                </div>
              </div>
            )}

            {pendingVenues.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                  Pending Approval ({pendingVenues.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pendingVenues.map((venue) => (
                    <VenueCard key={venue.id} venue={venue} isPending />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VenueCard({ venue, isPending = false }: { venue: Venue; isPending?: boolean }) {
  const categories = venue.categories || [];
  const vibes = venue.vibes || [];
  
  return (
    <Link href={`/v/${venue.slug}`}>
      <Card className={`hover:shadow-lg transition-shadow cursor-pointer ${isPending ? 'opacity-75' : ''}`}>
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
            {isPending && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                <Clock className="w-3 h-3 mr-1" />
                Pending
              </Badge>
            )}
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
                  ${parseFloat(venue.basePrice).toLocaleString()}
                  {venue.pricingModel && `/${venue.pricingModel === 'whole_venue' ? 'venue' : 'room'}`}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}