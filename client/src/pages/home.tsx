import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, ChevronLeft, ChevronRight, Calendar, Users, TrendingUp, MapPin, CheckCircle, AlertCircle, Clock, Sparkles, Shield, Heart, DollarSign, Star, Lock, RefreshCw, CreditCard, MessageCircle, Check, Plane, Home as HomeIcon, Quote, Wifi, Coffee, Mountain, Zap, Rocket, Search, Megaphone, Building2 } from "lucide-react";
import { ShareKitModal } from "@/components/ShareKitModal";
import { useAuth } from "@/hooks/useAuth";
import { normalizeImageUrl } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FundingProgressBar } from "@/components/funding/FundingProgressBar";
import { CountdownTimer } from "@/components/funding/CountdownTimer";
import { ParticipantAvatars } from "@/components/funding/ParticipantAvatars";
import { ExperienceParticipantSocialProof } from "@/components/ExperienceParticipantSocialProof";
import { DiscoveryExperienceCard } from "@/components/DiscoveryExperienceCard";
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

const HOMEPAGE_QUICK_CATEGORIES = [
  "Run Clubs",
  "Fitness & Yoga",
  "Community & Social",
  "Sports & Wellness",
  "Festivals & Events",
  "Retreats",
  "Adventure Trips",
] as const;

