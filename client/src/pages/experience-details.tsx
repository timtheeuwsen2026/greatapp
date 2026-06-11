import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import Navigation from "@/components/navigation";
import SimpleSmartButton from "@/components/simple-smart-button";
import ParticipantAvatars from "@/components/participant-avatars";
import { SocialProofGallery } from "@/components/SocialProofGallery";
import ParticipantList from "@/components/ParticipantList";
import { ParticipantInteractions } from "@/components/participant-interactions";
import MVGProgressWidget from "@/components/MVGProgressWidget";
import ShareButton from "@/components/ShareButton";
import { ShareKitModal } from "@/components/ShareKitModal";
import CreatorProfileCard from "@/components/creator-profile-card";
import PromoterReferralCard, { type PromoterReferralProfile } from "@/components/promoter-referral-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeMVGUpdates } from "@/hooks/useRealtimeUpdates";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeImageUrl } from "@/lib/utils";
import { useState, useEffect, useMemo, type ReactNode } from "react";
import { usePromoterAttribution } from "@/hooks/usePromoterAttribution";
import { 
  ExperienceWithStats, 
  ConvertReservationResponse, 
  Reservation, 
  Booking,
  ParticipantWithProfile,
  ExperienceAvailability 
} from "@shared/schema";
import { 
  MapPin, 
  Calendar, 
  Users, 
  Star, 
  Heart, 
  Share2,
  Clock,
  DollarSign,
  MessageCircle,
  Coffee,
  UserPlus,
  Timer,
  CheckCircle,
  AlertCircle,
  Shield,
  Briefcase,
  Ticket,
  Rocket
} from "lucide-react";

type CreatorTrustProfile = {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  displayName?: string | null;
  profilePhoto?: string | null;
  tagline?: string | null;
  bio?: string | null;
  location?: string | null;
  expertiseTags?: string[];
  socialLink?: string | null;
};

