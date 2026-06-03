import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, ChevronRight, Calendar, Users, TrendingUp, MapPin, CheckCircle, AlertCircle, Clock, Sparkles, Shield, Heart, DollarSign, Star, Lock, RefreshCw, CreditCard, MessageCircle, Check, Plane, Home as HomeIcon, Quote, Wifi, Coffee, Mountain, Zap, Rocket } from "lucide-react";
import { ShareKitModal } from "@/components/ShareKitModal";
import { useAuth } from "@/hooks/useAuth";
import { normalizeImageUrl } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FundingProgressBar } from "@/components/funding/FundingProgressBar";
import { CountdownTimer } from "@/components/funding/CountdownTimer";
import { ParticipantAvatars } from "@/components/funding/ParticipantAvatars";
import { RealParticipantAvatars } from "@/components/RealParticipantAvatars";
import { TripCardSkeletonGrid } from "@/components/skeletons/TripCardSkeleton";
import { ProgressiveImage } from "@/components/ProgressiveImage";
import { Skeleton } from "@/components/ui/skeleton";
import { useCoreWebVitals } from "@/hooks/useCoreWebVitals";
import { JoinTripModal } from "@/components/JoinTripModal";
import { useToast } from "@/hooks/use-toast";
import { useDepositMutation } from "@/hooks/useDepositMutation";
import { useRealtimeMVGUpdates } from "@/hooks/useRealtimeUpdates";

// Diverse community avatar images — served from Unsplash (no local files needed)
const avatar1 = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face";
const avatar2 = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face";
const avatar3 = "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face";
const avatar4 = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face";

// Emoji mapping for trip categories
const CATEGORY_EMOJIS: { [key: string]: string } = {
  'yoga': '🧘',
  'surf': '🏄',
  'art': '🎨',
  'cycling': '🚴',
  'hiking': '🥾',
  'wellness': '🌿',
  'adventure': '⛰️',
  'retreat': '🏔️',
  'workshop': '✨',
  'default': '🌍'
};

