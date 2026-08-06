import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  MapPin, Users, Globe, Instagram, Sparkles, Calendar, DollarSign,
  Phone, Mail, Facebook, Youtube, Video, Bed, Clock, FileText,
  Shield, Star, ChevronRight, Building, Coffee
} from "lucide-react";
import type { Venue, Experience } from "@shared/schema";
import { format } from "date-fns";
import { normalizeImageUrl } from "@/lib/utils";
import Navigation from "@/components/navigation";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(amount: number | string | null | undefined, currency = "EUR") {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  if (!num || isNaN(num)) return null;
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
  return `${symbols[currency.toUpperCase()] ?? currency + " "}${num.toFixed(0)}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold mb-3">{children}</h2>;
}

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

  const upcomingExperiences = allExperiences
    .filter((exp) => new Date(exp.startDate) > new Date())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" data-testid="loading-venue-page">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-96 bg-muted rounded-lg" data-testid="skeleton-hero" />
            <div className="h-12 bg-muted rounded w-1/2" />
            <div className="h-24 bg-muted rounded" />
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
              <p className="text-muted-foreground mb-4">
                This venue doesn't exist or hasn't been approved yet.
              </p>
              <Button onClick={() => setLocation("/")}>Go Home</Button>
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
  const isDaytime = (venue as any).venueType === "daytime";
  const currency = (venue.currency || "EUR").toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* ── Hero Image Carousel ── */}
      <div className="relative h-[480px] bg-muted">
        {allImages.length > 0 ? (
          <Carousel className="w-full h-full">
            <CarouselContent>
              {allImages.map((image, i) => (
                <CarouselItem key={i}>
                  <div className="relative w-full h-[480px]">
                    <img
                      src={normalizeImageUrl(image) || ""}
                      alt={`${venue.name} — photo ${i + 1}`}
                      className="w-full h-full object-cover"
                      data-testid={`img-gallery-${i}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {allImages.length > 1 && (
              <>
                <CarouselPrevious className="left-4" />
                <CarouselNext className="right-4" />
              </>
            )}
          </Carousel>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Sparkles className="w-16 h-16 text-muted-foreground" />
          </div>
        )}

        {/* Overlay: name + location + tags */}
        <div className="absolute bottom-0 left-0 right-0 p-8">
          <div className="container mx-auto">
            {venue.tagline && (
              <p className="text-white/80 text-sm mb-1 italic">{venue.tagline}</p>
            )}
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2" data-testid="text-venue-name">
              {venue.name}
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-white/90">
                <MapPin className="w-4 h-4" />
                <span data-testid="text-venue-location">{venue.city}</span>
              </div>
              {isDaytime && (
                <Badge className="bg-amber-500 text-white border-0">☀️ Daytime Space</Badge>
              )}
              {(venue.categories || []).slice(0, 3).map((cat: string) => (
                <Badge key={cat} variant="secondary" className="bg-white/20 text-white border-0">
                  {cat.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Page Body ── */}
      <div className="container mx-auto px-4 py-10">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* ── Main Column ── */}
          <div className="lg:col-span-2 space-y-8">

            {/* About */}
            <section>
              <SectionTitle>About This Venue</SectionTitle>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap" data-testid="text-venue-description">
                {venue.description}
              </p>
            </section>

            {/* Vibes */}
            {(venue.vibes || []).length > 0 && (
              <section>
                <SectionTitle>Vibes</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {(venue.vibes as string[]).map((v) => (
                    <Badge key={v} variant="outline" className="capitalize">
                      {v.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Amenities */}
            {((venue.amenities || []).length > 0 || (venue.customAmenities || []).length > 0) && (
              <section>
                <SectionTitle>Amenities</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {[...(venue.amenities || []), ...(venue.customAmenities || [])].map((a: string, i) => (
                    <Badge key={i} variant="secondary" data-testid={`badge-amenity-${i}`}>
                      {a}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {/* Services (JSONB with pricing) */}
            {(venue.services || []).length > 0 && (
              <section>
                <SectionTitle>Services & Add-ons</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-3">
                  {(venue.services as any[]).map((svc, i) => (
                    <div key={i} className="flex justify-between items-start p-3 rounded-lg border bg-card">
                      <div>
                        <p className="font-medium text-sm">{svc.title}</p>
                        {svc.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{svc.description}</p>
                        )}
                        {svc.frequency && (
                          <span className="text-xs text-muted-foreground">{svc.frequency.replace(/_/g, " ")}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Room Types (multi-day venues) */}
            {!isDaytime && (venue.venueRoomTypes || []).length > 0 && (
              <section>
                <SectionTitle>Room Types</SectionTitle>
                <div className="grid sm:grid-cols-2 gap-4">
                  {(venue.venueRoomTypes as any[]).map((room, i) => (
                    <Card key={i}>
                      <CardContent className="pt-4 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">{room.name}</span>
                          <Badge variant="outline">{room.type}</Badge>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Users className="w-3.5 h-3.5" />
                          <span>Capacity: {room.capacity} · Qty: {room.quantity}</span>
                        </div>
                        {room.bedConfiguration && (
                          <p className="text-xs text-muted-foreground">{room.bedConfiguration}</p>
                        )}
                        {room.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{room.description}</p>
                        )}
                        {/* No nightly rate — venue profiles are visual only.
                            Commercial terms come from the creator's Target Deal. */}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* House Rules */}
            {venue.houseRules && (
              <section>
                <SectionTitle>House Rules</SectionTitle>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{venue.houseRules}</p>
                </div>
              </section>
            )}

            {/* Video */}
            {venue.videoUrl && (
              <section>
                <SectionTitle>Venue Video</SectionTitle>
                <div className="aspect-video rounded-lg overflow-hidden border">
                  <iframe
                    src={venue.videoUrl.replace("watch?v=", "embed/")}
                    className="w-full h-full"
                    allowFullScreen
                    title="Venue video"
                  />
                </div>
              </section>
            )}

            {/* Upcoming Experiences */}
            {upcomingExperiences.length > 0 && (
              <section>
                <SectionTitle>Upcoming Events at This Venue</SectionTitle>
                <div className="space-y-3">
                  {upcomingExperiences.map((exp) => (
                    <Card
                      key={exp.id}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => setLocation(`/experience/${exp.id}`)}
                      data-testid={`card-experience-${exp.id}`}
                    >
                      <CardContent className="p-4 flex gap-4">
                        {exp.coverImageUrl && (
                          <img
                            src={normalizeImageUrl(exp.coverImageUrl) || ""}
                            alt={exp.title}
                            className="w-20 h-20 object-cover rounded shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold line-clamp-1">{exp.title}</p>
                          {exp.shortDescription && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{exp.shortDescription}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {format(new Date(exp.startDate), "MMM d, yyyy")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {exp.currentParticipants}/{exp.maxParticipants}
                            </span>
                            {exp.price && (
                              <span className="font-semibold text-foreground">
                                {fmt(exp.price, exp.currency || "EUR")}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 self-center" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── Sidebar ── */}
          <aside className="space-y-4">

            {/* Quick Facts */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quick Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">

                {/* Capacity */}
                <div className="flex items-start gap-3">
                  <Users className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Max Capacity</p>
                    <p className="font-medium">{venue.capacity} guests</p>
                    {isDaytime && (venue as any).standingCapacity && (
                      <p className="text-xs text-muted-foreground">
                        Standing: {(venue as any).standingCapacity}
                        {(venue as any).seatedCapacity ? ` · Seated: ${(venue as any).seatedCapacity}` : ""}
                      </p>
                    )}
                  </div>
                </div>

                {/* Location */}
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-medium">{venue.location || venue.city}</p>
                    {venue.region && <p className="text-xs text-muted-foreground">{venue.region}</p>}
                  </div>
                </div>

                {/* No pricing block. Venues publish photos, capacity and
                    amenities; the commercial terms are negotiated per event
                    through the creator's Target Deal. */}

                {/* Cancellation */}
                {venue.cancellationPolicy && (
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Cancellation</p>
                      <p className="font-medium">{venue.cancellationPolicy}</p>
                    </div>
                  </div>
                )}

                {/* Approval Mode */}
                {venue.approvalMode && (
                  <div className="flex items-center gap-3">
                    <Star className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Booking Mode</p>
                      <p className="font-medium">{venue.approvalMode}</p>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Contact */}
                {venue.contactPerson && (
                  <div className="flex items-center gap-3">
                    <Building className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Contact</p>
                      <p className="font-medium">{venue.contactPerson}</p>
                    </div>
                  </div>
                )}
                {venue.contactEmail && (
                  <a href={`mailto:${venue.contactEmail}`} className="flex items-center gap-3 hover:text-primary transition-colors">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{venue.contactEmail}</span>
                  </a>
                )}
                {venue.contactPhone && (
                  <a href={`tel:${venue.contactPhone}`} className="flex items-center gap-3 hover:text-primary transition-colors">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{venue.contactPhone}</span>
                  </a>
                )}
                {venue.website && (
                  <a href={venue.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:text-primary transition-colors">
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">Website</span>
                  </a>
                )}
                {venue.instagram && (
                  <a href={`https://instagram.com/${venue.instagram.replace("@", "")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:text-primary transition-colors">
                    <Instagram className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>{venue.instagram}</span>
                  </a>
                )}
                {venue.facebook && (
                  <a href={venue.facebook} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:text-primary transition-colors">
                    <Facebook className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>Facebook</span>
                  </a>
                )}
                {venue.youtube && (
                  <a href={venue.youtube} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:text-primary transition-colors">
                    <Youtube className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>YouTube</span>
                  </a>
                )}
                {venue.whatsapp && (
                  <a href={`https://wa.me/${venue.whatsapp.replace(/\D/g, "")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:text-primary transition-colors">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </CardContent>
            </Card>

            {/* Terms CTA */}
            {venue.termsAndConditionsUrl && (
              <a href={venue.termsAndConditionsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors px-1">
                <FileText className="w-4 h-4 shrink-0" />
                View Terms & Conditions
              </a>
            )}

            <Button className="w-full" size="lg" data-testid="button-book-venue">
              Book This Venue
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}
