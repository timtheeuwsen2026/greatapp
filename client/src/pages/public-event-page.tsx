import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { 
  MapPin, 
  Calendar, 
  Users, 
  DollarSign, 
  Clock, 
  Lock, 
  AlertCircle,
  FileX
} from "lucide-react";
import { format } from "date-fns";
import { VenueInfoCard } from "@/components/VenueInfoCard";
import CreatorProfileCard from "@/components/creator-profile-card";
import Navigation from "@/components/navigation";
import PromoterReferralCard, { type PromoterReferralProfile } from "@/components/promoter-referral-card";
import { ChatTeaser } from "@/components/ChatTeaser";
import { EventSocialProofToast } from "@/components/EventSocialProofToast";

interface PublicEventData {
  id: string;
  title: string;
  status: string;
  lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
  short_description: string;
  full_description: string;
  start_date: string;
  end_date: string;
  duration: number;
  cover_image: string;
  gallery: Array<{ id: string; imageUrl: string; caption?: string; order: number }>;
  itinerary: any[];
  amenities: Array<{
    id: string;
    name: string;
    description?: string;
    custom?: boolean;
    approvedByAdmin?: boolean;
  }>;
  services: Array<{
    id: string;
    name: string;
    description?: string;
    custom?: boolean;
    approvedByAdmin?: boolean;
  }>;
  roles: Array<{
    name: string;
    required: boolean;
    headcount: number;
    rate?: number;
    notes?: string;
  }>;
  mvg: {
    enabled: boolean;
    minimum_required: number;
    current_signups: number;
    soft_hold_deadline: string | null;
    status: string;
    escrow_enabled: boolean;
  };
  pricing: {
    currency: string;
    basePrice: number;
    pricePerPerson?: number;
    depositEnabled: boolean;
    depositAmount?: number;
    depositPercentage: number;
    rooms: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      availableSpots: number;
      discount: {
        title: string;
        type: string;
        value: number;
        validUntil?: string;
      } | null;
      gallery: string[];
      notes?: string;
    }>;
    discounts: any[];
  };
  venue: {
    id: string;
    name: string;
    location: string;
    description: string;
    photos: string[];
    capacity: number;
    amenities: string[];
  } | null;
  creator: {
    id: string;
    photo: string | null;
    name: string;
    tagline: string | null;
    displayName?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    baseLocation?: string | null;
    expertise?: string[];
    experienceLevel?: string | null;
    isVerified?: boolean;
    averageRating?: number | null;
    totalExperiences?: number | null;
    socialLink?: string | null;
  } | null;
  stats: any;
  bookings: any[];
  reviews: any[];
}