export default function Home() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedTrip, setSelectedTrip] = useState<any | null>(null);
  const [boostExperience, setBoostExperience] = useState<any | null>(null);
  const { toast } = useToast();
  const depositMutation = useDepositMutation();
  const { isConnected } = useRealtimeMVGUpdates('all');
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  useCoreWebVitals();

  // Force hero video to play — handles browsers that ignore the autoPlay attribute
  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;
    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay blocked — wait for first user interaction then play
        const resume = () => {
          video.play().catch(() => {});
          document.removeEventListener('click', resume);
          document.removeEventListener('touchstart', resume);
        };
        document.addEventListener('click', resume, { once: true });
        document.addEventListener('touchstart', resume, { once: true });
      });
    }
  }, []);

  // Scroll to trips section when navigated here from another page via "Explore Trips"
  useEffect(() => {
    if (sessionStorage.getItem("scrollToTrips") === "1") {
      sessionStorage.removeItem("scrollToTrips");
      const tryScroll = () => {
        const el =
          document.getElementById("catalyst-trip-section") ||
          document.getElementById("forming-trips-section") ||
          document.getElementById("confirmed-trips-section");
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
      };
      // Give the page a moment to render before scrolling
      setTimeout(tryScroll, 500);
    }
  }, []);

  // Fetch live funding trips from the API with participant previews
  // Fetch both approved and published experiences for homepage display
  const { data: liveTrips, isLoading: fundingLoading } = useQuery<any[]>({
    queryKey: ['/api/experiences?includeParticipants=true'],
    refetchInterval: 30000 // Refresh every 30s for live updates
  });

  // Fetch recently funded successes
  const { data: successData, isLoading: successLoading } = useQuery<{
    recentlyFunded: any[];
  }>({
    queryKey: ['/api/mvg/recently-funded']
  });

  // Fetch approved venues for homepage section (max 3 featured)
  const { data: featuredVenues = [] } = useQuery<any[]>({
    queryKey: ['/api/venues'],
  });

  // Helper to get pricing from ticket SKUs or legacy fields
  // Returns the lowest price/deposit from ticketSkus, falling back to legacy fields
  const getPricingFromTicketSkus = (ticketSkus: any[] | undefined, legacyPrice: any, legacyDeposit: any) => {
    // Safe parseFloat that returns null for invalid values
    const safeParse = (val: any): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const num = typeof val === 'number' ? val : parseFloat(val);
      return isNaN(num) || num <= 0 ? null : num;
    };
    
    // Get legacy values first for fallback
    const parsedLegacyPrice = safeParse(legacyPrice);
    const parsedLegacyDeposit = safeParse(legacyDeposit);
    
    // Check ticketSkus for valid pricing
    if (ticketSkus && ticketSkus.length > 0) {
      const validPrices = ticketSkus
        .map((s: any) => safeParse(s.pricePerPerson))
        .filter((p): p is number => p !== null);
      const validDeposits = ticketSkus
        .map((s: any) => safeParse(s.depositPerPerson))
        .filter((d): d is number => d !== null);
      
      // Use lowest valid SKU price, otherwise legacy price
      const lowestPrice = validPrices.length > 0 ? Math.min(...validPrices) : parsedLegacyPrice;
      // Use lowest valid SKU deposit, otherwise legacy deposit
      const lowestDeposit = validDeposits.length > 0 ? Math.min(...validDeposits) : parsedLegacyDeposit;
      
      return { price: lowestPrice, depositAmount: lowestDeposit };
    }
    
    // No ticketSkus - use legacy fields
    return { price: parsedLegacyPrice, depositAmount: parsedLegacyDeposit };
  };

  // Helper to format currency with proper symbol
  // DATA CONTRACT: Currency must come from experience.currency - never default to USD
  const formatCurrency = (amount: number | string | null | undefined, currency?: string): string => {
    if (amount === null || amount === undefined) return 'Price TBA';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!numAmount || numAmount <= 0 || isNaN(numAmount)) return 'Price TBA';
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

  // Map API data to card format - use ticketSkus as source of truth
  const activeFunding = (liveTrips && liveTrips.length > 0 
    ? liveTrips.map((trip: any) => {
        // Use ticketSkus for pricing - PERSON = SELLABLE UNIT
        const currentParticipants = trip.currentParticipants;
        const minimumParticipants = trip.minimumParticipants;
        const { price, depositAmount } = getPricingFromTicketSkus(
          trip.ticketSkus, 
          trip.price, 
          trip.depositAmount
        );
        
        return {
          id: trip.id,
          title: trip.title,
          location: trip.location,
          startDate: trip.startDate,
          endDate: trip.endDate,
          coverImageUrl: trip.coverImageUrl,
          price,
          depositAmount,
          currency: trip.currency,
          ticketSkus: trip.ticketSkus || [],
          currentParticipants,
          minimumParticipants,
          requireMinimumParticipants: trip.requireMinimumParticipants || false,
          lifecycleStatus: trip.lifecycleStatus || null,
          participantsNeeded: (minimumParticipants && currentParticipants !== null && currentParticipants !== undefined) 
            ? Math.max(0, minimumParticipants - currentParticipants) 
            : null,
          fundingPercentage: (minimumParticipants > 0 && currentParticipants !== null && currentParticipants !== undefined)
            ? Math.round((currentParticipants / minimumParticipants) * 100) 
            : null,
          fundingDeadline: trip.mvgDeadline || trip.startDate,
          category: trip.category,
          creatorName: trip.creator?.displayName || trip.creatorName || 'Creator',
          participants: trip.participantsPreview,
          activeChatters: trip.activeChatters,
          maxParticipants: trip.maxParticipants,
          spotsRemaining: (trip.maxParticipants && trip.currentParticipants !== null && trip.currentParticipants !== undefined)
            ? Math.max(0, trip.maxParticipants - (trip.currentParticipants || 0))
            : null
        };
      })
    : [] // No fallback data - show empty state if no trips
  );

  // Helper function to get emoji for trip
  const getTripEmoji = (experience: any) => {
    const title = experience.title?.toLowerCase() || '';
    for (const [category, emoji] of Object.entries(CATEGORY_EMOJIS)) {
      if (title.includes(category)) return emoji;
    }
    return CATEGORY_EMOJIS.default;
  };

  // Helper function to calculate days until deadline
  const getDaysUntilDeadline = (deadline: string) => {
    if (!deadline) return 0;
    const now = new Date();
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) return 0; // Invalid date guard
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  // Filter logic
  const filterExperiences = (experiences: any[]) => {
    if (!experiences) return [];
    
    switch (activeFilter) {
      case "ending-soon":
        return experiences.filter(exp => getDaysUntilDeadline(exp.fundingDeadline) <= 5);
      case "almost-funded":
        return experiences.filter(exp => exp.fundingPercentage >= 70);
      case "no-flights":
        // Mock: filter experiences that don't require flights (could check location)
        return experiences.filter(exp => exp.location?.includes('US') || exp.location?.includes('Canada'));
      case "self-paced":
        // Mock: could be based on experience type
        return experiences.filter(exp => exp.title?.toLowerCase().includes('self') || exp.title?.toLowerCase().includes('flexible'));
      default:
        return experiences;
    }
  };

  const filteredExperiences = filterExperiences(activeFunding);
  const recentlyFunded = successData?.recentlyFunded || [];

  // Grid groups — CANCELLED trips never show; price-less trips never show
  const visibleExperiences = filteredExperiences.filter((e: any) => {
    if (e.lifecycleStatus === 'cancelled') return false;
    // Only hide experiences with no full price at all — deposit is optional
    if (!e.price || e.price <= 0) return false;
    return true;
  });
  const formingGridExps = visibleExperiences
    .filter((e: any) => e.lifecycleStatus === 'forming')
    .sort((a: any, b: any) => (b.fundingPercentage || 0) - (a.fundingPercentage || 0));
  const confirmedGridExps = visibleExperiences.filter((e: any) => e.lifecycleStatus === 'confirmed');

  // Human gap psychology — people help people, not percentages
  const getUrgencyLabel = (spotsNeeded: number) => {
    if (spotsNeeded === 1) return "🔥 Just 1 more traveler to make this real!";
    if (spotsNeeded <= 3) return `🔥 Just ${spotsNeeded} more travelers to make this real!`;
    if (spotsNeeded <= 6) return `⚡ ${spotsNeeded} more travelers needed to confirm this trip!`;
    return `👥 ${spotsNeeded} more travelers needed to make this happen!`;
  };

  // Featured forming trip — closest to MVG threshold, must have pricing set
  const featuredFormingTrip = activeFunding
    .filter(exp => exp.lifecycleStatus === 'forming' && exp.requireMinimumParticipants
      && exp.depositAmount && exp.depositAmount > 0 && exp.price && exp.price > 0)
    .sort((a, b) => (b.fundingPercentage || 0) - (a.fundingPercentage || 0))[0] || null;

  // Handler for opening join modal
  const handleJoinClick = (experience: any, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Only allow joining if required data exists
    if (experience.price === null || experience.price === undefined || 
        !experience.minimumParticipants ||
        experience.currentParticipants === null || experience.currentParticipants === undefined) {
      toast({
        variant: "destructive",
        title: "Cannot Join Yet",
        description: "This experience is still being set up. Check back soon!",
      });
      return;
    }
    
    // Use ONLY real database values - no fabricated calculations
    const unlockPrice = experience.price;
    const mvgGoal = unlockPrice * experience.minimumParticipants;
    const amountFunded = unlockPrice * experience.currentParticipants;
    const mvgRemaining = Math.max(0, mvgGoal - amountFunded);
    const isEarlyFounder = experience.currentParticipants <= Math.floor(experience.minimumParticipants * 0.3);

    setSelectedTrip({
      id: experience.id,
      title: experience.title,
      location: experience.location,
      coverImageUrl: experience.coverImageUrl,
      unlockPrice,
      mvgGoal,
      amountFunded,
      mvgRemaining,
      fundingPercentage: experience.fundingPercentage || 0,
      currentParticipants: experience.currentParticipants,
      minimumParticipants: experience.minimumParticipants,
      isEarlyFounder,
      currency: experience.currency
    });
  };

  // Handler for deposit confirmation - integrated with backend
  const handleDepositConfirm = async () => {
    if (!selectedTrip) return;
    
    const tripId = selectedTrip.id;
    const tripTitle = selectedTrip.title;
    const depositAmount = selectedTrip.unlockPrice;
    
    try {
      // Call the deposit mutation
      const result = await depositMutation.mutateAsync({
        experienceId: tripId,
        amount: depositAmount,
        paymentMethodNonce: 'sandbox_test'
      }) as any;
      
      const mvgStatus = result.mvg_status;
      const mvgReached = mvgStatus.funded_percent >= 100 || mvgStatus.seats_taken >= selectedTrip.minimumParticipants;
      
      // Show success message
      if (mvgReached) {
        toast({
          title: "🎉 Trip Confirmed!",
          description: `${tripTitle} has reached its MVG target and is now confirmed! The host and all participants will be notified.`,
        });
      } else {
        const remaining = selectedTrip.minimumParticipants - mvgStatus.seats_taken;
        toast({
          title: "Deposit Confirmed! 🎉",
          description: `You've joined ${tripTitle}. ${remaining} more traveler(s) needed to confirm this adventure.`,
        });
      }
      
      setSelectedTrip(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Deposit Failed",
        description: error.message || "Unable to process deposit. Please try again.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to main content link for keyboard navigation */}
      <a 
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Skip to main content"
      >
        Skip to main content
      </a>
      <Navigation />

      {/* Hero Section with Overlapping Trips - Creates "above the fold" preview effect */}
      <section id="main-content" tabIndex={-1} className="relative overflow-visible bg-gradient-to-br from-primary via-primary/80 to-secondary min-h-[85vh] flex items-center justify-center px-4 pt-16 pb-64 sm:pt-20 sm:pb-72">
        {/* Hero background video — poster shows first frame instantly; branded gradient is the CSS fallback */}
        <video
          ref={heroVideoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/assets/hero-poster.jpg"
          onCanPlay={() => heroVideoRef.current?.play().catch(() => {})}
          className="absolute inset-0 w-full h-full object-cover z-0"
          aria-hidden="true"
        >
          <source src="/assets/hero-video.mp4" type="video/mp4" />
        </video>
        {/* Thin dark overlay — just enough contrast for white text, video clearly visible through it */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/50 z-[1]" aria-hidden="true" />

        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="text-center text-white px-4 sm:px-6 lg:px-8">
            <h1 className="font-bold mb-8 leading-[1.1] px-2" style={{ fontSize: 'clamp(2.5rem, 7vw, 5rem)' }}>
              Adventures backed by real travelers.
            </h1>
            <p className="text-white/95 mb-12 max-w-4xl mx-auto leading-relaxed px-2" style={{ fontSize: 'clamp(1.25rem, 2.8vw, 2rem)' }}>
              Only pay when the group confirms. Join a tribe, reserve your spot, and make the trip a reality.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center px-2">
              <Button 
                size="lg" 
                className="bg-white text-primary hover:bg-gray-100 text-base sm:text-lg font-semibold px-8 py-6 h-auto w-full sm:w-auto"
                onClick={() => {
                  const catalystEl = document.getElementById('catalyst-trip-section');
                  const formingEl = document.getElementById('forming-trips-section');
                  const confirmedEl = document.getElementById('confirmed-trips-section');
                  (catalystEl || formingEl || confirmedEl)?.scrollIntoView({ behavior: 'smooth' });
                }}
                data-testid="button-browse-trips"
                aria-label="Explore forming trips"
              >
                Explore Forming Trips
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Featured FORMING Trip — highest momentum, sits directly below hero */}
      {featuredFormingTrip && !fundingLoading && (
        <section
          id="catalyst-trip-section"
          className="relative z-20 -mt-56 sm:-mt-60 rounded-t-3xl shadow-2xl bg-white dark:bg-gray-900 pt-10 pb-6"
          data-testid="featured-forming-section"
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Section header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                🎯 The Catalyst Trip — Be the One to Make This Happen
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-base">
                This trip is the closest to confirming. One more person could be the difference.
              </p>
            </div>

            {/* Featured Card */}
            <div
              className="rounded-2xl overflow-hidden shadow-2xl border border-primary/10 dark:border-primary/20 bg-white dark:bg-gray-800 cursor-pointer group"
              onClick={() => setLocation(`/experience/${featuredFormingTrip.id}`)}
              data-testid="featured-forming-card"
            >
              {/* Cover Image with overlays */}
              <div className="relative w-full h-72 sm:h-80 overflow-hidden">
                {featuredFormingTrip.coverImageUrl ? (
                  <img
                    src={normalizeImageUrl(featuredFormingTrip.coverImageUrl)}
                    alt={featuredFormingTrip.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-secondary" />
                )}

                {/* "HELP US MAKE IT HAPPEN" gradient overlay */}
                <div
                  className="absolute inset-0 flex flex-col justify-end p-5 pointer-events-none"
                  style={{ background: 'linear-gradient(to top, rgba(88,28,135,0.90) 0%, rgba(126,34,206,0.55) 60%, transparent 100%)' }}
                >
                  <p className="text-white font-extrabold tracking-widest text-xs sm:text-sm uppercase mb-2 drop-shadow">
                    🔥 Help us make it happen
                  </p>
                  <div className="w-full bg-white/30 rounded-full h-2.5 mb-2">
                    <div
                      className="bg-violet-400 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, featuredFormingTrip.fundingPercentage || 0)}%` }}
                    />
                  </div>
                  {(featuredFormingTrip.participantsNeeded ?? 0) > 0 && (
                    <p className="text-white font-black text-base drop-shadow-lg leading-tight">
                      {getUrgencyLabel(featuredFormingTrip.participantsNeeded ?? 0)}
                    </p>
                  )}
                </div>

                {/* FORMING badge — pulsing */}
                <div className="absolute top-3 left-3 z-10">
                  <span className="inline-flex items-center gap-1 bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse">
                    ⚡ FORMING NOW
                  </span>
                </div>

                {/* Most Urgent label — top right */}
                <div className="absolute top-3 right-3 z-10" data-testid="most-urgent-label">
                  <span className="inline-flex items-center gap-1 bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1.5 rounded-full shadow-lg">
                    🎯 Most Urgent
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="p-5 sm:p-6">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2 leading-tight">
                  {featuredFormingTrip.title}
                </h3>

                <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {featuredFormingTrip.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-primary" />
                      {featuredFormingTrip.location}
                    </span>
                  )}
                  {featuredFormingTrip.startDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-primary" />
                      {new Date(featuredFormingTrip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {featuredFormingTrip.endDate && ` – ${new Date(featuredFormingTrip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </span>
                  )}
                </div>

                {/* Human Gap — must be the largest, boldest element */}
                {(featuredFormingTrip.participantsNeeded ?? 0) > 0 && (
                  <div className="mb-5" data-testid="featured-urgency-label">
                    <p className="text-2xl sm:text-3xl font-black text-primary leading-tight tracking-tight">
                      {getUrgencyLabel(featuredFormingTrip.participantsNeeded ?? 0)}
                    </p>
                  </div>
                )}

                {/* Avatar gallery */}
                {featuredFormingTrip.participants && featuredFormingTrip.participants.length > 0 ? (
                  <div className="mb-4">
                    <RealParticipantAvatars
                      participants={featuredFormingTrip.participants}
                      maxDisplay={6}
                      size="md"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-12 w-12 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                      <Users className="h-5 w-5 text-gray-400" />
                    </div>
                    <span className="text-sm text-gray-500 italic">Be the first to join</span>
                  </div>
                )}

                {/* Data row: progress bar + gap text + pricing + CTA */}
                <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2" data-testid="featured-progress-bar">
                      <div
                        className="bg-primary h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, featuredFormingTrip.fundingPercentage || 0)}%` }}
                      />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300" data-testid="featured-joined-count">
                      <span className="font-bold">{featuredFormingTrip.currentParticipants ?? 0} joined</span>
                      {(featuredFormingTrip.participantsNeeded ?? 0) > 0
                        ? <span className="text-primary dark:text-primary/80" data-testid="featured-spots-needed"> — {featuredFormingTrip.participantsNeeded} more needed to confirm</span>
                        : ' — group confirmed!'}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white" data-testid="featured-deposit-price">Reserve for {formatCurrency(featuredFormingTrip.depositAmount, featuredFormingTrip.currency)}</p>
                      <p className="text-sm text-gray-500 mt-0.5" data-testid="featured-full-price">Full price {formatCurrency(featuredFormingTrip.price, featuredFormingTrip.currency)} per person</p>
                    </div>
                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-bold px-8 py-3 h-auto w-full shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/experience/${featuredFormingTrip.id}`);
                        }}
                        data-testid="featured-reserve-cta"
                      >
                        Reserve Your Spot
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-primary/30 text-primary hover:bg-primary/5 dark:border-primary/50 dark:text-primary/90 dark:hover:bg-primary/10 font-semibold"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBoostExperience(featuredFormingTrip);
                        }}
                        data-testid="featured-invite-squad-btn"
                        aria-label="Invite the Squad"
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        Invite the Squad
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Live Community Trips */}
      {!fundingLoading && (
        <section
          id="live-trips-section"
          className={`relative pb-12 lg:pb-16 bg-white dark:bg-gray-900 z-10${featuredFormingTrip ? '' : ' -mt-56 sm:-mt-64 rounded-t-3xl shadow-2xl'}`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Empty State - Show when no trips exist */}
            {visibleExperiences.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Users className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  No Adventures Available Yet
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                  Be the first to discover new community-backed experiences. Check back soon or create your own!
                </p>
                <Button 
                  onClick={() => setLocation('/experiences/create')}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-create-first-experience"
                >
                  Create an Experience
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            ) : (
              <div className="space-y-12">
                {/* ── FORMING GROUP ──────────────────────────────────── */}
                {formingGridExps.length > 0 && (
                  <div id="forming-trips-section">
                    <div className="mb-6">
                      <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1">
                        ⚡ Forming Now — Join the Movement
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        These trips are gathering their tribes. Reserve your spot and help make it happen.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {formingGridExps.map((experience: any) => {
                        const spotsNeeded = experience.participantsNeeded ?? 0;
                        const urgencyLabel = spotsNeeded > 0 ? getUrgencyLabel(spotsNeeded) : null;
                        const daysLeft = getDaysUntilDeadline(experience.fundingDeadline);
                        const spotsTaken = experience.currentParticipants;
                        const spotsTotal = experience.minimumParticipants;
                        const price = experience.price;
                        const activeChatters = experience.activeChatters;
                        const hasParticipants = spotsTaken !== null && spotsTaken !== undefined && spotsTaken > 0;
                        const getDepositAmount = () => {
                          const ticketSkus = experience.ticketSkus || [];
                          if (ticketSkus.length > 0) {
                            const deposits = ticketSkus.map((s: any) => s.depositPerPerson || 0).filter((d: number) => d > 0);
                            if (deposits.length > 0) return Math.min(...deposits);
                          }
                          const expDeposit = parseFloat(experience.depositAmount);
                          if (!isNaN(expDeposit) && expDeposit > 0) return expDeposit;
                          return 0;
                        };
                        const depositAmount = getDepositAmount();
                        return (
                          <Card
                            key={experience.id}
                            className="overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800 border border-primary/15 dark:border-primary/20 cursor-pointer group"
                            onClick={() => setLocation(`/experiences/${experience.id}`)}
                            data-testid={`trip-card-${experience.id}`}
                          >
                            {/* Image */}
                            <div className="relative w-full overflow-hidden" style={{ paddingBottom: '75%' }}>
                              <ProgressiveImage
                                src={normalizeImageUrl(experience.coverImageUrl) || "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop"}
                                alt={experience.title}
                                className="absolute inset-0 group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none" />
                              {/* FORMING overlay */}
                              {experience.requireMinimumParticipants && (
                                <div
                                  className="absolute inset-x-0 bottom-0 flex flex-col justify-end pb-3 px-3 pt-12 pointer-events-none"
                                  style={{ background: 'linear-gradient(to top, rgba(88,28,135,0.90) 0%, rgba(126,34,206,0.55) 60%, transparent 100%)' }}
                                  data-testid="forming-overlay"
                                >
                                  <div className="h-1.5 rounded-full bg-white/30 overflow-hidden mb-2">
                                    <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.min(experience.fundingPercentage || 0, 100)}%` }} />
                                  </div>
                                  {spotsNeeded > 0 && (
                                    <p className="text-sm font-black text-white leading-snug drop-shadow">
                                      {getUrgencyLabel(spotsNeeded)}
                                    </p>
                                  )}
                                </div>
                              )}
                              {/* Badge — pulsing FORMING NOW */}
                              <div className="absolute top-3 left-3 z-10" data-testid="lifecycle-status-badge">
                                <span className="inline-flex items-center gap-1 bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse">
                                  ⚡ FORMING NOW
                                </span>
                              </div>
                              {activeChatters > 0 && (
                                <div className="absolute top-3 right-3 bg-green-500 text-white px-3 py-1.5 rounded-full text-sm font-semibold shadow-lg flex items-center gap-1.5 z-10">
                                  <MessageCircle className="h-4 w-4" />+{activeChatters} chatting now
                                </div>
                              )}
                            </div>
                            <CardContent className="p-6">
                              {/* Human Gap — largest, boldest, first thing read */}
                              {urgencyLabel && (
                                <div className="mb-3" data-testid="urgency-label">
                                  <p className="text-lg font-black text-primary leading-tight tracking-tight">{urgencyLabel}</p>
                                </div>
                              )}
                              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-2 line-clamp-2">{experience.title}</h3>
                              <div className="space-y-2 mb-4">
                                <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                                  <MapPin className="h-4 w-4 flex-shrink-0" /><span className="line-clamp-1">{experience.location}</span>
                                </div>
                                {experience.startDate && (
                                  <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                                    <Calendar className="h-4 w-4 flex-shrink-0" />
                                    <span>{new Date(experience.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{experience.endDate && ` - ${new Date(experience.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</span>
                                  </div>
                                )}
                              </div>
                              <div className="mb-4">
                                {hasParticipants && experience.participants?.length > 0 ? (
                                  <RealParticipantAvatars participants={experience.participants} maxDisplay={3} size="xl" showBorder showChattingLabel />
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="h-[4.5rem] w-[4.5rem] rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                                      <Users className="h-6 w-6 text-gray-400" />
                                    </div>
                                    <span className="text-sm text-gray-500 italic">Be the first to join</span>
                                  </div>
                                )}
                              </div>
                              {/* Data row: progress + gap text + pricing */}
                              <div className="mb-4 space-y-2">
                                {experience.requireMinimumParticipants && spotsTaken !== null && spotsTaken !== undefined && spotsTotal && (
                                  <div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2" data-testid="progress-bar">
                                      <div
                                        className="bg-primary h-2.5 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, experience.fundingPercentage || 0)}%` }}
                                      />
                                    </div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                      <span className="font-bold">{spotsTaken} joined</span>
                                      {spotsNeeded > 0 ? ` — ${spotsNeeded} more needed to confirm` : ' — group confirmed!'}
                                    </p>
                                  </div>
                                )}
                                <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                                  <p className="text-xl font-bold text-gray-900 dark:text-white" data-testid="deposit-price">Reserve for {formatCurrency(depositAmount, experience.currency)}</p>
                                  <p className="text-sm text-gray-500 mt-0.5" data-testid="full-price">Full price {formatCurrency(price, experience.currency)} per person</p>
                                </div>
                              </div>
                              {daysLeft > 0 && (
                                <div className="flex items-center gap-2 mb-4 text-primary dark:text-primary/80">
                                  <Clock className="h-4 w-4" />
                                  <span className="text-sm font-medium"><span className="font-bold">{daysLeft} days</span> to join before deadline</span>
                                </div>
                              )}
                              <Button size="lg" className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-semibold shadow-md hover:shadow-lg transition-all" onClick={(e) => { e.stopPropagation(); setLocation(`/experiences/${experience.id}`); }} data-testid={`button-reserve-spot-${experience.id}`}>
                                Reserve Your Spot
                              </Button>
                              <Button size="sm" variant="outline" className="w-full mt-2 border-primary/30 text-primary hover:bg-primary/5 dark:border-primary/50 dark:text-primary/90 dark:hover:bg-primary/10 font-semibold" onClick={(e) => { e.stopPropagation(); setBoostExperience(experience); }} data-testid={`button-boost-${experience.id}`} aria-label="Invite the Squad">
                                <Rocket className="h-4 w-4 mr-2" />
                                Invite the Squad
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── CONFIRMED GROUP ────────────────────────────────── */}
                {confirmedGridExps.length > 0 && (
                  <div id="confirmed-trips-section">
                    <div className="mb-6">
                      <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1">
                        ✅ Confirmed & Closing — Final Spots Remaining
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        These trips are happening. Book now before the last spots are gone.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {confirmedGridExps.map((experience: any) => {
                        const daysLeft = getDaysUntilDeadline(experience.fundingDeadline);
                        const spotsTaken = experience.currentParticipants;
                        const spotsTotal = experience.minimumParticipants;
                        const price = experience.price;
                        const activeChatters = experience.activeChatters;
                        const hasParticipants = spotsTaken !== null && spotsTaken !== undefined && spotsTaken > 0;
                        const spotsRemaining = experience.spotsRemaining;
                        const getDepositAmount = () => {
                          const ticketSkus = experience.ticketSkus || [];
                          if (ticketSkus.length > 0) {
                            const deposits = ticketSkus.map((s: any) => s.depositPerPerson || 0).filter((d: number) => d > 0);
                            if (deposits.length > 0) return Math.min(...deposits);
                          }
                          const expDeposit = parseFloat(experience.depositAmount);
                          if (!isNaN(expDeposit) && expDeposit > 0) return expDeposit;
                          return 0;
                        };
                        const depositAmount = getDepositAmount();
                        return (
                          <Card
                            key={experience.id}
                            className="overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-900/50 cursor-pointer group"
                            onClick={() => setLocation(`/experiences/${experience.id}`)}
                            data-testid={`trip-card-${experience.id}`}
                          >
                            {/* Image */}
                            <div className="relative w-full overflow-hidden" style={{ paddingBottom: '75%' }}>
                              <ProgressiveImage
                                src={normalizeImageUrl(experience.coverImageUrl) || "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop"}
                                alt={experience.title}
                                className="absolute inset-0 group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none" />
                              {/* CONFIRMED overlay */}
                              {experience.requireMinimumParticipants && (
                                <div
                                  className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2.5 pointer-events-none"
                                  style={{ background: 'linear-gradient(to top, rgba(6,78,59,0.88), transparent)' }}
                                  data-testid="confirmed-overlay"
                                >
                                  <CheckCircle className="h-4 w-4 text-emerald-300 shrink-0" />
                                  <span className="text-sm font-bold text-white">Group confirmed — booking secured!</span>
                                </div>
                              )}
                              {/* Badge — solid IT'S HAPPENING */}
                              <div className="absolute top-3 left-3 z-10" data-testid="lifecycle-status-badge">
                                <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                                  ✅ IT'S HAPPENING
                                </span>
                              </div>
                              {activeChatters > 0 && (
                                <div className="absolute top-3 right-3 bg-green-500 text-white px-3 py-1.5 rounded-full text-sm font-semibold shadow-lg flex items-center gap-1.5 z-10">
                                  <MessageCircle className="h-4 w-4" />+{activeChatters} chatting now
                                </div>
                              )}
                            </div>
                            <CardContent className="p-6">
                              {/* Spots remaining — key social proof */}
                              {spotsRemaining !== null && spotsRemaining !== undefined && (
                                <div className="mb-3 flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2" data-testid="spots-remaining-label">
                                  <span className="text-sm font-bold text-green-700 dark:text-green-400">
                                    {spotsRemaining === 0 ? '⚠️ Fully booked' : `Only ${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} remaining`}
                                  </span>
                                </div>
                              )}
                              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 min-h-[3.5rem]">{experience.title}</h3>
                              <div className="space-y-2 mb-4">
                                <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                                  <MapPin className="h-4 w-4 flex-shrink-0" /><span className="line-clamp-1">{experience.location}</span>
                                </div>
                                {experience.startDate && (
                                  <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                                    <Calendar className="h-4 w-4 flex-shrink-0" />
                                    <span>{new Date(experience.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{experience.endDate && ` - ${new Date(experience.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</span>
                                  </div>
                                )}
                              </div>
                              <div className="mb-4">
                                {hasParticipants && experience.participants?.length > 0 ? (
                                  <RealParticipantAvatars participants={experience.participants} maxDisplay={3} size="xl" showBorder showChattingLabel />
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="h-[4.5rem] w-[4.5rem] rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                                      <Users className="h-6 w-6 text-gray-400" />
                                    </div>
                                    <span className="text-sm text-gray-500 italic">Be the first to join</span>
                                  </div>
                                )}
                              </div>
                              {/* Data row: progress + gap text + pricing */}
                              <div className="mb-4 space-y-2">
                                {experience.requireMinimumParticipants && spotsTaken !== null && spotsTaken !== undefined && spotsTotal && (
                                  <div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2" data-testid="progress-bar">
                                      <div
                                        className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                                        style={{ width: `${Math.min(100, experience.fundingPercentage || 0)}%` }}
                                      />
                                    </div>
                                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1" data-testid="mvg-confirmed-label">
                                      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                                      Group confirmed — your spot is secured
                                    </p>
                                  </div>
                                )}
                                <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                                  <p className="text-xl font-bold text-gray-900 dark:text-white" data-testid="deposit-price">Reserve for {formatCurrency(depositAmount, experience.currency)}</p>
                                  <p className="text-sm text-gray-500 mt-0.5" data-testid="full-price">Full price {formatCurrency(price, experience.currency)} per person</p>
                                </div>
                              </div>
                              {daysLeft > 0 && (
                                <div className="flex items-center gap-2 mb-4 text-primary dark:text-primary/80">
                                  <Clock className="h-4 w-4" />
                                  <span className="text-sm font-medium"><span className="font-bold">{daysLeft} days</span> to join before deadline</span>
                                </div>
                              )}
                              <Button size="lg" className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-semibold shadow-md hover:shadow-lg transition-all" onClick={(e) => { e.stopPropagation(); setLocation(`/experiences/${experience.id}`); }} data-testid={`button-reserve-spot-${experience.id}`}>
                                Secure Your Spot
                              </Button>
                              <Button size="sm" variant="outline" className="w-full mt-2 border-primary/30 text-primary hover:bg-primary/5 dark:border-primary/50 dark:text-primary/90 dark:hover:bg-primary/10 font-semibold" onClick={(e) => { e.stopPropagation(); setBoostExperience(experience); }} data-testid={`button-boost-${experience.id}`} aria-label="Invite the Squad">
                                <Rocket className="h-4 w-4 mr-2" />
                                Invite the Squad
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Community Success Stories */}
      <section className="py-16 lg:py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Real Communities, Unforgettable Adventures
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              See how travelers connected before their trips and created lifelong friendships
            </p>
          </div>

          {/* Story Cards - Horizontal scroll on mobile, grid on desktop */}
          <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide lg:grid lg:grid-cols-3 lg:overflow-x-visible lg:snap-none mb-12">
            {/* Bali Yoga Tribe */}
            <div className="flex-shrink-0 w-[85vw] sm:w-[70vw] lg:w-full snap-center">
              <Card className="h-full bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-purple-200 dark:border-purple-800 hover:shadow-xl transition-shadow">
                <CardContent className="p-8">
                  <Quote className="h-10 w-10 text-purple-500 mb-4" />
                  <blockquote className="text-lg text-gray-800 dark:text-gray-200 mb-6 italic">
                    "We started chatting 3 weeks before the retreat. By the time we arrived in Bali, we felt like old friends. The group energy was incredible!"
                  </blockquote>
                  <div className="border-t border-purple-200 dark:border-purple-800 pt-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex -space-x-2">
                        <img src={avatar1} alt="Member" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800" />
                        <img src={avatar2} alt="Member" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800" />
                        <img src={avatar3} alt="Member" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                      Bali Yoga Tribe
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Welcomed yogis from around the world • Still planning annual reunions
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Portugal Digital Nomads */}
            <div className="flex-shrink-0 w-[85vw] sm:w-[70vw] lg:w-full snap-center">
              <Card className="h-full bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-2 border-blue-200 dark:border-blue-800 hover:shadow-xl transition-shadow">
                <CardContent className="p-8">
                  <Quote className="h-10 w-10 text-blue-500 mb-4" />
                  <blockquote className="text-lg text-gray-800 dark:text-gray-200 mb-6 italic">
                    "Finding my remote work tribe changed everything. We co-worked by day, explored by night, and now we're planning our next destination together."
                  </blockquote>
                  <div className="border-t border-blue-200 dark:border-blue-800 pt-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex -space-x-2">
                        <img src={avatar4} alt="Member" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800" />
                        <img src={avatar1} alt="Member" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800" />
                        <img src={avatar2} alt="Member" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                      Portugal Digital Nomads
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Remote workers connected • Now a global community
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Iceland Adventure Squad */}
            <div className="flex-shrink-0 w-[85vw] sm:w-[70vw] lg:w-full snap-center">
              <Card className="h-full bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 border-2 border-green-200 dark:border-green-800 hover:shadow-xl transition-shadow">
                <CardContent className="p-8">
                  <Quote className="h-10 w-10 text-green-500 mb-4" />
                  <blockquote className="text-lg text-gray-800 dark:text-gray-200 mb-6 italic">
                    "The pre-trip chat helped us coordinate gear and plan activities. We conquered glaciers as a team and left as family!"
                  </blockquote>
                  <div className="border-t border-green-200 dark:border-green-800 pt-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex -space-x-2">
                        <img src={avatar3} alt="Member" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800" />
                        <img src={avatar4} alt="Member" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800" />
                        <img src={avatar1} alt="Member" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                      Iceland Adventure Squad
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Adventurers united • Lifelong bonds formed
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Button 
              size="lg"
              className="bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-semibold px-8"
              onClick={() => setLocation('/community')}
              data-testid="button-join-community-stories"
            >
              Join Our Community Success Stories
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* How It Works - 3-Step Social Contract */}
      <section id="how-it-works" className="py-16 lg:py-24 bg-gray-50 dark:bg-gray-900" data-testid="how-it-works-section">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              Three steps. One commitment. Zero risk if the group doesn't form.
            </p>
          </div>

          {/* Steps grid — horizontal on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-8 mb-12 relative">

            {/* Step 1 */}
            <div className="flex flex-col items-center text-center relative" data-testid="how-it-works-step-1">
              <div className="text-6xl mb-5" role="img" aria-label="Vote deposit icon">🗳️</div>
              <div className="inline-flex items-center justify-center w-7 h-7 bg-primary text-white rounded-full text-sm font-bold mb-4">1</div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                Reserve with a Vote
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-base leading-relaxed max-w-xs mx-auto">
                Pay a small refundable deposit. This is your commitment to the group — your vote that this trip should happen.
              </p>
              {/* Arrow connector — desktop only */}
              <div className="hidden md:flex absolute top-8 -right-4 z-10 items-center">
                <ChevronRight className="h-7 w-7 text-gray-300 dark:text-gray-600" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center relative" data-testid="how-it-works-step-2">
              <div className="text-6xl mb-5" role="img" aria-label="Tribe sharing icon">👥</div>
              <div className="inline-flex items-center justify-center w-7 h-7 bg-primary text-white rounded-full text-sm font-bold mb-4">2</div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                Invite the Tribe
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-base leading-relaxed max-w-xs mx-auto">
                Use the Invite the Squad kit to bring friends. The trip only confirms when the group forms — so every share counts.
              </p>
              {/* Arrow connector — desktop only */}
              <div className="hidden md:flex absolute top-8 -right-4 z-10 items-center">
                <ChevronRight className="h-7 w-7 text-gray-300 dark:text-gray-600" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center" data-testid="how-it-works-step-3">
              <div className="text-6xl mb-5" role="img" aria-label="Adventure unlock icon">🌍</div>
              <div className="inline-flex items-center justify-center w-7 h-7 bg-emerald-500 text-white rounded-full text-sm font-bold mb-4">3</div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                Unlock the Adventure
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-base leading-relaxed max-w-xs mx-auto">
                Once the minimum group is met the trip confirms automatically. Your deposit converts and the magic happens.
              </p>
            </div>
          </div>

          {/* Safety reassurance */}
          <div className="text-center mb-10" data-testid="how-it-works-reassurance">
            <p className="text-gray-400 dark:text-gray-500 text-sm md:text-base italic">
              No group? No charge. Every deposit is fully refundable if the trip doesn't confirm.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-white font-semibold px-10 py-6 h-auto text-base"
              onClick={() => {
                const catalystEl = document.getElementById('catalyst-trip-section');
                const formingEl = document.getElementById('forming-trips-section');
                const confirmedEl = document.getElementById('confirmed-trips-section');
                (catalystEl || formingEl || confirmedEl)?.scrollIntoView({ behavior: 'smooth' });
              }}
              data-testid="button-how-it-works-find-trip"
            >
              Find Your Trip
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Trust & Social Proof Section */}
      <section className="py-20 bg-gradient-to-br from-primary/10 to-secondary/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Testimonials */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Trusted by Creators & Travelers
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Join thousands who have created and experienced life-changing journeys
            </p>
          </div>

          {/* Testimonials Grid */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {/* Testimonial 1 */}
            <Card className="bg-white dark:bg-gray-800 border-none shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-1 mb-3" role="img" aria-label="5 star rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-4 w-4 fill-warning text-warning" aria-hidden="true" />
                  ))}
                </div>
                <CardDescription className="text-gray-700 dark:text-gray-300 text-base">
                  "Great. made it so easy to fund my yoga retreat. The community-backed model meant I could confirm the trip once we hit our minimum, and everyone felt invested in making it amazing."
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-white font-semibold">
                    SK
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Sarah Kim</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Yoga Retreat Creator</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 2 */}
            <Card className="bg-white dark:bg-gray-800 border-none shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-1 mb-3" role="img" aria-label="5 star rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-4 w-4 fill-warning text-warning" aria-hidden="true" />
                  ))}
                </div>
                <CardDescription className="text-gray-700 dark:text-gray-300 text-base">
                  "I found the perfect adventure trip through Great. The transparent funding progress gave me confidence, and I loved being part of making the trip happen. Best experience ever!"
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-info flex items-center justify-center text-white font-semibold">
                    MR
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Marcus Rodriguez</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Adventure Traveler</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 3 */}
            <Card className="bg-white dark:bg-gray-800 border-none shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-1 mb-3" role="img" aria-label="5 star rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-4 w-4 fill-warning text-warning" aria-hidden="true" />
                  ))}
                </div>
                <CardDescription className="text-gray-700 dark:text-gray-300 text-base">
                  "As a venue owner, Great. connects me with quality creators and fills my calendar with meaningful retreats. The platform makes bookings and payments seamless."
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-success to-success flex items-center justify-center text-white font-semibold">
                    JL
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Jessica Lopez</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Venue Owner, Bali</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trust Badges */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
            <h3 className="text-center text-xl font-bold text-gray-900 dark:text-white mb-8">
              Safe & Secure Booking
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {/* Secure Payment */}
              <div className="text-center" data-testid="trust-badge-payment">
                <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Lock className="h-8 w-8 text-success" aria-hidden="true" />
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Secure Payment</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">256-bit SSL encryption</p>
              </div>

              {/* Stripe Verified */}
              <div className="text-center" data-testid="trust-badge-stripe">
                <div className="w-16 h-16 bg-info/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CreditCard className="h-8 w-8 text-info" aria-hidden="true" />
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Stripe Verified</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">Trusted payment processor</p>
              </div>

              {/* Refund Policy */}
              <div className="text-center" data-testid="trust-badge-refund">
                <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <RefreshCw className="h-8 w-8 text-secondary" aria-hidden="true" />
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Flexible Refunds</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">Trip cancellation protection</p>
              </div>

              {/* Verified Hosts */}
              <div className="text-center" data-testid="trust-badge-verified">
                <div className="w-16 h-16 bg-primary/10 dark:bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Shield className="h-8 w-8 text-primary dark:text-primary/80" aria-hidden="true" />
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Verified Hosts</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">Background-checked creators</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Win/Win/Win for Everyone - 3-Column Benefits */}
      <section className="py-16 lg:py-20 bg-gradient-to-br from-primary/5 via-white to-secondary/5 dark:from-primary/10 dark:via-gray-900 dark:to-secondary/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Win/Win/Win for Everyone
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              A platform designed to benefit travelers, creators, and venues alike
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* For Travelers */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-shadow border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Plane className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  For Travelers
                </h3>
              </div>
              
              <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed mb-8">
                Meet your travel tribe before you go and book risk-free — only pay when the trip confirms.
              </p>

              <Button 
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
                onClick={() => setLocation('/experiences')}
                data-testid="button-browse-trips-win"
              >
                Browse Trips
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>

            {/* For Creators */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-shadow border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  For Creators
                </h3>
              </div>
              
              <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed mb-8">
                Launch retreats with zero financial risk — no deposits, no losses, only confirmed groups.
              </p>

              <Button 
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
                onClick={() => setLocation('/creator')}
                data-testid="button-start-creating-win"
              >
                Start Creating
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>

            {/* For Venues */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-shadow border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <HomeIcon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  For Venues
                </h3>
              </div>
              
              <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed mb-8">
                Get guaranteed, fully committed groups that fill your calendar year-round.
              </p>

              <Button 
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
                onClick={() => setLocation('/venue')}
                data-testid="button-list-venue-win"
              >
                List Your Venue
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted by Community Builders */}
      <section className="py-16 lg:py-20 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Trusted by Community Builders
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              See what travelers, creators, and venues are saying about their experiences
            </p>
          </div>

          {/* Testimonials Grid */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {/* Maria's Testimonial */}
            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700">
              <CardContent className="p-6">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <blockquote className="text-gray-700 dark:text-gray-300 mb-6 italic">
                  "The MVG system gave me confidence to book. I knew I wouldn't be charged unless enough people joined. We ended up with an amazing group!"
                </blockquote>
                <div className="flex items-center gap-3">
                  <img 
                    src={avatar1} 
                    alt="Maria" 
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Maria</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Yoga Retreat Participant</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Alex's Testimonial */}
            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700">
              <CardContent className="p-6">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <blockquote className="text-gray-700 dark:text-gray-300 mb-6 italic">
                  "As a creator, I can finally share my passion without financial risk. The platform handles everything while I focus on the experience."
                </blockquote>
                <div className="flex items-center gap-3">
                  <img 
                    src={avatar4} 
                    alt="Alex" 
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Alex</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Surf Retreat Creator</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bali Retreat Center's Testimonial */}
            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700">
              <CardContent className="p-6">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <blockquote className="text-gray-700 dark:text-gray-300 mb-6 italic">
                  "The soft-hold system protects our calendar while creators build their groups. It's a win-win for everyone involved."
                </blockquote>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-lg">
                    B
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">Bali Retreat Center</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Venue Partner</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Community Trust Features */}
          <div className="bg-gradient-to-br from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10 rounded-2xl p-8 lg:p-12 border border-primary/10">
            <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
              Community Trust Features
            </h3>
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                    Payments held until community confirms
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Your money is safely held until the minimum group size is met
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                    Full refund if community doesn't form
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Automatic refund if the experience doesn't reach its goal
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                    Verified creators
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    All experience creators are vetted and verified by our team
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                    24/7 community support
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Our support team is always available to help you and your group
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Loading State for Active Funding */}
      {fundingLoading && (
        <section className="py-16 lg:py-20 bg-gray-50 dark:bg-gray-900" aria-busy="true" aria-label="Loading experiences">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <Skeleton className="h-10 w-64 mx-auto mb-4" />
              <Skeleton className="h-6 w-96 mx-auto" />
            </div>
            <TripCardSkeletonGrid count={6} />
          </div>
        </section>
      )}


      {/* Recently Funded Successes - Storytelling Band */}
      {!successLoading && recentlyFunded.length > 0 && (
        <section className="py-16 lg:py-20 bg-white dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-success hover:bg-success text-white">
                <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                Success Stories
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Recently Funded Experiences
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                These trips reached their funding goals and are now confirmed. Join the next wave of adventures!
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {recentlyFunded.map((experience: any) => (
                <Card 
                  key={experience.id} 
                  className="overflow-hidden border-2 border-success/20 hover:shadow-xl transition-all cursor-pointer"
                  onClick={() => setLocation(`/experiences/${experience.id}`)}
                  data-testid={`success-card-${experience.id}`}
                >
                  {/* Card Image */}
                  <div className="relative h-56 overflow-hidden">
                    <img 
                      src={experience.coverImageUrl || "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=400&fit=crop"} 
                      alt={`${experience.title} - successfully funded`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      width={800}
                      height={400}
                    />
                    <div className="absolute top-4 left-4">
                      <Badge className="bg-success text-white">
                        <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                        Fully Funded
                      </Badge>
                    </div>
                  </div>

                  {/* Card Content */}
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">
                      {experience.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                      {experience.description || "An amazing experience that brought the community together."}
                    </p>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <MapPin className="h-4 w-4" aria-hidden="true" />
                        <span>{experience.location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        <span>{experience.currentParticipants} travelers joined</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        {experience.daysToFund && (
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Funded in {experience.daysToFund} days
                          </span>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-success hover:text-success/80 p-0 h-auto ml-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/experiences/${experience.id}`);
                          }}
                          aria-label={`View details for ${experience.title}`}
                        >
                          View Details
                          <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Trips Carousel */}
      <section className="py-16 lg:py-20 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Featured Experiences
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Handpicked adventures from verified creators around the world
            </p>
          </div>

          <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            {activeFunding.slice(0, 6).map((trip: any) => (
              <Card 
                key={trip.id} 
                className="flex-shrink-0 w-[85vw] sm:w-[45vw] lg:w-[30vw] overflow-hidden hover:shadow-xl transition-all cursor-pointer snap-center"
                onClick={() => setLocation(`/experiences/${trip.id}`)}
              >
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={trip.coverImageUrl || "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop"} 
                    alt={trip.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <CardContent className="p-5">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">
                    {trip.title}
                  </h3>
                  <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 mb-3">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm">{trip.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-primary">
                      {trip.price != null ? `$${trip.price.toLocaleString()}` : 'Price TBD'}
                    </span>
                    <Button size="sm" variant="outline">
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Community Venues - Live from DB */}
      {featuredVenues.length > 0 && (
        <section className="py-12 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                Community Venues
              </h2>
              <p className="text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Approved spaces designed for connection
              </p>
            </div>

            {/* Venue Cards — show up to 3 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {featuredVenues.slice(0, 3).map((venue: any) => (
                <Card
                  key={venue.id}
                  className="bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow overflow-hidden group cursor-pointer"
                  onClick={() => setLocation(`/v/${venue.slug || venue.id}`)}
                >
                  <div className="relative h-32 overflow-hidden">
                    {venue.coverImageUrl ? (
                      <img
                        src={venue.coverImageUrl}
                        alt={venue.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                        <HomeIcon className="h-10 w-10 text-gray-400" />
                      </div>
                    )}
                    {venue.categories?.[0] && (
                      <Badge className="absolute top-2 right-2 bg-primary text-white border-0 text-xs">
                        {venue.categories[0].replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2 line-clamp-1">
                      {venue.name}
                    </h3>
                    <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">{venue.city || venue.location}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-sm"
                      onClick={(e) => { e.stopPropagation(); setLocation(`/v/${venue.slug || venue.id}`); }}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* CTA */}
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => setLocation('/venues')}
                data-testid="button-explore-all-venues"
              >
                Explore All Venues
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Community Hub Section - Prominent Chat CTA */}
      <section className="py-16 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900 dark:to-indigo-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Left Content */}
            <div>
              <div className="inline-flex items-center gap-2 mb-4 bg-blue-200 dark:bg-blue-800 px-3 py-1 rounded-full">
                <MessageCircle className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">Community Hub</span>
              </div>
              
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
                Meet Your Travel Tribe
              </h2>
              
              <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                Adventures with friends you haven't met yet. Connect with fellow travelers, share experiences, and build friendships that last long after your journey ends.
              </p>

              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-3">
                  <Users className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Find Your People</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Connect with travelers who share your interests and travel style</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MessageCircle className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Chat Before You Go</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Get to know your group chat, plan activities, and build excitement</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Heart className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Make Lasting Connections</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Turn travel buddies into lifelong friends with shared memories</p>
                  </div>
                </div>
              </div>

              <Button 
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setLocation('/community-hub')}
                data-testid="button-community-hub-primary"
                aria-label="Go to community hub to connect with travelers"
              >
                <MessageCircle className="mr-2 h-5 w-5" aria-hidden="true" />
                Join Community Chat
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            {/* Right - Visual Card */}
            <div className="relative">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-blue-200 dark:border-blue-700">
                <div className="space-y-4">
                  {/* Chat Message 1 */}
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Sarah from NYC</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">So excited for this yoga retreat! Who's bringing the kombucha? 🧘</p>
                    </div>
                  </div>

                  {/* Chat Message 2 */}
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Marcus from LA</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">I'll bring it! Should we do a sunrise hike on day 2?</p>
                    </div>
                  </div>

                  {/* Chat Message 3 */}
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Jessica from Seattle</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Yes! I'm in. Can't wait to meet you all 🌄</p>
                    </div>
                  </div>

                  {/* Online Indicator */}
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">24 Members Online</p>
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 border-2 border-white dark:border-gray-800"></div>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 border-2 border-white dark:border-gray-800"></div>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 border-2 border-white dark:border-gray-800"></div>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border-2 border-white dark:border-gray-800"></div>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary border-2 border-white dark:border-gray-800 flex items-center justify-center">
                        <span className="text-xs font-bold text-white">+20</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative element */}
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-blue-300 dark:bg-blue-700 rounded-full opacity-20 blur-2xl"></div>
              <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-indigo-300 dark:bg-indigo-700 rounded-full opacity-20 blur-3xl"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 dark:bg-black text-white">
        {/* Prominent Footer CTA */}
        <div className="bg-gradient-to-r from-primary to-secondary py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Start a Trip?
            </h2>
            <p className="text-lg text-gray-100 mb-6 max-w-2xl mx-auto">
              Build your dream experience with our Journey Builder and connect with travelers worldwide
            </p>
            <Button 
              size="lg" 
              className="bg-white text-primary hover:bg-gray-100 text-lg font-semibold px-10 py-6 h-auto"
              onClick={() => setLocation('/journey-builder')}
              data-testid="button-footer-start-trip"
              aria-label="Start creating a trip using the journey builder"
            >
              <Sparkles className="mr-2 h-5 w-5" aria-hidden="true" />
              Start a Trip
              <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Footer Main Content */}
        <div className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              {/* Brand & Description */}
              <div className="col-span-1 md:col-span-2">
                <div className="flex items-center mb-4">
                  <span className="text-3xl font-bold text-white">Great.</span>
                </div>
                <p className="text-gray-400 mb-6 max-w-md">
                  The platform for community-backed experiences. Create, discover, and fund transformative journeys together.
                </p>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
                    onClick={() => setLocation('/journey-builder')}
                    data-testid="button-footer-create"
                    aria-label="Create a new experience using the journey builder"
                  >
                    Create Experience
                  </Button>
                  <Button 
                    variant="outline" 
                    className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
                    onClick={() => setLocation('/experiences')}
                    data-testid="button-footer-browse"
                    aria-label="Browse all available trips and experiences"
                  >
                    Browse Trips
                  </Button>
                </div>
              </div>

              {/* For Creators */}
              <div>
                <h3 className="text-lg font-semibold mb-4">For Creators</h3>
                <ul className="space-y-2">
                  <li>
                    <button 
                      onClick={() => setLocation('/journey-builder')} 
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Go to journey builder to create your trip"
                    >
                      Journey Builder
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => setLocation('/creator-dashboard')} 
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Go to creator dashboard to manage your trips"
                    >
                      Creator Dashboard
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => setLocation('/experiences')} 
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Browse all available experiences"
                    >
                      Browse Experiences
                    </button>
                  </li>
                </ul>
              </div>

              {/* For Providers */}
              <div>
                <h3 className="text-lg font-semibold mb-4">For Providers</h3>
                <ul className="space-y-2">
                  <li>
                    <button 
                      onClick={() => setLocation('/venue-profile-setup')} 
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="List your venue on the platform"
                    >
                      List Your Venue
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => setLocation('/service-provider-setup')} 
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Offer your services to creators"
                    >
                      Offer Services
                    </button>
                  </li>
                  <li>
                    <button 
                      onClick={() => setLocation('/venues')} 
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Browse all available venues"
                    >
                      Browse Venues
                    </button>
                  </li>
                </ul>
              </div>
            </div>

            {/* Admin Links (Conditional) */}
            {user?.role === 'admin' && (
              <div className="border-t border-gray-800 pt-6 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-orange-400" aria-hidden="true" />
                  <h4 className="text-sm font-semibold text-orange-400">Admin Tools</h4>
                </div>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={() => setLocation('/admin')} 
                    className="text-sm text-gray-400 hover:text-orange-400 transition-colors"
                    data-testid="link-admin-dashboard"
                    aria-label="Go to admin dashboard to manage platform"
                  >
                    Admin Dashboard
                  </button>
                  <button 
                    onClick={() => setLocation('/admin/api-console')} 
                    className="text-sm text-gray-400 hover:text-orange-400 transition-colors"
                    data-testid="link-api-console"
                    aria-label="Go to API console for development tools"
                  >
                    API Console
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Bar: Legal & Links */}
            <div className="border-t border-gray-800 pt-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                {/* Legal Copy */}
                <div className="text-sm text-gray-400 max-w-2xl">
                  <p className="mb-2">&copy; 2024 Great. All rights reserved.</p>
                  <p className="text-xs">
                    This is a functional prototype demonstrating community-backed travel experiences with Stripe Sandbox payment processing. 
                    All bookings use test payment methods. No real charges will be made.
                  </p>
                </div>

                {/* Links */}
                <div className="flex flex-col sm:flex-row gap-4 text-sm">
                  <a 
                    href="https://github.com/replit/replit/blob/main/README.md" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                    data-testid="link-setup-readme"
                    aria-label="Read setup and documentation on GitHub"
                  >
                    📖 Setup & Documentation
                  </a>
                  <button 
                    onClick={() => setLocation('/about')} 
                    className="text-gray-400 hover:text-white transition-colors"
                    aria-label="Learn more about the platform"
                  >
                    About
                  </button>
                  {isAuthenticated ? (
                    <button 
                      onClick={() => setLocation('/creator-dashboard')} 
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Go to your dashboard"
                    >
                      Dashboard
                    </button>
                  ) : (
                    <a 
                      href="/api/login" 
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Log in to your account"
                    >
                      Login
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Join Trip Modal */}
      {selectedTrip && (
        <JoinTripModal
          open={!!selectedTrip}
          onClose={() => setSelectedTrip(null)}
          trip={selectedTrip}
          onConfirm={handleDepositConfirm}
        />
      )}

      {/* Share Kit Modal */}
      {boostExperience && (
        <ShareKitModal
          open={!!boostExperience}
          onClose={() => setBoostExperience(null)}
          experience={{
            id: boostExperience.id,
            title: boostExperience.title,
            location: boostExperience.location,
            coverImageUrl: boostExperience.coverImageUrl,
            lifecycleStatus: boostExperience.lifecycleStatus,
            participantsNeeded: boostExperience.participantsNeeded,
            currency: boostExperience.currency,
          }}
        />
      )}
    </div>
  );
}
