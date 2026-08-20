import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users } from "lucide-react";
import { LocationMap } from "@/components/LocationMap";

interface VenueInfo {
  id: string;
  name: string;
  location?: string;
  description?: string;
  photos?: string[];
  capacity?: number;
  amenities?: string[];
}

interface VenueInfoCardProps {
  venue: VenueInfo;
  showPhotos?: boolean;
  className?: string;
}

export function VenueInfoCard({ 
  venue, 
  showPhotos = true, 
  className = "" 
}: VenueInfoCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-0">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 px-8 pt-8" data-testid="heading-venue">
          The Venue
        </h2>
        
        {/* Venue Cover Photo - Prominent Display */}
        {showPhotos && venue.photos && venue.photos.length > 0 && (
          <div className="mb-6">
            {/* Main Cover Photo */}
            <div className="relative w-full h-[400px] overflow-hidden bg-gray-100">
              <img
                src={venue.photos[0]}
                alt={venue.name || 'Venue'}
                loading="lazy"
                className="w-full h-full object-cover"
                data-testid="venue-cover-photo"
              />
            </div>
            
            {/* Additional Photos Grid (if more than 1 photo) */}
            {venue.photos.length > 1 && (
              <div className="grid grid-cols-3 gap-2 mt-2 px-8">
                {venue.photos.slice(1, 4).map((photo, index) => (
                  <div 
                    key={index} 
                    className="relative aspect-video overflow-hidden rounded-lg bg-gray-100"
                    data-testid={`venue-photo-${index + 1}`}
                  >
                    <img
                      src={photo}
                      alt={`${venue.name || 'Venue'} - Photo ${index + 2}`}
                      loading="lazy"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div className="px-8 pb-8">
          {/* Venue Name & Location */}
          <h3 className="text-2xl font-bold text-gray-900 mb-3" data-testid="venue-name">
            {venue.name}
          </h3>
          {venue.location && (
            <>
              <div className="flex items-center gap-2 text-gray-600 mb-4">
                <MapPin className="w-5 h-5" />
                <span className="text-base" data-testid="venue-location">{venue.location}</span>
              </div>
              <LocationMap name={venue.name} address={venue.location} className="mb-6" />
            </>
          )}
          
          {/* Venue Description */}
          {venue.description && (
            <p className="text-gray-600 leading-relaxed mb-6 text-base" data-testid="venue-description">
              {venue.description}
            </p>
          )}
          
          {/* Capacity & Amenities */}
          <div className="space-y-6">
            {/* Capacity */}
            {venue.capacity && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-4" data-testid="venue-capacity">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Capacity</p>
                  <p className="text-lg font-semibold text-gray-900">Up to {venue.capacity} guests</p>
                </div>
              </div>
            )}
            
            {/* Venue Amenities */}
            {venue.amenities && venue.amenities.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Venue Amenities</h4>
                <div className="flex flex-wrap gap-2">
                  {venue.amenities.map((amenity, index) => (
                    <Badge 
                      key={index} 
                      variant="outline"
                      className="px-3 py-1.5"
                      data-testid={`venue-amenity-${index}`}
                    >
                      {amenity}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