export default function PublicEventPage() {
  const [, params] = useRoute("/e/:slugOrId");
  const [location] = useLocation();
  const slugOrId = params?.slugOrId;

  // Extract preview token from URL query params
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const previewToken = searchParams.get('preview');
  const promoterRefCode = searchParams.get('ref');

  // Build query key with preview token if present
  const queryKey = previewToken 
    ? [`/api/e/${slugOrId}?preview=${previewToken}`]
    : ["/api/e", slugOrId];

  const { data: event, isLoading, error } = useQuery<PublicEventData>({
    queryKey,
    enabled: !!slugOrId,
  });

  const { data: promoterProfile } = useQuery<PromoterReferralProfile>({
    queryKey: ["/api/promoter-profile/by-code", promoterRefCode ? encodeURIComponent(promoterRefCode) : ""],
    enabled: !!promoterRefCode,
    retry: false,
  });
  const promoterReferralProfile = promoterProfile as PromoterReferralProfile | undefined;

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="relative w-full h-[500px]">
          <Skeleton className="w-full h-full" />
        </div>
      </div>
    );
  }

  // Error States - Handle different scenarios
  if (error || !event) {
    const errorResponse = error as any;
    const status = errorResponse?.response?.status;
    const errorMessage = errorResponse?.response?.data?.message;

    // 404 - Could be draft/pending without access or truly not found
    if (status === 404 || !event) {
      return (
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
            <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileX className="w-8 h-8 text-gray-400" />
              </div>
              <h1 
                className="text-2xl font-bold text-gray-900 mb-2" 
                data-testid="error-heading-not-found"
              >
                Event Not Found
              </h1>
              <p className="text-gray-600 mb-6" data-testid="error-message-not-found">
                This event doesn't exist, is not yet published, or you don't have permission to view it.
              </p>
              <Button 
                onClick={() => window.location.href = '/experiences'}
                data-testid="button-browse-events"
              >
                Browse Events
              </Button>
            </CardContent>
          </Card>
          </div>
        </div>
      );
    }

    // 401/403 - Unauthorized
    if (status === 401 || status === 403) {
      return (
        <div className="min-h-screen bg-gray-50">
          <Navigation />
          <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
            <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center">
              <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-yellow-600" />
              </div>
              <h1 
                className="text-2xl font-bold text-gray-900 mb-2"
                data-testid="error-heading-unauthorized"
              >
                Access Restricted
              </h1>
              <p className="text-gray-600 mb-6" data-testid="error-message-unauthorized">
                You don't have permission to view this event. It may require a preview token or authentication.
              </p>
              <Button 
                onClick={() => window.location.href = '/experiences'}
                data-testid="button-browse-events-unauthorized"
              >
                Browse Public Events
              </Button>
            </CardContent>
          </Card>
          </div>
        </div>
      );
    }

    // Generic error
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
          <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 
              className="text-2xl font-bold text-gray-900 mb-2"
              data-testid="error-heading-generic"
            >
              Something Went Wrong
            </h1>
            <p className="text-gray-600 mb-6" data-testid="error-message-generic">
              {errorMessage || "We couldn't load this event. Please try again later."}
            </p>
            <div className="flex gap-3 justify-center">
              <Button 
                variant="outline"
                onClick={() => window.location.reload()}
                data-testid="button-retry"
              >
                Try Again
              </Button>
              <Button 
                onClick={() => window.location.href = '/experiences'}
                data-testid="button-browse-events-error"
              >
                Browse Events
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

  // DRAFT STATUS - Show message if event is in draft
  // Note: This should rarely be reached since backend returns 404 for unauthorized draft access
  // But if creator/admin views their own draft, show informational message
  if (event.status === 'draft') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
          <Card className="max-w-2xl w-full">
            <CardContent className="p-8">
              <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Lock className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h1 
                  className="text-2xl font-bold text-gray-900 mb-2"
                  data-testid="draft-heading"
                >
                  This event is not yet published
                </h1>
                <p className="text-gray-600 mb-4" data-testid="draft-message">
                  This is a draft event that's still being created. Only you (the creator) and administrators can view it.
                </p>
                
                {/* Show basic event info */}
                {event.title && (
                  <div className="bg-gray-50 rounded-lg p-4 mt-4">
                    <p className="text-sm font-medium text-gray-500 mb-1">Event Title</p>
                    <p className="text-lg font-semibold text-gray-900">{event.title}</p>
                  </div>
                )}
                
                <div className="flex gap-3 mt-6">
                  <Button 
                    onClick={() => window.location.href = `/event-builder/${event.id}`}
                    data-testid="button-continue-editing"
                  >
                    Continue Editing
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => window.location.href = '/creator-dashboard'}
                    data-testid="button-dashboard"
                  >
                    Go to Dashboard
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

  // PENDING STATUS - Show preview banner if viewing with token
  const isPending = event.status === 'pending' || event.status === 'pending_approval';
  const isApproved = event.status === 'approved' || event.status === 'published';

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy");
    } catch {
      return dateString;
    }
  };

  // DATA CONTRACT: Currency must come from experience.currency - default EUR for migration
  const formatCurrency = (amount: number | string | null | undefined, currency: string = 'eur') => {
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : Number(amount || 0);
    const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
    if (!currency || currency === 'eur') {
      // Silence warning for EUR default since it's expected
    }
    const currencySymbols: { [key: string]: string } = {
      usd: '$',
      eur: '€',
      gbp: '£',
    };
    const symbol = currencySymbols[currency.toLowerCase()] || '€';
    return `${symbol}${safeAmount.toLocaleString(undefined, {
      minimumFractionDigits: safeAmount % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  };

  const getLowestPrice = () => {
    const roomPrices = event.pricing.rooms
      ?.map(room => Number(room.price || 0))
      .filter(price => Number.isFinite(price) && price > 0) || [];

    if (roomPrices.length > 0) {
      return Math.min(...roomPrices);
    }

    const directPrice = Number(event.pricing.pricePerPerson || event.pricing.basePrice || 0);
    return Number.isFinite(directPrice) && directPrice > 0 ? directPrice : null;
  };

  const getTotalAvailableSpots = () => {
    if (!event.pricing.rooms || event.pricing.rooms.length === 0) {
      return null;
    }
    return event.pricing.rooms.reduce((total, room) => total + room.availableSpots, 0);
  };

  const lowestPrice = getLowestPrice();
  const totalSpots = getTotalAvailableSpots();
  const depositAmount = Number(event.pricing.depositAmount || 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      {/* PREVIEW BANNER - Show when viewing pending event with token */}
      {isPending && previewToken && (
        <div className="bg-yellow-50 border-b border-yellow-200" data-testid="preview-banner">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-yellow-700" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900" data-testid="preview-banner-text">
                  Preview Mode — This event is pending approval and not yet public. You're viewing it with a preview token.
                </p>
              </div>
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                Pending
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* STATUS BANNER - Show when creator/admin views pending event without token */}
      {isPending && !previewToken && (
        <div className="bg-blue-50 border-b border-blue-200" data-testid="status-banner-pending">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-blue-700" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900" data-testid="status-banner-text">
                  This event is pending approval. It's not yet visible to the public.
                </p>
              </div>
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
                Pending Approval
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section - Full-width cover image with title, dates, and location overlay */}
      <div className="relative w-full h-[500px] bg-gray-900">
        {/* Cover Image */}
        {event.cover_image && (
          <img
            src={event.cover_image}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="img-cover"
          />
        )}
        
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/40" />
        
        {/* Content Overlay */}
        <div className="absolute inset-0 flex items-end">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
            <div className="text-white">
              {/* Title */}
              <h1 
                className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4"
                data-testid="text-title"
              >
                {event.title}
              </h1>
              
              {/* MVG Badge */}
              {event.mvg.enabled && (
                <div className="mb-4">
                  <Badge 
                    variant="secondary" 
                    className="bg-white/20 text-white border-white/40 backdrop-blur-sm hover:bg-white/30 text-sm font-medium px-3 py-1.5"
                    data-testid="badge-mvg"
                  >
                    <Users className="w-4 h-4 mr-1.5" />
                    Minimum {event.mvg.minimum_required} participant{event.mvg.minimum_required > 1 ? 's' : ''} to confirm
                  </Badge>
                </div>
              )}
              
              {/* Dates and Location */}
              <div className="flex flex-wrap gap-6 text-lg mb-6">
                {/* Dates */}
                <div className="flex items-center gap-2" data-testid="text-dates">
                  <Calendar className="w-5 h-5" />
                  <span>
                    {formatDate(event.start_date)}
                    {event.end_date && ` - ${formatDate(event.end_date)}`}
                    {event.duration && ` (${event.duration} day${event.duration > 1 ? 's' : ''})`}
                  </span>
                </div>
                
                {/* Location */}
                {event.venue?.location && (
                  <div className="flex items-center gap-2" data-testid="text-location">
                    <MapPin className="w-5 h-5" />
                    <span>{event.venue.location}</span>
                  </div>
                )}
              </div>
              
              {/* CTA Button */}
              <div>
                <Button 
                  size="lg" 
                  className="bg-white text-gray-900 hover:bg-gray-100 font-semibold px-8 py-6 text-lg"
                  data-testid="button-book-now"
                >
                  Book Now
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Facts Section */}
      <ChatTeaser experienceId={event.id} />
      <EventSocialProofToast experienceId={event.id} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <Card className="shadow-lg">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Facts</h2>
            <div className="flex flex-wrap gap-8">
              {/* Lowest Price */}
              {lowestPrice !== null && (
                <div className="flex items-center gap-3" data-testid="fact-lowest-price">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">From</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(lowestPrice, event.pricing.currency)}
                    </p>
                  </div>
                </div>
              )}

              {event.pricing.depositEnabled && depositAmount > 0 && (
                <div className="flex items-center gap-3" data-testid="fact-deposit-amount">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Deposit</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(depositAmount, event.pricing.currency)}
                    </p>
                  </div>
                </div>
              )}

              {/* Duration */}
              {event.duration && (
                <div className="flex items-center gap-3" data-testid="fact-duration">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Duration</p>
                    <p className="text-xl font-bold text-gray-900">
                      {event.duration} Day{event.duration > 1 ? 's' : ''} / {event.duration - 1} Night{event.duration - 1 !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              )}

              {/* Group Size */}
              {totalSpots !== null && (
                <div className="flex items-center gap-3" data-testid="fact-group-size">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Group Size</p>
                    <p className="text-xl font-bold text-gray-900">
                      {totalSpots} Spot{totalSpots !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              )}

              {/* MVG Progress */}
              {event.mvg.enabled && (
                <div className="flex items-center gap-3" data-testid="fact-mvg-progress">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Joined</p>
                    <p className="text-xl font-bold text-gray-900">
                      {event.mvg.current_signups} / {event.mvg.minimum_required}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* About the Experience Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card>
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4" data-testid="heading-about">
              About the Experience
            </h2>
            
            {/* Short Description */}
            {event.short_description && (
              <p className="text-lg text-gray-700 mb-6 leading-relaxed" data-testid="text-short-description">
                {event.short_description}
              </p>
            )}
            
            {/* Full Description */}
            {event.full_description && (
              <div className="prose max-w-none" data-testid="text-full-description">
                <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {event.full_description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Photo Gallery Section */}
      {event.gallery && event.gallery.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <Card>
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6" data-testid="heading-gallery">
                Photo Gallery
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {event.gallery
                  .sort((a, b) => a.order - b.order)
                  .map((photo) => (
                    <div 
                      key={photo.id} 
                      className="relative aspect-video overflow-hidden rounded-lg bg-gray-100 group"
                      data-testid={`gallery-photo-${photo.id}`}
                    >
                      <img
                        src={photo.imageUrl}
                        alt={photo.caption || 'Gallery photo'}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {photo.caption && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-3 text-sm backdrop-blur-sm">
                          {photo.caption}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* What's Included Section */}
      {((event.amenities && event.amenities.length > 0) || (event.services && event.services.length > 0)) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <Card>
            <CardContent className="p-6 sm:p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6" data-testid="heading-whats-included">
                What's Included
              </h2>
              
              <div className="space-y-6">
                {/* Amenities */}
                {event.amenities && event.amenities.length > 0 && (
                  <div aria-labelledby="included-amenities-heading">
                    <h3 
                      id="included-amenities-heading" 
                      className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide"
                    >
                      Amenities & Facilities
                    </h3>
                    <div 
                      className="flex flex-wrap gap-2 sm:gap-3" 
                      role="list" 
                      aria-label="Included amenities and facilities"
                    >
                      {event.amenities.map((amenity, index) => (
                        <Badge 
                          key={amenity.id || index} 
                          variant="secondary"
                          className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-full"
                          data-testid={`badge-amenity-${index}`}
                          role="listitem"
                          tabIndex={0}
                          aria-label={`Amenity: ${amenity.name}`}
                        >
                          {amenity.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Services */}
                {event.services && event.services.length > 0 && (
                  <div aria-labelledby="included-services-heading">
                    <h3 
                      id="included-services-heading" 
                      className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide"
                    >
                      Services & Add-ons
                    </h3>
                    <div 
                      className="flex flex-wrap gap-2 sm:gap-3" 
                      role="list" 
                      aria-label="Included services and add-ons"
                    >
                      {event.services.map((service, index) => (
                        <Badge 
                          key={service.id || index} 
                          variant="outline"
                          className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-full border-2"
                          data-testid={`badge-service-${index}`}
                          role="listitem"
                          tabIndex={0}
                          aria-label={`Service: ${service.name}`}
                        >
                          {service.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Itinerary Section */}
      {event.itinerary && event.itinerary.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <Card>
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6" data-testid="heading-itinerary">
                Itinerary
              </h2>
              
              <Accordion type="single" collapsible className="w-full">
                {event.itinerary.map((day: any, index: number) => (
                  <AccordionItem 
                    key={day.id || index} 
                    value={`day-${index}`}
                    data-testid={`itinerary-day-${index + 1}`}
                  >
                    <AccordionTrigger className="text-left hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary font-semibold">{index + 1}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {day.title || `Day ${index + 1}`}
                          </p>
                          {day.subtitle && (
                            <p className="text-sm text-gray-600">{day.subtitle}</p>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pl-13 pt-2 space-y-4">
                        {day.description && (
                          <p className="text-gray-600 leading-relaxed">{day.description}</p>
                        )}
                        
                        {day.activities && day.activities.length > 0 && (
                          <div className="space-y-3">
                            {day.activities.map((activity: any, actIndex: number) => (
                              <div 
                                key={activity.id || actIndex} 
                                className="flex gap-3 text-sm"
                                data-testid={`activity-${index}-${actIndex}`}
                              >
                                {activity.time && (
                                  <div className="flex items-center gap-1.5 text-gray-500 min-w-[80px]">
                                    <Clock className="w-4 h-4" />
                                    <span>{activity.time}</span>
                                  </div>
                                )}
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">{activity.title}</p>
                                  {activity.description && (
                                    <p className="text-gray-600 mt-1">{activity.description}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rooms & Pricing Section */}
      {event.pricing.rooms && event.pricing.rooms.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <Card>
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6" data-testid="heading-rooms-pricing">
                Rooms & Pricing
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {event.pricing.rooms.map((room, index) => (
                  <Card key={room.id || index} className="overflow-hidden" data-testid={`room-card-${index}`}>
                    {/* Room Image */}
                    {room.gallery && room.gallery.length > 0 && (
                      <div className="relative aspect-video overflow-hidden bg-gray-100">
                        <img
                          src={room.gallery[0]}
                          alt={room.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          data-testid={`room-image-${index}`}
                        />
                      </div>
                    )}
                    
                    {/* Room Details */}
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-lg text-gray-900 mb-2" data-testid={`room-name-${index}`}>
                        {room.name}
                      </h3>
                      
                      <div className="space-y-2">
                        {/* Price */}
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-gray-900">
                            {formatCurrency(room.price, event.pricing.currency)}
                          </span>
                          <span className="text-sm text-gray-600">per person</span>
                        </div>
                        
                        {/* Discount */}
                        {room.discount && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            {room.discount.title} -{room.discount.type === 'percentage' 
                              ? `${room.discount.value}%` 
                              : formatCurrency(room.discount.value, event.pricing.currency)}
                          </Badge>
                        )}
                        
                        {/* Spots Left */}
                        <p className="text-sm text-gray-600">
                          {room.availableSpots} spot{room.availableSpots !== 1 ? 's' : ''} left
                        </p>
                        
                        {/* Notes */}
                        {room.notes && (
                          <p className="text-sm text-gray-600 mt-3">{room.notes}</p>
                        )}
                        
                        {/* CTA Button */}
                        <Button 
                          className="w-full mt-4" 
                          disabled
                          data-testid={`button-select-room-${index}`}
                        >
                          Select Room
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MVG Status Section */}
      {event.mvg.enabled && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <Card>
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6" data-testid="heading-mvg-status">
                Event Confirmation Status
              </h2>
              
              <div className="space-y-4">
                {/* Progress Info */}
                <div className="flex items-center justify-between mb-2" data-testid="mvg-progress-text">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-gray-900">
                      {event.mvg.current_signups} of {event.mvg.minimum_required} participants joined
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {Math.round((event.mvg.current_signups / event.mvg.minimum_required) * 100)}%
                  </span>
                </div>
                
                {/* Progress Bar */}
                <Progress 
                  value={(event.mvg.current_signups / event.mvg.minimum_required) * 100} 
                  className="h-3"
                  data-testid="mvg-progress-bar"
                />
                
                {/* Status Note */}
                <p className="text-sm text-gray-600" data-testid="mvg-status-indicator">
                  {event.lifecycleStatus === 'confirmed' ? (
                    <span className="text-green-700 font-medium" data-testid="mvg-reached-badge">
                      ✓ Group confirmed — this trip is happening!
                    </span>
                  ) : event.lifecycleStatus === 'cancelled' ? (
                    <span className="text-red-700 font-medium" data-testid="mvg-cancelled-badge">
                      ✗ Trip cancelled — minimum group size was not reached.
                    </span>
                  ) : (
                    <span>
                      Minimum group size: {event.mvg.minimum_required} - Confirmed once {event.mvg.minimum_required} join
                      {event.mvg.soft_hold_deadline && ` by ${formatDate(event.mvg.soft_hold_deadline)}`}
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Venue Section */}
      {event.venue && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <VenueInfoCard venue={event.venue} />
        </div>
      )}

      {/* Creator Section */}
      {event.creator && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900" data-testid="heading-creator">
              Your Host
            </h2>
          </div>
          <CreatorProfileCard
            creator={{
              id: event.creator.id,
              displayName: event.creator.displayName || event.creator.name || undefined,
              bio: event.creator.bio || undefined,
              avatarUrl: event.creator.avatarUrl || event.creator.photo || undefined,
              baseLocation: event.creator.baseLocation || undefined,
              expertise: event.creator.expertise || [],
              experienceLevel: event.creator.experienceLevel || undefined,
              isVerified: event.creator.isVerified,
              averageRating: event.creator.averageRating ?? undefined,
              totalExperiences: event.creator.totalExperiences ?? undefined,
              socialLink: event.creator.socialLink || undefined,
            }}
            variant="compact"
          />
        </div>
      )}

      {promoterReferralProfile ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <PromoterReferralCard promoter={promoterReferralProfile} />
        </div>
      ) : null}

      {/* Service Needs (Optional) */}
      {event.services && event.services.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <Card>
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6" data-testid="heading-services">
                Service Add-Ons
              </h2>
              
              <div className="flex flex-wrap gap-3">
                {event.services.map((service, index) => (
                  <div
                    key={service.id || index}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full border border-primary/20"
                    data-testid={`service-chip-${index}`}
                  >
                    <span className="font-medium">{service.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Final CTA Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-8 md:p-12">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <h2 className="text-3xl font-bold text-gray-900 mb-2" data-testid="heading-final-cta">
                  Ready to Join?
                </h2>
                <p className="text-lg text-gray-600">
                  {event.mvg.enabled && event.mvg.current_signups < event.mvg.minimum_required
                    ? `Help us reach ${event.mvg.minimum_required} participants to confirm this experience`
                    : 'Secure your spot for this amazing experience'}
                </p>
                
                {/* Price reminder */}
                {lowestPrice !== null && (
                  <p className="text-sm text-gray-600 mt-2">
                    From {formatCurrency(lowestPrice, event.pricing.currency)} per person
                  </p>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                {event.mvg.enabled && event.mvg.current_signups < event.mvg.minimum_required ? (
                  <Button 
                    size="lg" 
                    className="px-8 py-6 text-lg font-semibold"
                    data-testid="button-join-waitlist"
                  >
                    Join Waitlist
                  </Button>
                ) : (
                  <Button 
                    size="lg" 
                    className="px-8 py-6 text-lg font-semibold"
                    data-testid="button-book-now-final"
                  >
                    Book Now
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