export default function ExperienceDetails() {
  // Support both singular and plural route patterns
  const [, singularParams] = useRoute("/experience/:id");
  const [, pluralParams] = useRoute("/experiences/:id");
  const [currentLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const experienceId = singularParams?.id || pluralParams?.id;
  const promoterRefCode = useMemo(
    () => new URLSearchParams(currentLocation.split("?")[1] || "").get("ref"),
    [currentLocation]
  );

  // Connect to WebSocket for real-time MVG updates
  const { isConnected } = useRealtimeMVGUpdates(experienceId || '');

  // Capture promoter attribution from URL (?ref=CODE)
  usePromoterAttribution();

  // Ticket selection state - auto-select first ticket when available
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const { data: experience, isLoading, error } = useQuery<ExperienceWithStats>({
    queryKey: ["/api/experiences", experienceId],
    enabled: !!experienceId,
  });

  // Helper function to get stable ticket ID (ticketSkus in JSON may not have id field, use sourceRoomId)
  const getTicketId = (ticket: any, index: number) => ticket.id || ticket.sourceRoomId || `ticket-${index}`;
  
  // Auto-select first available ticket or room when experience loads
  useEffect(() => {
    if (selectedTicketId) return; // Already selected
    
    // Try ticketSkus first
    if (experience?.ticketSkus && experience.ticketSkus.length > 0) {
      const firstAvailableIndex = experience.ticketSkus.findIndex((t: any) => {
        const spotsLeft = (t.ticketCapacity || 0) - (t.soldCount || 0);
        return spotsLeft > 0;
      });
      if (firstAvailableIndex >= 0) {
        const firstAvailable = experience.ticketSkus[firstAvailableIndex];
        setSelectedTicketId(getTicketId(firstAvailable, firstAvailableIndex));
        return;
      }
    }
    
    // Try rooms if no ticketSkus
    if (experience?.rooms && Array.isArray(experience.rooms) && experience.rooms.length > 0) {
      const ticketSkus = experience.ticketSkus || [];
      const firstAvailableRoom = experience.rooms.find((room: any) => {
        const matchingSku = ticketSkus.find((sku: any) => sku.sourceRoomId === room.id);
        const roomSoldCount = matchingSku?.soldCount || room.soldCount || 0;
        const roomAvailable = ((room.quantity || 1) * (room.capacity || 1)) - roomSoldCount;
        return roomAvailable > 0;
      });
      if (firstAvailableRoom) {
        const matchingSku = ticketSkus.find((sku: any) => sku.sourceRoomId === firstAvailableRoom.id);
        // Use sourceRoomId for consistency
        setSelectedTicketId(matchingSku?.sourceRoomId || matchingSku?.id || firstAvailableRoom.id);
      }
    }
  }, [experience?.ticketSkus, experience?.rooms, selectedTicketId]);
  
  // Get selected ticket details for CTA (handles both ticketSkus and rooms)
  const selectedTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    
    // Match by ticketId (id || sourceRoomId) - consistent with getTicketId helper
    if (experience?.ticketSkus) {
      const matchIndex = experience.ticketSkus.findIndex((t: any, i: number) => 
        getTicketId(t, i) === selectedTicketId
      );
      if (matchIndex >= 0) return experience.ticketSkus[matchIndex];
    }
    
    // Then try to find via room (for backwards compatibility)
    if (experience?.rooms && Array.isArray(experience.rooms)) {
      const ticketSkus = experience.ticketSkus || [];
      for (const room of experience.rooms) {
        const matchingSku = ticketSkus.find((sku: any) => sku.sourceRoomId === room.id);
        // Match by sourceRoomId
        if (matchingSku?.sourceRoomId === selectedTicketId || matchingSku?.id === selectedTicketId) {
          return matchingSku;
        }
        // If room.id matches and there's no sku, create a pseudo-ticket from room data
        if (room.id === selectedTicketId) {
          const roomAny = room as any;
          return {
            id: room.id,
            sourceRoomId: room.id,
            pricePerPerson: roomAny.pricePerPerson || 0,
            depositPerPerson: roomAny.depositPerPerson || 0,
            ticketName: room.name || roomAny.roomName
          };
        }
      }
    }
    
    return null;
  }, [experience?.ticketSkus, experience?.rooms, selectedTicketId]);

  // Check if current user is the experience creator
  const isCreator = experience?.creatorId === user?.id;

  // Check if user is authorized to see participant lists (privacy OR creator)
  const canViewParticipants = experience?.showParticipantList || isCreator;

  // Fetch participants with skills and role assignments
  const { data: participantsWithSkills } = useQuery({
    queryKey: ["/api/experiences", experienceId, "participants-with-skills"],
    enabled: !!experienceId && canViewParticipants,
  });

  // Fetch participants using the standard participants endpoint
  const { data: participants, isLoading: participantsLoading } = useQuery({
    queryKey: ["/api/experiences", experienceId, "participants"],
    enabled: !!experienceId && canViewParticipants,
  });

  // Fetch available participant roles for this experience
  const { data: participantRoles } = useQuery({
    queryKey: ["/api/experiences", experienceId, "participant-roles"],
    enabled: !!experienceId,
  });

  // Fetch role assignments for this experience
  const { data: roleAssignments } = useQuery({
    queryKey: ["/api/experiences", experienceId, "role-assignments"],
    enabled: !!experienceId,
  });

  // Fetch creator profile
  const { data: creatorProfile } = useQuery<CreatorTrustProfile>({
    queryKey: ["/api/users", experience?.creatorId],
    enabled: !!experience?.creatorId,
  });

  const { data: promoterProfile } = useQuery<PromoterReferralProfile>({
    queryKey: ["/api/promoter-profile/by-code", promoterRefCode ? encodeURIComponent(promoterRefCode) : ""],
    enabled: !!promoterRefCode,
    retry: false,
  });
  const promoterReferralProfile = promoterProfile as PromoterReferralProfile | undefined;
  const promoterReferralSection: ReactNode = promoterReferralProfile ? (
    <div className="mb-8">
      <PromoterReferralCard promoter={promoterReferralProfile} />
    </div>
  ) : null;

  // Fetch user's active reservations
  const { data: userReservations, refetch: refetchReservations } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    enabled: !!isAuthenticated,
  });

  // Fetch experience availability (including reservations)
  const { data: availabilityData, refetch: refetchAvailability } = useQuery<ExperienceAvailability>({
    queryKey: ["/api/experiences", experienceId, "availability"],
    enabled: !!experienceId,
  });

  // Check if user has an active reservation for this experience
  const userActiveReservation = userReservations?.find(
    (r: Reservation) => r.experienceId === experienceId && r.status === 'active'
  );

  // Reservation creation mutation
  const createReservationMutation = useMutation({
    mutationFn: async (reservationNotes?: string) => {
      const response = await apiRequest('POST', `/api/experiences/${experienceId}/reserve`, { reservationNotes });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Spot Reserved!",
        description: "Your spot has been temporarily reserved. Complete your booking to secure it.",
      });
      refetchReservations();
      refetchAvailability();
    },
    onError: (error: any) => {
      toast({
        title: "Reservation Failed",
        description: error.message || "Unable to reserve spot. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reservation conversion mutation
  const convertReservationMutation = useMutation({
    mutationFn: async (reservationId: string): Promise<ConvertReservationResponse> => {
      const response = await apiRequest('POST', `/api/reservations/${reservationId}/convert`);
      return response.json();
    },
    onSuccess: (data) => {
      // Redirect to payment page with the client secret
      window.location.href = `/checkout/${experienceId}?clientSecret=${data.clientSecret}&bookingId=${data.bookingId}`;
    },
    onError: (error: any) => {
      toast({
        title: "Conversion Failed",
        description: error.message || "Unable to convert reservation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Cancel reservation mutation
  const cancelReservationMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      const response = await apiRequest('DELETE', `/api/reservations/${reservationId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Reservation Cancelled",
        description: "Your spot reservation has been cancelled and is now available for others.",
      });
      refetchReservations();
      refetchAvailability();
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation Failed",
        description: error.message || "Unable to cancel reservation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Countdown timer for active reservation
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  useEffect(() => {
    if (!userActiveReservation) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const expiry = new Date(userActiveReservation.expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeRemaining("Expired");
        refetchReservations(); // Refresh to update status
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) {
          setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
        } else if (hours > 0) {
          setTimeRemaining(`${hours}h ${minutes}m`);
        } else {
          setTimeRemaining(`${minutes}m`);
        }
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [userActiveReservation, refetchReservations]);

  const handleCreateReservation = () => {
    createReservationMutation.mutate(undefined);
  };

  const handleConvertReservation = () => {
    if (userActiveReservation) {
      convertReservationMutation.mutate(userActiveReservation.id);
    }
  };

  const handleCancelReservation = () => {
    if (userActiveReservation) {
      cancelReservationMutation.mutate(userActiveReservation.id);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <p className="text-red-600 text-lg">Failed to load experience details.</p>
            <Link href="/">
              <Button className="mt-4">Back to Home</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="w-full h-96 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Skeleton className="h-8 w-3/4 mb-4" />
              <Skeleton className="h-24 w-full mb-6" />
              <Skeleton className="h-64 w-full" />
            </div>
            <div>
              <Skeleton className="h-80 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!experience) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <p className="text-gray-600 text-lg">Experience not found.</p>
            <Link href="/">
              <Button className="mt-4">Back to Home</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", { 
      weekday: "long",
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });
  };

  // Format currency based on experience currency setting
  // DATA CONTRACT: Currency must come from experience.currency - never default to USD
  const formatCurrency = (amount: number | string, currency?: string | null) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (Number.isNaN(numAmount)) return 'Price TBA';
    if (numAmount === 0) return 'Free';
    if (numAmount < 0) return 'Price TBA';
    if (!currency) {
      console.warn('[DataContract] Currency missing - using experience.currency is required');
    }
    const currencyCode = (currency || 'EUR').toUpperCase();
    const symbols: Record<string, string> = {
      USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
    };
    const symbol = symbols[currencyCode] || currencyCode + ' ';
    return `${symbol}${numAmount.toFixed(0)}`;
  };

  // Get pricing from ticket SKUs or fall back to legacy fields
  const ticketSkus = experience.ticketSkus || [];
  const hasMultipleTicketTypes = ticketSkus.length > 1;
  
  // Calculate effective price: lowest ticket price or legacy price
  const getEffectivePrice = (): { minPrice: number; maxPrice: number; hasRange: boolean } => {
    if (ticketSkus.length > 0) {
      const prices = ticketSkus
        .map((s: any) => Number(s.pricePerPerson))
        .filter((p: number) => !Number.isNaN(p) && p >= 0);
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        return { minPrice, maxPrice, hasRange: minPrice !== maxPrice };
      }
    }
    // Fall back to legacy pricePerPerson or price
    const legacyPrice = (experience.pricePerPerson && parseFloat(experience.pricePerPerson as string) > 0)
      ? parseFloat(experience.pricePerPerson as string)
      : parseFloat(experience.price || '0');
    return { minPrice: legacyPrice, maxPrice: legacyPrice, hasRange: false };
  };
  
  const { minPrice: effectivePrice, hasRange: hasPriceRange } = getEffectivePrice();
  const formattedPrice = effectivePrice > 0 ? effectivePrice.toFixed(2) : '0.00';

  // DATA CONTRACT: Get fixed deposit from ticketSkus.depositPerPerson or experience.depositAmount
  const depositAmount = (() => {
    if (ticketSkus.length > 0) {
      const deposits = ticketSkus.map((s: any) => s.depositPerPerson || 0).filter((d: number) => d > 0);
      if (deposits.length > 0) return Math.min(...deposits);
    }
    if (experience.depositAmount) {
      const parsed = parseFloat(String(experience.depositAmount));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 0;
  })();

  // FORMING trips: spots left to MVG minimum. Non-FORMING trips: capacity remaining.
  const liveParticipantCount = experience?.currentParticipants || 0;
  const spotsLeft = experience?.requireMinimumParticipants
    ? Math.max(0, (experience?.minimumParticipants || 0) - liveParticipantCount)
    : Math.max(0, (experience?.maxParticipants || 0) - liveParticipantCount);
  const averageRating = experience.stats?.averageRating || 0;

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero Image */}
      <div className="relative h-96 overflow-hidden">
        <img 
          src={normalizeImageUrl(experience.coverImageUrl) || "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&h=600"} 
          alt={experience.title}
          className={`w-full h-full object-cover ${experience.lifecycleStatus === 'cancelled' ? 'grayscale opacity-70' : ''}`}
        />
        <div className="absolute inset-0 bg-black/20"></div>

        {/* FORMING overlay — bold "HELP US MAKE IT HAPPEN" call-to-action */}
        {experience.lifecycleStatus === 'forming' && experience.requireMinimumParticipants && (() => {
          // liveParticipantCount comes from the live booking count (getMVGProgress) — not the stale DB column
          const liveCurrent = liveParticipantCount;
          const liveMin = experience.minimumParticipants ?? experience.mvgMin ?? 1;
          const pct = Math.min(Math.round((liveCurrent / liveMin) * 100), 99);
          const needed = Math.max(0, liveMin - liveCurrent);
          return (
            <div
              className="absolute inset-x-0 bottom-0 flex flex-col justify-end pb-5 px-6 pt-16"
              style={{ background: 'linear-gradient(to top, rgba(88,28,135,0.92) 0%, rgba(126,34,206,0.6) 50%, transparent 100%)' }}
              data-testid="hero-forming-overlay"
            >
              <div className="h-2 rounded-full bg-white/30 overflow-hidden w-full max-w-sm mb-3">
                <div
                  className="h-full rounded-full bg-violet-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-lg">
                {needed === 1
                  ? '🔥 Just 1 more traveler to make this real!'
                  : needed <= 3
                  ? `🔥 Just ${needed} more travelers to make this real!`
                  : needed <= 6
                  ? `⚡ ${needed} more travelers needed to confirm this trip!`
                  : `👥 ${needed} more travelers needed to make this happen!`}
              </p>
            </div>
          );
        })()}

        {/* CONFIRMED overlay — green confirmation banner */}
        {experience.lifecycleStatus === 'confirmed' && experience.requireMinimumParticipants && (
          <div
            className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-6 py-4"
            style={{ background: 'linear-gradient(to top, rgba(6,78,59,0.90), transparent)' }}
            data-testid="hero-confirmed-overlay"
          >
            <CheckCircle className="h-5 w-5 text-emerald-300 shrink-0" />
            <div>
              <p className="text-sm font-bold text-white">Group confirmed — this trip is happening!</p>
              <p className="text-xs text-emerald-200">Your deposit is secured</p>
            </div>
          </div>
        )}

        {/* CANCELLED overlay — greyed-out badge */}
        {experience.lifecycleStatus === 'cancelled' && (
          <div className="absolute inset-0 flex items-center justify-center" data-testid="hero-cancelled-overlay">
            <div className="bg-gray-900/75 backdrop-blur-sm text-white rounded-xl px-6 py-3 flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-gray-300" />
              <div>
                <p className="font-bold text-gray-100">Trip Cancelled</p>
                <p className="text-xs text-gray-400">Minimum group size was not reached</p>
              </div>
            </div>
          </div>
        )}

        <div className="absolute top-4 right-4 flex space-x-2">
          <Button variant="secondary" size="sm">
            <Heart className="h-4 w-4 mr-2" />
            Save
          </Button>
          <ShareButton experienceId={experience.id} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary">
                    {experience.category.replace("_", " & ")}
                  </Badge>
                  {/* Lifecycle status badge - single source of truth */}
                  {experience.lifecycleStatus === 'forming' && (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200" data-testid="lifecycle-badge-forming">
                      <Shield className="h-3 w-3 mr-1" />
                      Forming
                    </Badge>
                  )}
                  {experience.lifecycleStatus === 'confirmed' && experience.requireMinimumParticipants && (
                    <Badge className="bg-green-100 text-green-800 border-green-200" data-testid="lifecycle-badge-confirmed">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Confirmed
                    </Badge>
                  )}
                  {experience.lifecycleStatus === 'cancelled' && (
                    <Badge className="bg-red-100 text-red-800 border-red-200" data-testid="lifecycle-badge-cancelled">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Cancelled
                    </Badge>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <Star className="h-4 w-4 text-yellow-400 fill-current" />
                  <span className="text-sm font-medium">{averageRating.toFixed(1)}</span>
                  <span className="text-sm text-gray-500">({experience.reviews?.length || 0} reviews)</span>
                </div>
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                {experience.title}
              </h1>
              
              <div className="flex flex-wrap items-center gap-4 text-gray-600 mb-6">
                <div className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  <span>{experience.location}</span>
                </div>
                <div className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  <span>{experience.startDate ? formatDate(experience.startDate.toString()) : 'TBD'}</span>
                  {experience.startDate !== experience.endDate && experience.endDate && (
                    <span> - {formatDate(experience.endDate.toString())}</span>
                  )}
                </div>
                <div className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  {experience.requireMinimumParticipants ? (
                    <span>{liveParticipantCount}/{experience.minimumParticipants || 0} joined</span>
                  ) : (
                    <span>{liveParticipantCount}/{experience.maxParticipants || 0} spots taken</span>
                  )}
                </div>
              </div>

              {/* Social Proof Avatar Gallery — real confirmed participants */}
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700" data-testid="social-proof-section">
                <SocialProofGallery experienceId={experience.id} />
              </div>
            </div>

            <Separator className="my-6" />

            {/* Description */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">About this Experience</h2>
              <p className="text-gray-700 leading-relaxed">
                {experience.description || experience.shortDescription}
              </p>
            </div>

            {/* Creator Profile Section - Always show when we have a creatorId */}
            {experience.creatorId && (
              <div className="mb-8">
                <h2 className="mb-4 text-2xl font-semibold">Your Host</h2>
                <CreatorProfileCard
                  creator={{
                    id: experience.creatorId,
                    displayName:
                      creatorProfile?.displayName ||
                      [creatorProfile?.firstName, creatorProfile?.lastName].filter(Boolean).join(" ") ||
                      "Experience Host",
                    bio: creatorProfile?.bio || undefined,
                    avatarUrl:
                      normalizeImageUrl(creatorProfile?.profilePhoto || creatorProfile?.profileImageUrl || "") ||
                      undefined,
                    baseLocation: creatorProfile?.location || undefined,
                    expertise: creatorProfile?.expertiseTags || [],
                    socialLink: creatorProfile?.socialLink || null,
                  }}
                  variant="compact"
                />
              </div>
            )}

            {promoterReferralSection as any}

            {/* Social-First Discovery Section */}
            <Card className="mb-8 border-primary/20 bg-gradient-to-r from-primary/5 to-purple-600/5">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <Users className="h-5 w-5 mr-2 text-primary" />
                    {experience.requireMinimumParticipants
                      ? `Meet Your Fellow Travelers (${liveParticipantCount}/${experience.minimumParticipants || 0} joined)`
                      : `Meet Your Fellow Travelers (${liveParticipantCount} joined)`}
                  </span>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="text-primary border-primary/20">
                      {spotsLeft} {experience.requireMinimumParticipants ? "more needed" : "spots left"}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Join the Community Before Booking */}
                  <div className="bg-white/50 border border-primary/10 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-2">Connect Before You Book</h3>
                        <p className="text-sm text-gray-600 mb-3">
                          Join our pre-experience community to meet fellow travelers, share intentions, 
                          and start building connections before your journey begins.
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
                          <span className="flex items-center">
                            <MessageCircle className="w-3 h-3 mr-1" />
                            Group chat
                          </span>
                          <span className="flex items-center">
                            <Coffee className="w-3 h-3 mr-1" />
                            Virtual meetups
                          </span>
                          <span className="flex items-center">
                            <UserPlus className="w-3 h-3 mr-1" />
                            Connect individually
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <SimpleSmartButton 
                          action="join_community"
                          size="sm" 
                          className="btn-gradient"
                        >
                          Join Community
                        </SimpleSmartButton>
                      </div>
                    </div>
                  </div>

                  {/* Current Participants */}
                  {liveParticipantCount > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">
                          Current Participants ({liveParticipantCount})
                        </h4>
                        <Link href="/community-hub">
                          <Button variant="outline" size="sm" data-testid="button-join-hub">
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Join Hub
                          </Button>
                        </Link>
                      </div>
                      
                      {/* Conditional rendering based on showParticipantList privacy toggle */}
                      {experience.showParticipantList ? (
                        // Show full participant list when privacy setting allows
                        <div className="space-y-4">
                          <ParticipantAvatars 
                            participants={Array.isArray(participants) ? participants as Array<{userId?: string; firstName?: string; lastName?: string; profileImageUrl?: string; displayName?: string;}> : []}
                            maxDisplay={8}
                            totalCount={liveParticipantCount}
                          />
                          
                          {canViewParticipants && participantsLoading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="bg-white border border-gray-200 rounded-lg p-3">
                                  <div className="flex items-center space-x-3">
                                    <Skeleton className="w-10 h-10 rounded-full" />
                                    <div className="flex-1">
                                      <Skeleton className="h-4 w-24 mb-2" />
                                      <Skeleton className="h-3 w-32" />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <ParticipantList 
                              participants={Array.isArray(participants) ? participants : []}
                              showList={true}
                              totalCount={liveParticipantCount}
                              isLoading={canViewParticipants && participantsLoading}
                            />
                          )}
                        </div>
                      ) : (
                        // Show only count and basic info when privacy setting is disabled
                        <div className="text-center py-6" data-testid="participants-privacy-message">
                          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Users className="h-8 w-8 text-primary" />
                          </div>
                          <h4 className="font-semibold text-gray-900 mb-2">
                            {liveParticipantCount} People Joined
                          </h4>
                          <p className="text-gray-600 text-sm mb-4">
                            Participant details are private for this experience, but you can still join the community and connect after booking.
                          </p>
                          <div className="flex justify-center">
                            <SimpleSmartButton 
                              action="join_community"
                              size="sm" 
                              className="btn-gradient"
                              data-testid="button-join-community-private"
                            >
                              Join Community
                            </SimpleSmartButton>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">Be the First to Join!</h3>
                      <p className="text-gray-600 mb-4">
                        Start building the community for this transformational experience.
                      </p>
                      <div className="flex justify-center">
                        <SimpleSmartButton 
                          action="join_community"
                          size="sm" 
                          className="btn-gradient"
                          data-testid="button-join-community-first"
                        >
                          Join Community
                        </SimpleSmartButton>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Itinerary */}
            {experience.itinerary && Array.isArray(experience.itinerary) && experience.itinerary.length > 0 && (
              <Card className="mb-8" data-testid="itinerary-section">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Calendar className="h-5 w-5 mr-2 text-primary" />
                    Itinerary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {experience.itinerary.map((day: any, dayIndex: number) => (
                      <div key={dayIndex} className="border rounded-lg overflow-hidden" data-testid={`itinerary-day-${dayIndex + 1}`}>
                        <div className="bg-primary/10 px-4 py-3 flex items-center">
                          <div className="flex-shrink-0 w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                            {day.day || dayIndex + 1}
                          </div>
                          <h4 className="font-semibold text-lg text-gray-900">
                            {day.title || `Day ${day.day || dayIndex + 1}`}
                          </h4>
                        </div>
                        <div className="p-4">
                          {day.timeSlots && Array.isArray(day.timeSlots) && day.timeSlots.length > 0 ? (
                            <div className="space-y-3">
                              {day.timeSlots.map((slot: any, slotIndex: number) => (
                                <div key={slotIndex} className="flex items-start" data-testid={`itinerary-slot-${dayIndex + 1}-${slotIndex + 1}`}>
                                  <div className="flex items-center text-sm text-gray-500 w-20 flex-shrink-0">
                                    <Clock className="h-4 w-4 mr-1" />
                                    {slot.time || slot.startTime || '—'}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-gray-800">{slot.activity || slot.description || 'Activity'}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : day.description ? (
                            <p className="text-gray-600">{day.description}</p>
                          ) : (
                            <p className="text-gray-500 italic">Activities to be announced</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Participant Roles Section */}
            {participantRoles && Array.isArray(participantRoles) && participantRoles.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <UserPlus className="h-5 w-5 mr-2 text-primary" />
                    Participant Roles & Contributions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.isArray(participantRoles) ? participantRoles.map((role: any) => (
                      <div key={role.id} className="border rounded-lg p-4 hover:border-primary/30 transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900" data-testid={`text-role-name-${role.id}`}>
                              {role.name}
                            </h4>
                            <p className="text-sm text-gray-600 mb-2" data-testid={`text-role-description-${role.id}`}>
                              {role.description}
                            </p>
                          </div>
                          <Badge variant="secondary" className="ml-2" data-testid={`badge-role-capacity-${role.id}`}>
                            {role.currentCount || 0}/{role.maxCount} filled
                          </Badge>
                        </div>
                        
                        {role.requirements && role.requirements.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-700 mb-1">Required Skills:</p>
                            <div className="flex flex-wrap gap-1">
                              {role.requirements.map((skill: string) => (
                                <Badge key={skill} variant="outline" className="text-xs" data-testid={`badge-required-skill-${skill}-${role.id}`}>
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {role.benefits && role.benefits.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-700 mb-1">Benefits:</p>
                            <ul className="text-xs text-gray-600 list-disc list-inside">
                              {role.benefits.map((benefit: string, index: number) => (
                                <li key={index} data-testid={`text-role-benefit-${index}-${role.id}`}>{benefit}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {isAuthenticated && (role.currentCount || 0) < role.maxCount && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="w-full mt-2"
                            data-testid={`button-apply-role-${role.id}`}
                            onClick={() => {
                              // TODO: Implement role application
                              toast({
                                title: "Role Application",
                                description: "Role application feature coming soon!",
                              });
                            }}
                          >
                            Apply for Role
                          </Button>
                        )}
                      </div>
                    )) : null}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Staff & Facilitator Roles Section (from experience.roles) */}
            {experience.roles && Array.isArray(experience.roles) && experience.roles.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="h-5 w-5 mr-2 text-primary" />
                    Staff & Facilitators
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {experience.roles.map((role: any, index: number) => (
                      <div 
                        key={role.id || index} 
                        className="border rounded-lg p-4 hover:border-primary/30 transition-colors"
                        data-testid={`staff-role-card-${index}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900" data-testid={`text-staff-role-name-${index}`}>
                              {role.name || role.title || `Role ${index + 1}`}
                            </h4>
                            {role.description && (
                              <p className="text-sm text-gray-600 mt-1" data-testid={`text-staff-role-description-${index}`}>
                                {role.description}
                              </p>
                            )}
                          </div>
                          {role.type && (
                            <Badge variant="outline" className="ml-2" data-testid={`badge-staff-role-type-${index}`}>
                              {role.type}
                            </Badge>
                          )}
                        </div>
                        {role.assignedTo && (
                          <div className="mt-2 pt-2 border-t">
                            <p className="text-xs text-gray-500">Assigned to: <span className="font-medium text-gray-700">{role.assignedTo}</span></p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Enhanced Participant Interactions */}
            {isAuthenticated && (
              <ParticipantInteractions 
                experienceId={experienceId!}
                isCreator={experience.creatorId === user?.id}
              />
            )}

            {/* Amenities Section */}
            {experience.amenities && Array.isArray(experience.amenities) && experience.amenities.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Coffee className="h-5 w-5 mr-2 text-primary" />
                    What's Included
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {experience.amenities.map((amenity: any, index: number) => (
                      <Badge 
                        key={amenity.id || index} 
                        variant="secondary" 
                        className="px-3 py-1"
                        data-testid={`badge-amenity-${index}`}
                      >
                        {typeof amenity === 'string' ? amenity : amenity.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Professional Services Section */}
            {experience.services && Array.isArray(experience.services) && experience.services.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Briefcase className="h-5 w-5 mr-2 text-primary" />
                    Professional Services
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {experience.services.map((service: any, index: number) => (
                      <Badge 
                        key={service.id || index} 
                        variant="secondary" 
                        className="px-3 py-1"
                        data-testid={`badge-service-${index}`}
                      >
                        {typeof service === 'string' ? service : service.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rooms / Accommodation Section */}
            {experience.rooms && Array.isArray(experience.rooms) && experience.rooms.length > 0 && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="h-5 w-5 mr-2 text-primary" />
                    Accommodation Options
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {experience.rooms.map((room: any, index: number) => {
                      // Look up the ticketSku that corresponds to this room
                      const matchingSku = ticketSkus.find((sku: any) => sku.sourceRoomId === room.id);
                      const roomPrice = matchingSku?.pricePerPerson || room.pricePerPerson || effectivePrice || experience.price;
                      const roomDeposit = matchingSku?.depositPerPerson || room.depositPerPerson || 0;
                      const roomSoldCount = matchingSku?.soldCount || room.soldCount || 0;
                      const roomAvailable = ((room.quantity || 1) * (room.capacity || 1)) - roomSoldCount;
                      const isSoldOut = roomAvailable <= 0;
                      const skuId = matchingSku?.id || room.id;
                      const isSelected = selectedTicketId === skuId;
                      
                      return (
                        <button
                          type="button"
                          key={room.id || index}
                          onClick={() => !isSoldOut && setSelectedTicketId(skuId)}
                          disabled={isSoldOut}
                          className={`w-full text-left border rounded-lg p-4 transition-all duration-200 ${
                            isSelected
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                              : isSoldOut
                              ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed'
                              : 'border-gray-200 hover:border-primary/50 cursor-pointer'
                          }`}
                          data-testid={`room-card-${index}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                isSelected 
                                  ? 'border-primary bg-primary' 
                                  : 'border-gray-300'
                              }`}>
                                {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                              </div>
                              <h4 className="font-semibold text-gray-900" data-testid={`text-room-name-${index}`}>
                                {room.name || room.roomName || `Room ${index + 1}`}
                              </h4>
                            </div>
                            <Badge variant="outline" data-testid={`badge-room-capacity-${index}`}>
                              {room.capacity || 1} {(room.capacity || 1) === 1 ? 'person' : 'people'}
                            </Badge>
                          </div>
                          {room.notes && (
                            <p className="text-sm text-gray-600 mb-2 ml-6" data-testid={`text-room-notes-${index}`}>
                              {room.notes}
                            </p>
                          )}
                          <div className="flex justify-between items-center mt-3 pt-3 border-t ml-6">
                            <span className="text-sm text-gray-500">Price per person</span>
                            <span className="font-bold text-primary" data-testid={`text-room-price-${index}`}>
                              {formatCurrency(roomPrice, experience.currency)}
                            </span>
                          </div>
                          {roomDeposit > 0 && (
                            <div className="flex justify-between items-center mt-1 ml-6">
                              <span className="text-sm text-gray-500">Deposit</span>
                              <span className="text-sm font-medium text-gray-700" data-testid={`text-room-deposit-${index}`}>
                                {formatCurrency(roomDeposit, experience.currency)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-center mt-1 ml-6">
                            <span className="text-sm text-gray-500">Available</span>
                            <span className={`text-sm ${isSoldOut ? 'text-red-600 font-medium' : 'text-gray-700'}`} data-testid={`text-room-available-${index}`}>
                              {isSoldOut ? 'Sold out' : `${roomAvailable} spots available`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reviews */}
            {experience.reviews && experience.reviews.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Reviews ({experience.reviews.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {experience.reviews.slice(0, 3).map((review: any) => (
                      <div key={review.id} className="border-b pb-4 last:border-b-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="flex text-yellow-400">
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i} 
                                className={`h-4 w-4 ${i < review.rating ? 'fill-current' : ''}`} 
                              />
                            ))}
                          </div>
                          <span className="text-sm text-gray-500">
                            {new Date(review.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-gray-700">{review.comment}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Booking Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardContent className="p-6">
                <div className="text-center mb-4">
                  <div className="flex items-center justify-center mb-2">
                    {hasPriceRange && <span className="text-sm text-gray-500 mr-1">From</span>}
                    <span className="text-3xl font-bold text-gray-900" data-testid="text-price-per-person">
                      {formatCurrency(effectivePrice, experience.currency)}
                    </span>
                    <span className="text-gray-500 ml-1">/person</span>
                  </div>
                  
                  {/* Primary CTA - Only show when NO ticket options (single price experience) */}
                  {isAuthenticated && spotsLeft > 0 && !userActiveReservation && ticketSkus.length === 0 && (
                    <Link href={`/checkout/${experience.id}`}>
                      <Button 
                        className="mb-3 w-full border border-primary bg-primary py-5 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-primary/90 hover:text-white hover:shadow-xl"
                        size="lg" 
                        data-testid="button-book-single-price"
                      >
                        <Ticket className="h-5 w-5 mr-2 text-white" />
                        {depositAmount > 0 
                          ? `Book Now – ${formatCurrency(depositAmount, experience.currency)} Deposit`
                          : 'Book Now'
                        }
                      </Button>
                    </Link>
                  )}

                  {/* Active reservation — show Complete Booking CTA in the top area so there's no blank gap */}
                  {isAuthenticated && userActiveReservation && (
                    <Button
                      onClick={handleConvertReservation}
                      disabled={convertReservationMutation.isPending}
                      className="mb-3 w-full border border-primary bg-primary py-5 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-primary/90 hover:text-white hover:shadow-xl"
                      size="lg"
                      data-testid="button-complete-booking-top"
                    >
                      <Ticket className="h-5 w-5 mr-2 text-white" />
                      {convertReservationMutation.isPending ? "Processing..." : "Complete Your Booking"}
                    </Button>
                  )}
                  
                  {/* Show ticket selection prompt when there are ticket options */}
                  {spotsLeft > 0 && ticketSkus.length > 0 && (
                    <Button
                      className="mb-3 w-full border border-primary bg-primary py-5 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-primary/90 hover:text-white hover:shadow-xl"
                      size="lg"
                      onClick={() => {
                        const ticketSection = document.getElementById('ticket-options-section') || document.querySelector('[data-testid="ticket-options-section"]');
                        ticketSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      data-testid="button-choose-ticket"
                    >
                      <Ticket className="h-5 w-5 mr-2 text-white" />
                      Choose Your Ticket
                    </Button>
                  )}
                  
                  {!isAuthenticated && (
                    <a href="/api/login">
                      <Button className="mb-3 w-full border border-primary bg-primary py-5 text-base font-semibold text-white shadow-md hover:bg-primary/90 hover:text-white" size="lg" data-testid="button-login-first">
                        Sign In to Book
                      </Button>
                    </a>
                  )}
                  
                  {spotsLeft <= 0 && (
                    <Button className="w-full mb-3 py-5" size="lg" disabled data-testid="button-sold-out-first">
                      Fully Booked
                    </Button>
                  )}

                  {/* Invite the Squad — always visible */}
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full border-2 border-primary bg-white py-5 font-semibold text-primary shadow-sm hover:bg-primary hover:text-white dark:border-primary/70 dark:bg-gray-950 dark:text-primary-foreground dark:hover:bg-primary dark:hover:text-white"
                    onClick={() => setShowShareModal(true)}
                    data-testid="button-boost-trip-detail"
                    aria-label="Invite the Squad"
                  >
                    <Rocket className="h-5 w-5 mr-2" />
                    Invite the Squad
                  </Button>
                </div>

                <div className="mb-4">
                  {/* Ticket Types Section - always show when there are ticket options */}
                  {ticketSkus.length > 0 && (
                    <div className="mt-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-xl border text-left" data-testid="ticket-options-section">
                      <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center">
                        <Ticket className="h-4 w-4 mr-2 text-primary" />
                        Choose Your Ticket
                      </h4>
                      <div className="space-y-3">
                        {ticketSkus.map((ticket: any, index: number) => {
                          const spotsAvailable = ticket.ticketCapacity - (ticket.soldCount || 0);
                          const ticketDeposit = ticket.depositPerPerson || experience.depositAmount || 0;
                          // Use sourceRoomId as unique ticket identifier (ticketSkus stored in JSON don't have separate id field)
                          const ticketId = ticket.id || ticket.sourceRoomId || `ticket-${index}`;
                          const isSelected = selectedTicketId === ticketId;
                          const isSoldOut = spotsAvailable <= 0;
                          return (
                            <div 
                              key={ticketId}
                              className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
                                isSoldOut
                                  ? 'border-gray-200 bg-gray-100 opacity-60 dark:border-gray-700 dark:bg-gray-800'
                                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                              }`}
                              data-testid={`ticket-option-${index}`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <span className="font-semibold text-gray-900 dark:text-white">{ticket.ticketName}</span>
                                <span className="text-lg font-bold text-primary">{formatCurrency(ticket.pricePerPerson || 0, experience.currency)}</span>
                              </div>
                              <div className="text-xs text-gray-500 mb-3">per person</div>
                              <div className="flex items-center justify-between mb-3">
                                <Badge 
                                  variant={isSoldOut ? "destructive" : spotsAvailable <= 3 ? "destructive" : "secondary"} 
                                  className="text-xs"
                                  data-testid={`ticket-availability-${index}`}
                                >
                                  {isSoldOut ? 'Sold out' : `${spotsAvailable} ${spotsAvailable === 1 ? 'spot' : 'spots'} left`}
                                </Badge>
                                {ticketDeposit > 0 && !isSoldOut && (
                                  <div className="flex items-center text-xs text-green-600 font-medium">
                                    <Shield className="h-3 w-3 mr-1" />
                                    {formatCurrency(ticketDeposit, experience.currency)} deposit
                                  </div>
                                )}
                              </div>
                              {/* Explicit Book This Ticket CTA - Professional styling */}
                              <div className="mt-4">
                                {isSoldOut ? (
                                  <Button className="w-full h-12 bg-gray-200 text-gray-500 rounded-lg font-medium" size="lg" disabled data-testid={`button-soldout-ticket-${index}`}>
                                    Sold Out
                                  </Button>
                                ) : isAuthenticated ? (
                                  <Link href={`/checkout/${experience.id}?ticketSkuId=${ticketId}`}>
                                    <Button 
                                      className="w-full h-12 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg shadow-md hover:shadow-lg transition-all font-semibold text-base" 
                                      size="lg"
                                      data-testid={`button-book-ticket-${index}`}
                                    >
                                      Book Now
                                      {ticketDeposit > 0 && (
                                        <span className="ml-2 text-purple-200">
                                          · {formatCurrency(ticketDeposit, experience.currency)} deposit
                                        </span>
                                      )}
                                    </Button>
                                  </Link>
                                ) : (
                                  <a href="/api/login">
                                    <Button className="w-full h-12 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg shadow-md hover:shadow-lg transition-all font-semibold text-base" size="lg" data-testid={`button-login-ticket-${index}`}>
                                      Sign In to Book
                                    </Button>
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {experience.requireMinimumParticipants && (
                        <p className="text-xs text-gray-500 mt-3 text-center bg-blue-50 dark:bg-blue-950 p-2 rounded" data-testid="mvg-contribution-note">
                          All tickets contribute equally to reaching the group minimum
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Deposit Information - DATA CONTRACT: Use depositAmount or ticketSkus.depositPerPerson (fixed amount only) */}
                  {depositAmount > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Deposit:</span>
                          <span className="font-semibold text-gray-900" data-testid="text-deposit-amount">
                            {formatCurrency(depositAmount, experience.currency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Balance:</span>
                          <span className="font-semibold text-gray-900" data-testid="text-balance-amount">
                            {formatCurrency(effectivePrice - depositAmount, experience.currency)}
                          </span>
                        </div>
                        {experience.startDate && experience.balanceDueDays && (
                          <div className="flex items-center justify-between pt-1 border-t border-blue-200">
                            <span className="text-gray-600">Balance due:</span>
                            <span className="font-medium text-blue-700" data-testid="text-balance-due-date">
                              {new Date(new Date(experience.startDate).getTime() - (experience.balanceDueDays * 24 * 60 * 60 * 1000)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {experience.requireMinimumParticipants && (
                        <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700" data-testid="text-mvg-deposit-explanation">
                          <div className="flex items-start gap-2">
                            <Shield className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-green-700 dark:text-green-400">
                                Refundable deposit held until group minimum is reached
                              </p>
                              <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                                <li className="flex items-start gap-1.5" data-testid="text-mvg-refund-policy">
                                  <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span>Full refund if minimum group size is not met</span>
                                </li>
                                <li className="flex items-start gap-1.5" data-testid="text-mvg-lock-policy">
                                  <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span>Deposit locked and applied toward final balance once confirmed</span>
                                </li>
                                <li className="flex items-start gap-1.5" data-testid="text-stripe-protection">
                                  <Shield className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                  <span>Payments protected by Stripe</span>
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <p className="text-sm text-gray-600 mt-3">
                    {spotsLeft > 0 ? `${spotsLeft} spots remaining` : "Fully booked"}
                  </p>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Start Date:</span>
                    <span className="font-medium">{formatDate(experience.startDate?.toString() || '')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">End Date:</span>
                    <span className="font-medium">{formatDate(experience.endDate?.toString() || '')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Location:</span>
                    <span className="font-medium">{experience.location}</span>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* MVG Progress Widget — only for trips with minimum group requirement */}
                {experience.requireMinimumParticipants && (
                  <div className="mb-6">
                    <MVGProgressWidget 
                      experienceId={experience.id}
                      showTitle={true}
                      refreshInterval={30000}
                      className="mb-4"
                    />
                  </div>
                )}

                {/* Reservation Status Display */}
                {userActiveReservation && (
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <Timer className="h-4 w-4 text-blue-600 mr-2" />
                        <span className="font-medium text-blue-900 dark:text-blue-100">Spot Reserved</span>
                      </div>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100">
                        {timeRemaining}
                      </Badge>
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                      Your spot expires in {timeRemaining}. Complete your booking to secure it!
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleConvertReservation}
                        disabled={convertReservationMutation.isPending}
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        size="sm"
                        data-testid="button-convert-reservation"
                      >
                        {convertReservationMutation.isPending ? "Converting..." : "Complete Booking"}
                      </Button>
                      <Button 
                        onClick={handleCancelReservation}
                        disabled={cancelReservationMutation.isPending}
                        variant="outline"
                        size="sm"
                        data-testid="button-cancel-reservation"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {isAuthenticated ? (
                    <>
                      {spotsLeft > 0 ? (
                        <>
                          {!userActiveReservation && (
                            <>
                              {/* Only show CTA for single-price experiences (no ticket SKUs) */}
                              {ticketSkus.length === 0 && (
                                <Link href={`/checkout/${experience.id}`}>
                                  <Button 
                                    className="w-full btn-gradient shadow-lg hover:shadow-xl transition-all duration-200 text-lg py-6" 
                                    size="lg" 
                                    data-testid="button-book-now"
                                  >
                                    <Ticket className="h-5 w-5 mr-2" />
                                    {depositAmount > 0
                                      ? `Book Now – Pay ${formatCurrency(depositAmount, experience.currency)} Deposit`
                                      : `Book Now – ${formatCurrency(effectivePrice, experience.currency)}`
                                    }
                                  </Button>
                                </Link>
                              )}
                              
                              {/* Soft-Hold Reservation Button - only for single-price experiences */}
                              {ticketSkus.length === 0 && experience.softHoldEnabled && (
                                <div className="text-center">
                                  <span className="text-sm text-gray-500 block mb-2">or</span>
                                  <Button 
                                    onClick={handleCreateReservation}
                                    disabled={createReservationMutation.isPending}
                                    variant="outline" 
                                    className="w-full border-primary text-primary hover:bg-primary hover:text-white"
                                    size="lg"
                                    data-testid="button-reserve-spot"
                                  >
                                    <Timer className="h-4 w-4 mr-2" />
                                    {createReservationMutation.isPending ? "Reserving..." : `Reserve Spot (${experience.softHoldDurationHours || 48}h)`}
                                  </Button>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Hold your spot temporarily without payment
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <Button className="w-full" size="lg" disabled>
                            Fully Booked
                          </Button>
                          {availabilityData && availabilityData.activeReservations && availabilityData.activeReservations > 0 && (
                            <p className="text-xs text-gray-500 text-center">
                              {availabilityData.activeReservations} spot{availabilityData.activeReservations !== 1 ? 's' : ''} currently reserved
                            </p>
                          )}
                        </div>
                      )}
                      <Button variant="outline" className="w-full">
                        <Heart className="h-4 w-4 mr-2" />
                        Add to Wishlist
                      </Button>
                    </>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-3">Sign in to book this experience</p>
                      <a href="/api/login">
                        <Button className="w-full btn-gradient" size="lg">
                          Sign In to Book
                        </Button>
                      </a>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t">
                  <div className="flex items-center text-sm text-gray-600">
                    <i className="fas fa-shield-alt mr-2"></i>
                    <span>Secure payment with Stripe</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600 mt-2">
                    <i className="fas fa-undo mr-2"></i>
                    <span>Free cancellation up to 24h before</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Share Kit Modal */}
      <ShareKitModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        experience={{
          id: experience.id,
          title: experience.title,
          location: experience.location ?? undefined,
          coverImageUrl: experience.coverImageUrl ?? undefined,
          lifecycleStatus: experience.lifecycleStatus ?? undefined,
          participantsNeeded: Math.max(0, (experience.minimumParticipants ?? 0) - liveParticipantCount),
          currency: experience.currency ?? undefined,
        }}
      />
    </div>
  );
}
