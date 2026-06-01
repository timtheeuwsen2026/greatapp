import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { MapPin, Users, Globe, Instagram, Sparkles, Calendar, DollarSign } from "lucide-react";
import type { Venue, Experience } from "@shared/schema";
import { format } from "date-fns";
import { normalizeImageUrl } from "@/lib/utils";
import Navigation from "@/components/navigation";

export default function PublicVenuePage() {
  const { slug } = useParams();
  const [, setLocation] = useLocation();

  const { data: venue, isLoading, error } = useQuery<Venue>({
    queryKey: [`/api/v/${slug}`],
  });

  const { data: allExperiences = [] } = useQuery<Experience[]>({
    queryKey: [`/api/venues/${venue?.id}/experiences`],
    enabled: !!venue?.id,
  });

  // Filter for upcoming experiences only and sort by start date (soonest first)
  // Compare full timestamps to exclude events that have already started
  const upcomingExperiences = allExperiences
    .filter((exp) => {
      const eventStart = new Date(exp.startDate);
      const now = new Date();
      return eventStart > now;
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" data-testid="loading-venue-page">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-96 bg-muted rounded-lg" data-testid="skeleton-hero" />
            <div className="h-12 bg-muted rounded w-1/2" data-testid="skeleton-title" />
            <div className="h-24 bg-muted rounded" data-testid="skeleton-description" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="min-h-screen bg-background" data-testid="error-venue-page">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-2" data-testid="text-error-title">Venue Not Found</h2>
            <p className="text-muted-foreground mb-4" data-testid="text-error-message">
              This venue doesn't exist or hasn't been approved yet.
            </p>
            <Button onClick={() => setLocation("/")} data-testid="button-home">
              Go Home
            </Button>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

  const allImages = [
    ...(venue.coverImageUrl ? [venue.coverImageUrl] : []),
    ...(venue.galleryImages || []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      {/* Hero Section with Image Carousel */}
      <div className="relative h-[500px] bg-muted">
        {allImages.length > 0 ? (
          <Carousel className="w-full h-full">
            <CarouselContent>
              {allImages.map((image, index) => (
                <CarouselItem key={index}>
                  <div className="relative w-full h-[500px]">
                    <img
                      src={normalizeImageUrl(image) || ''}
                      alt={`${venue.name} - Image ${index + 1}`}
                      className="w-full h-full object-cover"
                      data-testid={`img-gallery-${index}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {allImages.length > 1 && (
              <>
                <CarouselPrevious className="left-4" data-testid="button-carousel-prev" />
                <CarouselNext className="right-4" data-testid="button-carousel-next" />
              </>
            )}
          </Carousel>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted" data-testid="empty-gallery">
            <Sparkles className="w-16 h-16 text-muted-foreground" />
          </div>
        )}
        
        {/* Venue Name Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-8">
          <div className="container mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2" data-testid="text-venue-name">
              {venue.name}
            </h1>
            <div className="flex items-center gap-2 text-white/90">
              <MapPin className="w-5 h-5" />
              <span data-testid="text-venue-location">{venue.city}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Venue Details */}
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6 sm:space-y-8">
            {venue.amenities && venue.amenities.length > 0 && (
              <section aria-labelledby="amenities-heading">
                <h2 id="amenities-heading" className="text-2xl font-semibold mb-4">Amenities</h2>
                <div className="flex flex-wrap gap-2" role="list" aria-label="Venue amenities">
                  {venue.amenities.map((amenity, index) => (
                    <Badge 
                      key={index} 
                      variant="secondary" 
                      data-testid={`badge-amenity-${index}`}
                      role="listitem"
                      tabIndex={0}
                      aria-label={`Amenity: ${amenity}`}
                    >
                      {amenity}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-2xl font-semibold mb-4">About This Venue</h2>
              <p className="text-muted-foreground leading-relaxed" data-testid="text-venue-description">
                {venue.description}
              </p>
            </section>

            {upcomingExperiences.length > 0 && (
              <section>
                <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
                <div className="grid gap-4" data-testid="section-upcoming-events">
                  {upcomingExperiences.map((experience) => (
                    <Card
                      key={experience.id}
                      className="hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => setLocation(`/experience/${experience.id}`)}
                      data-testid={`card-experience-${experience.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          {experience.coverImageUrl && (
                            <img
                              src={normalizeImageUrl(experience.coverImageUrl) || ''}
                              alt={experience.title}
                              className="w-24 h-24 object-cover rounded"
                              data-testid={`img-experience-${experience.id}`}
                            />
                          )}
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-1" data-testid={`text-experience-title-${experience.id}`}>
                              {experience.title}
                            </h3>
                            {experience.shortDescription && (
                              <p className="text-sm text-muted-foreground mb-2 line-clamp-2" data-testid={`text-experience-description-${experience.id}`}>
                                {experience.shortDescription}
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span data-testid={`text-experience-date-${experience.id}`}>
                                  {format(new Date(experience.startDate), "MMM d, yyyy")}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                <span data-testid={`text-experience-participants-${experience.id}`}>
                                  {experience.currentParticipants}/{experience.maxParticipants}
                                </span>
                              </div>
                              <span className="font-semibold text-foreground" data-testid={`text-experience-price-${experience.id}`}>
                                ${experience.price}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6" aria-label="Venue quick information">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3" aria-label={`Venue capacity: Up to ${venue.capacity} guests`}>
                  <Users className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm text-muted-foreground">Capacity</p>
                    <p className="font-semibold" data-testid="text-venue-capacity">
                      Up to {venue.capacity} guests
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3" aria-label={`Location: ${venue.location || venue.city}`}>
                  <MapPin className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-semibold" data-testid="text-venue-full-location">
                      {venue.location || venue.city}
                    </p>
                  </div>
                </div>

                {venue.website && (
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-muted-foreground">Website</p>
                      <a
                        href={venue.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        data-testid="link-venue-website"
                        aria-label={`Visit ${venue.name} website (opens in new tab)`}
                      >
                        Visit Website
                      </a>
                    </div>
                  </div>
                )}

                {venue.instagram && (
                  <div className="flex items-center gap-3">
                    <Instagram className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-muted-foreground">Instagram</p>
                      <a
                        href={`https://instagram.com/${venue.instagram.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        data-testid="link-venue-instagram"
                        aria-label={`Follow ${venue.name} on Instagram at ${venue.instagram} (opens in new tab)`}
                      >
                        {venue.instagram}
                      </a>
                    </div>
                  </div>
                )}

                {venue.amenities && venue.amenities.length > 0 && (
                  <div className="pt-2 border-t border-border" aria-labelledby="sidebar-amenities-heading">
                    <p id="sidebar-amenities-heading" className="text-sm text-muted-foreground mb-2">Amenities</p>
                    <div className="flex flex-wrap gap-1.5" role="list" aria-label="Quick amenities overview">
                      {venue.amenities.map((amenity, index) => (
                        <Badge 
                          key={index} 
                          variant="secondary" 
                          className="text-xs" 
                          data-testid={`badge-sidebar-amenity-${index}`}
                          role="listitem"
                        >
                          {amenity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Services Offered - Show standard services */}
                {((venue.servicesOffered && venue.servicesOffered.length > 0) || 
                  (venue.customServicesOffered && venue.customServicesOffered.length > 0) ||
                  (venue.services && venue.services.length > 0)) && (
                  <div className="pt-2 border-t border-border" aria-labelledby="sidebar-services-heading">
                    <p id="sidebar-services-heading" className="text-sm text-muted-foreground mb-2">
                      Services Offered
                    </p>
                    <div 
                      className="flex flex-wrap gap-1.5 md:gap-2" 
                      role="list" 
                      aria-label="Services offered by venue" 
                      data-testid="sidebar-section-services"
                    >
                      {/* Standard Services from the select list */}
                      {venue.servicesOffered?.map((service: string, index: number) => (
                        <Badge 
                          key={`service-${index}`} 
                          variant="outline" 
                          className="text-xs rounded-full"
                          data-testid={`badge-sidebar-service-${index}`}
                          role="listitem"
                          tabIndex={0}
                          aria-label={`Service: ${service}`}
                        >
                          {service}
                        </Badge>
                      ))}
                      
                      {/* Custom Services (venue-specific) */}
                      {venue.customServicesOffered?.map((service: string, index: number) => (
                        <Badge 
                          key={`custom-service-${index}`} 
                          variant="secondary" 
                          className="text-xs rounded-full"
                          data-testid={`badge-sidebar-custom-service-${index}`}
                          role="listitem"
                          tabIndex={0}
                          aria-label={`Custom service: ${service}`}
                        >
                          {service}
                        </Badge>
                      ))}
                      
                      {/* Detailed Services with pricing (JSONB services) */}
                      {venue.services?.map((service: any, index: number) => (
                        <Badge 
                          key={service.id || `detailed-${index}`} 
                          variant="outline" 
                          className="text-xs max-w-full flex items-center rounded-full border-2"
                          data-testid={`badge-sidebar-detailed-service-${index}`}
                          role="listitem"
                          tabIndex={0}
                          aria-label={`Detailed service: ${service.title}${service.price ? `, $${service.price.toFixed(2)}` : ''}`}
                        >
                          <span className="truncate max-w-[120px] md:max-w-[140px]">{service.title}</span>
                          {service.price !== undefined && service.price !== null && (
                            <span className="ml-1 font-semibold whitespace-nowrap flex-shrink-0">
                              ${service.price.toFixed(2)}
                            </span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button 
              className="w-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" 
              size="lg" 
              data-testid="button-book-venue"
              aria-label={`Book ${venue.name} venue`}
            >
              Book This Venue
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}