export default function Home() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedTrip, setSelectedTrip] = useState<any | null>(null);
  const [boostExperience, setBoostExperience] = useState<any | null>(null);
  const [heroSearchQuery, setHeroSearchQuery] = useState("");
  const { toast } = useToast();
  const depositMutation = useDepositMutation();
  const { isConnected } = useRealtimeMVGUpdates('all');
  const trendingScrollRef = useRef<HTMLDivElement>(null);
  const newlyAddedScrollRef = useRef<HTMLDivElement>(null);

  const scrollSwimlane = (ref: React.RefObject<HTMLDivElement>, direction: 1 | -1) => {
    ref.current?.scrollBy({ left: direction * 640, behavior: 'smooth' });
  };

  const openExperienceSearch = (query = heroSearchQuery) => {
    const trimmedQuery = query.trim();
    setLocation(`/experiences${trimmedQuery ? `?search=${encodeURIComponent(trimmedQuery)}` : ""}`);
  };

  useCoreWebVitals();

  // Scroll to experiences section when navigated here from another page via "Explore experiences"
  useEffect(() => {
    if (sessionStorage.getItem("scrollToTrips") === "1") {
      sessionStorage.removeItem("scrollToTrips");
      const tryScroll = () => {
        const el =
          document.getElementById("trending-now-section") ||
          document.getElementById("newly-added-section") ||
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
          createdAt: trip.createdAt,
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
          greatPillars: trip.greatPillars || [],
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

  // Grid groups — CANCELLED trips never show; price-less trips never show
  const visibleExperiences = filteredExperiences.filter((e: any) => {
    if (e.lifecycleStatus === 'cancelled') return false;
    // Only hide experiences with no full price at all — deposit is optional
    if (!e.price || e.price <= 0) return false;
    return true;
  });

  // ── Swimlane feeds ────────────────────────────────────────────────────────
  // "Trending Now" — forming experiences closest to hitting their MVG (highest funding %)
  const trendingExps = visibleExperiences
    .filter((e: any) => e.lifecycleStatus === 'forming')
    .sort((a: any, b: any) => (b.fundingPercentage || 0) - (a.fundingPercentage || 0));
  // "Newly Added" — the newest experiences still gathering their first members
  const newlyAddedExps = [...visibleExperiences]
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  // Human gap psychology — people help people, not percentages
  const getUrgencyLabel = (spotsNeeded: number) => {
    if (spotsNeeded === 1) return "🔥 Just 1 more member to make this real!";
    if (spotsNeeded <= 3) return `🔥 Just ${spotsNeeded} more members to make this real!`;
    if (spotsNeeded <= 6) return `⚡ ${spotsNeeded} more members needed to confirm this experience!`;
    return `👥 ${spotsNeeded} more members needed to make this happen!`;
  };

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
          title: "🎉 Experience Confirmed!",
          description: `${tripTitle} has reached its MVG target and is now confirmed! The host and all participants will be notified.`,
        });
      } else {
        const remaining = selectedTrip.minimumParticipants - mvgStatus.seats_taken;
        toast({
          title: "Deposit Confirmed! 🎉",
          description: `You've joined ${tripTitle}. ${remaining} more member(s) needed to confirm this experience.`,
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

  // Compact card used inside the horizontal "swimlane" feeds (Trending / Newly Added)
  const renderSwimlaneCard = (experience: any) => {
    const spotsNeeded = experience.participantsNeeded ?? 0;
    const urgencyLabel = spotsNeeded > 0 ? getUrgencyLabel(spotsNeeded) : null;
    const daysLeft = getDaysUntilDeadline(experience.fundingDeadline);
    const spotsTaken = experience.currentParticipants;
    const spotsTotal = experience.minimumParticipants;
    const price = experience.price;
    const activeChatters = experience.activeChatters;
    const isConfirmed = experience.lifecycleStatus === 'confirmed';
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
        className="flex-shrink-0 w-[280px] sm:w-[320px] snap-start overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 bg-white dark:bg-gray-800 border border-primary/15 dark:border-primary/20 cursor-pointer group"
        onClick={() => setLocation(`/experiences/${experience.id}`)}
        data-testid={`swimlane-card-${experience.id}`}
      >
        {/* Image */}
        <div className="relative w-full overflow-hidden" style={{ paddingBottom: '66%' }}>
          <ProgressiveImage
            src={normalizeImageUrl(experience.coverImageUrl) || "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop"}
            alt={experience.title}
            className="absolute inset-0 group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60 pointer-events-none" />
          {/* Lifecycle badge */}
          <div className="absolute top-3 left-3 z-10">
            {isConfirmed ? (
              <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                ✅ IT'S HAPPENING
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse">
                ⚡ FORMING NOW
              </span>
            )}
          </div>
          {activeChatters > 0 && (
            <div className="absolute top-3 right-3 bg-green-500 text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1 z-10">
              <MessageCircle className="h-3.5 w-3.5" />+{activeChatters}
            </div>
          )}
        </div>
        <CardContent className="p-5">
          {urgencyLabel && !isConfirmed && (
            <p className="text-base font-black text-primary leading-tight tracking-tight mb-2">{urgencyLabel}</p>
          )}
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2 line-clamp-2 min-h-[2.75rem]">{experience.title}</h3>
          <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 mb-1">
            <MapPin className="h-4 w-4 flex-shrink-0" /><span className="line-clamp-1">{experience.location}</span>
          </div>
          {experience.startDate && (
            <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 mb-3">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span>{new Date(experience.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          )}
          {experience.requireMinimumParticipants && spotsTaken !== null && spotsTaken !== undefined && spotsTotal ? (
            <div className="mb-3">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-1.5">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${isConfirmed ? 'bg-emerald-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, experience.fundingPercentage || 0)}%` }}
                />
              </div>
              <ExperienceParticipantSocialProof
                participants={experience.participants}
                joinedCount={spotsTaken}
                className="mt-2"
              />
              <p className={`mt-1 text-xs font-semibold ${isConfirmed ? 'text-emerald-700' : 'text-primary'}`}>
                {!isConfirmed && spotsNeeded > 0 ? `${spotsNeeded} more needed to confirm` : 'Group confirmed!'}
              </p>
            </div>
          ) : (
            <ExperienceParticipantSocialProof
              participants={experience.participants}
              joinedCount={spotsTaken}
              className="mb-3"
            />
          )}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mb-3">
            {depositAmount > 0 ? (
              <>
                <p className="text-lg font-bold text-gray-900 dark:text-white">Reserve for {formatCurrency(depositAmount, experience.currency)}</p>
                <p className="text-xs text-gray-500">Full price {formatCurrency(price, experience.currency)} pp</p>
              </>
            ) : parseFloat(price) > 0 ? (
              <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(price, experience.currency)} pp</p>
            ) : (
              <p className="text-lg font-bold text-gray-900 dark:text-white">Free RSVP</p>
            )}
          </div>
          <Button
            size="sm"
            className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-semibold"
            onClick={(e) => { e.stopPropagation(); setLocation(`/experiences/${experience.id}`); }}
            data-testid={`button-swimlane-reserve-${experience.id}`}
          >
            {isConfirmed ? 'Secure Your Spot' : 'Reserve Your Spot'}
          </Button>
        </CardContent>
      </Card>
    );
  };

  const renderDiscoveryCard = (experience: any) => (
    <DiscoveryExperienceCard key={experience.id} experience={experience} layout="swimlane" />
  );

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

      {/* ══════════════════════════════════════════════════════════════════════
          TOP 70% — FOR PARTICIPANTS (B2C)
          ══════════════════════════════════════════════════════════════════════ */}

      {/* 1. Hero Section with Search Bar + Category Pills — solid brand gradient, compact
          height so the search bar, pills, and first row of cards sit above the fold */}
      <section id="main-content" tabIndex={-1} className="relative overflow-visible bg-gradient-to-br from-primary via-primary/80 to-secondary min-h-[60vh] flex items-center justify-center px-4 py-10 sm:py-12">
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="text-center text-white px-4 sm:px-6 lg:px-8">
            <h1 className="font-bold mb-4 leading-[1.1] px-2" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
              Experiences backed by real communities.
            </h1>
            <p className="text-white/95 mb-8 max-w-4xl mx-auto leading-relaxed px-2" style={{ fontSize: 'clamp(1.1rem, 2vw, 1.5rem)' }}>
              Join a squad, reserve your spot, and make the experience a reality.
            </p>
            <form
              className="mx-auto flex max-w-4xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-black/25 sm:flex-row sm:rounded-full"
              onSubmit={(event) => {
                event.preventDefault();
                openExperienceSearch();
              }}
              role="search"
              aria-label="Search community experiences"
            >
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder="Search destination, activity, or category..."
                  value={heroSearchQuery}
                  onChange={(event) => setHeroSearchQuery(event.target.value)}
                  className="h-14 border-0 bg-transparent pl-12 pr-4 text-base text-slate-950 shadow-none placeholder:text-slate-500 focus-visible:ring-0"
                  aria-label="Search destination, activity, or category"
                  data-testid="input-homepage-experience-search"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-14 rounded-xl bg-primary px-8 text-base font-bold text-white hover:bg-primary/90 sm:rounded-full"
                data-testid="button-homepage-search"
              >
                Search
              </Button>
            </form>

            <div className="mx-auto mt-5 max-w-5xl overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max justify-start gap-2 sm:justify-center" role="group" aria-label="Popular experience categories">
                {HOMEPAGE_QUICK_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => openExperienceSearch(category)}
                    className="rounded-full border border-white/60 bg-slate-950/25 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition hover:border-white hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    data-testid={`homepage-quick-category-${category.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2 & 3. Event feeds — horizontal "swimlanes" that overlap the hero */}
      {fundingLoading ? (
        <div className="relative z-20 bg-white dark:bg-gray-900 pt-10 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Skeleton className="h-8 w-56 mb-4" />
            <TripCardSkeletonGrid count={3} />
          </div>
        </div>
      ) : (
        <div className="relative z-20 bg-white dark:bg-gray-900 pt-10 pb-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            {visibleExperiences.length === 0 ? (
              /* Empty state */
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Users className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  No Experiences Available Yet
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
              <>
                {/* 2. Trending Now — closest to hitting their MVG */}
                {trendingExps.length > 0 && (
                  <section id="trending-now-section">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                          🔥 Trending Now
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                          Experiences closest to hitting their group goal — one more member could make it real.
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="rounded-full h-9 w-9"
                          onClick={() => scrollSwimlane(trendingScrollRef, -1)}
                          aria-label="Scroll trending experiences left"
                          data-testid="button-trending-scroll-left"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="rounded-full h-9 w-9"
                          onClick={() => scrollSwimlane(trendingScrollRef, 1)}
                          aria-label="Scroll trending experiences right"
                          data-testid="button-trending-scroll-right"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div ref={trendingScrollRef} className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0" data-testid="trending-swimlane">
                      {trendingExps.map((experience: any) => renderDiscoveryCard(experience))}
                    </div>
                  </section>
                )}

                {/* 3. Newly Added — new experiences looking for their first members */}
                {newlyAddedExps.length > 0 && (
                  <section id="newly-added-section">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                          ✨ Newly Added
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                          Fresh experiences gathering their first members. Be an early founder.
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="rounded-full h-9 w-9"
                          onClick={() => scrollSwimlane(newlyAddedScrollRef, -1)}
                          aria-label="Scroll newly added experiences left"
                          data-testid="button-newly-added-scroll-left"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="rounded-full h-9 w-9"
                          onClick={() => scrollSwimlane(newlyAddedScrollRef, 1)}
                          aria-label="Scroll newly added experiences right"
                          data-testid="button-newly-added-scroll-right"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div ref={newlyAddedScrollRef} className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0" data-testid="newly-added-swimlane">
                      {newlyAddedExps.map((experience: any) => renderDiscoveryCard(experience))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 4. How It Works - 3-Step Social Contract (the MVG model) */}
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
                Pay a small refundable deposit. This is your commitment to the group — your vote that this experience should happen.
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
                Use the Invite the Squad kit to bring friends. The experience only confirms when the group forms — so every share counts.
              </p>
              {/* Arrow connector — desktop only */}
              <div className="hidden md:flex absolute top-8 -right-4 z-10 items-center">
                <ChevronRight className="h-7 w-7 text-gray-300 dark:text-gray-600" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center" data-testid="how-it-works-step-3">
              <div className="text-6xl mb-5" role="img" aria-label="Experience confirmation icon">✨</div>
              <div className="inline-flex items-center justify-center w-7 h-7 bg-emerald-500 text-white rounded-full text-sm font-bold mb-4">3</div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                Unlock the Experience
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-base leading-relaxed max-w-xs mx-auto">
                Once the minimum group is met, the experience confirms automatically. Your deposit converts and the magic happens.
              </p>
            </div>
          </div>

          {/* Safety reassurance */}
          <div className="text-center mb-10" data-testid="how-it-works-reassurance">
            <p className="text-gray-400 dark:text-gray-500 text-sm md:text-base italic">
              No group? No charge. Every deposit is fully refundable if the experience doesn't confirm.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-white font-semibold px-10 py-6 h-auto text-base"
              onClick={() => {
                const trendingEl = document.getElementById('trending-now-section');
                const newlyEl = document.getElementById('newly-added-section');
                (trendingEl || newlyEl)?.scrollIntoView({ behavior: 'smooth' });
              }}
              data-testid="button-how-it-works-find-trip"
            >
              Find Your Experience
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* 5. Community Hub Teaser — group chat mockup */}
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
                Meet Your Community
              </h2>

              <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                Local experiences with friends you haven't met yet. Connect with fellow members, share meaningful moments, and build friendships that last long after the event ends.
              </p>

              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-3">
                  <Users className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Find Your People</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Connect with people who share your interests and want to join the same local events</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MessageCircle className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Chat Before the Event</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Get to know your group chat, plan activities, and build excitement</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Heart className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Make Lasting Connections</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Turn community connections into lifelong friends through shared memories</p>
                  </div>
                </div>
              </div>

              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setLocation('/community-hub')}
                data-testid="button-community-hub-primary"
                aria-label="Go to community hub to connect with members"
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
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Sarah from Gràcia</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">So excited for Saturday's yoga session! Who's bringing the kombucha? 🧘</p>
                    </div>
                  </div>

                  {/* Chat Message 2 */}
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Marcus from Poblenou</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">I'll bring it! Coffee together after the session?</p>
                    </div>
                  </div>

                  {/* Chat Message 3 */}
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Jessica from Eixample</p>
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

      {/* ══════════════════════════════════════════════════════════════════════
          BOTTOM 30% — FOR CREATORS, VENUES & PROMOTERS (B2B)
          ══════════════════════════════════════════════════════════════════════ */}

      {/* 6. Visual divider — signals the B2C → B2B split */}
      <div className="bg-gray-900 dark:bg-black py-4 border-y border-gray-800" data-testid="b2b-divider">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.25em] text-gray-300">
            For Creators, Venues &amp; Promoters
          </p>
        </div>
      </div>

      {/* 7. Win/Win/Win — For Participants, For Creators, For Venues & Promoters */}
      <section className="py-16 lg:py-20 bg-gradient-to-br from-gray-100 via-white to-gray-100 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Win/Win/Win for Everyone
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              A platform designed to benefit participants, creators, venues, and promoters alike
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* For Participants */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-shadow border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Plane className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  For Participants
                </h3>
              </div>

              <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed mb-8">
                Meet your community before the event and book risk-free — only pay when the experience confirms.
              </p>

              <Button
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
                onClick={() => setLocation('/experiences')}
                data-testid="button-browse-trips-win"
              >
                Browse Experiences
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

            {/* For Venues & Promoters */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-shadow border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  For Venues &amp; Promoters
                </h3>
              </div>

              <p className="text-gray-700 dark:text-gray-300 text-lg leading-relaxed mb-8">
                Venues fill their calendar with committed groups, and promoters earn by bringing the crowd that makes each experience happen.
              </p>

              <div className="flex flex-col gap-2">
                <Button
                  size="lg"
                  className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
                  onClick={() => setLocation('/venue-profile-setup')}
                  data-testid="button-list-venue-win"
                >
                  List Your Venue
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-primary/30 text-primary hover:bg-primary/5 font-semibold"
                  onClick={() => setLocation('/promoter')}
                  data-testid="button-become-promoter-win"
                >
                  <Megaphone className="mr-2 h-5 w-5" />
                  Become a Promoter
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Footer — home of the B2B links (List your Venue, Offer Services, etc.) */}
      <footer className="bg-gray-900 dark:bg-black text-white">
        {/* Prominent Footer CTA */}
        <div className="bg-gradient-to-r from-primary to-secondary py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Start an Experience?
            </h2>
            <p className="text-lg text-gray-100 mb-6 max-w-2xl mx-auto">
              Build your ideal local event with our Experience Builder and connect with community members
            </p>
            <Button
              size="lg"
              className="bg-white text-primary hover:bg-gray-100 text-lg font-semibold px-10 py-6 h-auto"
              onClick={() => setLocation('/journey-builder')}
              data-testid="button-footer-start-trip"
              aria-label="Start creating an experience using the experience builder"
            >
              <Sparkles className="mr-2 h-5 w-5" aria-hidden="true" />
              Start an Experience
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
                  The platform for community-backed experiences. Create, discover, and fund meaningful local events together.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
                    onClick={() => setLocation('/journey-builder')}
                    data-testid="button-footer-create"
                    aria-label="Create a new experience using the experience builder"
                  >
                    Create Experience
                  </Button>
                  <Button
                    variant="outline"
                    className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
                    onClick={() => setLocation('/experiences')}
                    data-testid="button-footer-browse"
                    aria-label="Browse all available experiences and events"
                  >
                    Browse Experiences
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
                      aria-label="Go to experience builder to create your event"
                    >
                      Experience Builder
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setLocation('/creator-dashboard')}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Go to creator dashboard to manage your experiences"
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

              {/* For Venues, Promoters & Providers */}
              <div>
                <h3 className="text-lg font-semibold mb-4">For Venues &amp; Promoters</h3>
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
                      onClick={() => setLocation('/promoter')}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Become a promoter and earn by growing experiences"
                    >
                      Become a Promoter
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
                    This is a functional prototype demonstrating community-backed local experiences with Stripe Sandbox payment processing.
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
