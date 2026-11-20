import { useState, useEffect, useRef } from "react";
import { splitHomepageRows } from "@shared/homepageOrder";
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
import { CityMenu } from "@/components/CityMenu";
import { useCity } from "@/hooks/useCity";
import { ALL_CITIES, cityOfEvent, cityPath, inCity, liveCityByName, liveCityBySlug } from "@shared/cities";
import { TripCardSkeletonGrid } from "@/components/skeletons/TripCardSkeleton";
import { ProgressiveImage } from "@/components/ProgressiveImage";
import { Skeleton } from "@/components/ui/skeleton";
import { useCoreWebVitals } from "@/hooks/useCoreWebVitals";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeMVGUpdates } from "@/hooks/useRealtimeUpdates";
import BrandLogo from "@/components/BrandLogo";
import { hasDisplayableDiscoveryPrice, resolveDiscoveryPricing } from "@/lib/discoveryPricing";
import { FeaturedCommunities } from "@/components/FeaturedCommunities";
import CollabIdeasStrip from "@/components/CollabIdeasStrip";

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
  const [currentPath, setLocation] = useLocation();
  // Cities (66.24): /amsterdam and /barcelona open that city directly (the
  // Instagram accounts link there); otherwise the visitor's chosen or guessed city.
  const { city: savedCity, chosen: cityChosen, suggested: suggestedCity, setCity } = useCity();
  const pathCity = liveCityBySlug(currentPath.replace(/^\//, "").split(/[/?#]/)[0]);
  useEffect(() => {
    if (pathCity && savedCity !== pathCity.name) setCity(pathCity.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathCity?.name]);
  const shownCity = pathCity?.name ?? savedCity;
  const cityName = shownCity === ALL_CITIES ? null : shownCity;
  const [cityBannerClosed, setCityBannerClosed] = useState(false);
  const showCityBanner = !pathCity && !cityChosen && !!suggestedCity && !cityBannerClosed;
  const { isAuthenticated, user } = useAuth();
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [boostExperience, setBoostExperience] = useState<any | null>(null);
  const [heroSearchQuery, setHeroSearchQuery] = useState("");
  const { toast } = useToast();
  const { isConnected } = useRealtimeMVGUpdates('all');
  const happeningScrollRef = useRef<HTMLDivElement>(null);
  const provenScrollRef = useRef<HTMLDivElement>(null);

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
          document.getElementById("happening-now-section") ||
          document.getElementById("proven-popular-section") ||
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
        const { price, depositAmount } = resolveDiscoveryPricing(
          trip.ticketSkus,
          trip.price,
          trip.depositAmount
        );

        return {
          id: trip.id,
          title: trip.title,
          location: trip.location,
          city: trip.city,
          manualVenueAddress: trip.manualVenueAddress,
          // The venue's name on the card, under the photo (66.31e, 66.34k).
          venue: trip.venue,
          manualVenueName: trip.manualVenueName,
          // Start and end times, so the rows switch at the real start (66.21).
          startTime: trip.startTime,
          endTime: trip.endTime,
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

  // Grid groups — cancelled and genuinely price-less experiences never show.
  // Zero is a valid display price for Free RSVP experiences.
  const visibleExperiences = filteredExperiences.filter((e: any) => {
    if (e.lifecycleStatus === 'cancelled') return false;
    if (!hasDisplayableDiscoveryPrice(e.price)) return false;
    return true;
  });

  // ── Swimlane feeds ────────────────────────────────────────────────────────
  //
  // "Trending Now" and "Newly Added" both went: neither added anything the
  // FORMING NOW / IT'S HAPPENING badge on every card already says, and between
  // them they filled the homepage with empty, not-yet-funded events — which is
  // the worst possible first impression for a visitor deciding whether anything
  // here actually happens.
  //
  // "Happening now" is everything still open for sign-up, whatever its MVG
  // status, confirmed first, then strongest signups, with date as the
  // tiebreaker. An event that has already taken place is not in it.
  //
  // "Proven & popular" — what already filled up or already happened, ranked by
  // how many people came. This is the social proof that was missing entirely:
  // Good Soles' full runs had no homepage presence at all, so a first-time
  // visitor only ever saw events nobody had joined yet.
  // One city at a time (66.24); the other cities get one row underneath.
  const cityExperiences = cityName
    ? visibleExperiences.filter((e: any) => inCity(cityOfEvent(e), cityName))
    : visibleExperiences;
  const otherCityExperiences = cityName
    ? visibleExperiences.filter((e: any) => !inCity(cityOfEvent(e), cityName))
    : [];
  const { happening: happeningNowExps, proven: provenExps } = splitHomepageRows(cityExperiences);
  const otherCityHappening = splitHomepageRows(otherCityExperiences).happening;
  // The "See all" card points at the other live city with the most events.
  const otherCityCounts = new Map<string, number>();
  for (const e of otherCityHappening) {
    const name = liveCityByName(cityOfEvent(e) ?? "")?.name;
    if (name) otherCityCounts.set(name, (otherCityCounts.get(name) ?? 0) + 1);
  }
  const otherCityName = Array.from(otherCityCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const cityLabel = cityName ?? "all cities";
  const openCity = (name: string) => {
    setCity(name);
    setLocation(cityPath(name));
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      {/* Compact on purpose (66.31g): the search, the chips and the first event
          cards must all be visible without scrolling, on a phone too. */}
      <section id="main-content" tabIndex={-1} className="relative overflow-visible bg-gradient-to-br from-primary via-primary/80 to-secondary flex items-center justify-center px-2 py-5 sm:px-4 sm:py-8">
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="text-center text-white px-2 sm:px-6 lg:px-8">
            <h1 className="font-bold mb-4 leading-[1.1] px-2 sm:mb-6" style={{ fontSize: 'clamp(1.5rem, 4vw, 2.75rem)' }}>
              Experiences backed by real communities.
            </h1>
            <form
              className="mx-auto flex max-w-4xl flex-row gap-2 rounded-full bg-white p-1.5 shadow-2xl shadow-black/25 sm:p-2"
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
                  className="h-11 border-0 bg-transparent pl-12 pr-2 text-base text-slate-950 shadow-none placeholder:text-slate-500 focus-visible:ring-0 sm:h-14 sm:pr-4"
                  aria-label="Search destination, activity, or category"
                  data-testid="input-homepage-experience-search"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-11 rounded-full bg-primary px-5 text-base font-bold text-white hover:bg-primary/90 sm:h-14 sm:px-8"
                data-testid="button-homepage-search"
              >
                Search
              </Button>
            </form>

            <div className="mx-auto mt-3 max-w-5xl overflow-x-auto pb-1 [scrollbar-width:none] sm:mt-5 [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max justify-start gap-2 sm:justify-center" role="group" aria-label="Popular experience categories">
                {HOMEPAGE_QUICK_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => openExperienceSearch(category)}
                    className="rounded-full border border-white/60 bg-slate-950/25 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-md sm:px-4 sm:py-2 transition hover:border-white hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
        <div className="relative z-20 bg-white dark:bg-gray-900 pt-4 pb-8 sm:pt-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            {/* First visit: the city guessed from the internet address (66.24, board C1). */}
            {showCityBanner && suggestedCity && (
              <div
                className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                role="region"
                aria-label="Your city"
                data-testid="city-banner"
              >
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">Looks like you are in {suggestedCity}</p>
                  <p className="hidden text-sm text-gray-600 dark:text-gray-300 sm:block">
                    We use your approximate location from your internet address. Nothing is stored until you choose.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => openCity(suggestedCity)}
                    data-testid="button-city-banner-accept"
                  >
                    Show {suggestedCity}
                  </Button>
                  <CityMenu
                    triggerLabel="Choose another city"
                    onChosen={() => setCityBannerClosed(true)}
                    className="border border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
                  />
                </div>
              </div>
            )}

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
                {/* 2. Happening now — everything open for sign-up */}
                {happeningNowExps.length > 0 && (
                  <section id="happening-now-section">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2" data-testid="heading-happening-now">
                          ⚡ Happening now{cityName ? ` in ${cityName}` : ""}
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                          Join a squad, reserve your spot. When enough people join, it happens.
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="rounded-full h-9 w-9"
                          onClick={() => scrollSwimlane(happeningScrollRef, -1)}
                          aria-label="Scroll experiences happening now left"
                          data-testid="button-happening-scroll-left"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="rounded-full h-9 w-9"
                          onClick={() => scrollSwimlane(happeningScrollRef, 1)}
                          aria-label="Scroll experiences happening now right"
                          data-testid="button-happening-scroll-right"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div ref={happeningScrollRef} className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0" data-testid="happening-now-swimlane">
                      {happeningNowExps.map((experience: any) => renderDiscoveryCard(experience))}
                    </div>
                  </section>
                )}

                {/* 3. Proven & popular — real join counts, as social proof */}
                {provenExps.length > 0 && (
                  <section id="proven-popular-section">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                          ⭐ Proven &amp; popular
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                          Experiences that filled up or already happened, with the
                          numbers that actually turned out.
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="rounded-full h-9 w-9"
                          onClick={() => scrollSwimlane(provenScrollRef, -1)}
                          aria-label="Scroll proven experiences left"
                          data-testid="button-proven-scroll-left"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="rounded-full h-9 w-9"
                          onClick={() => scrollSwimlane(provenScrollRef, 1)}
                          aria-label="Scroll proven experiences right"
                          data-testid="button-proven-scroll-right"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div ref={provenScrollRef} className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0" data-testid="proven-popular-swimlane">
                      {provenExps.map((experience: any) => renderDiscoveryCard(experience))}
                    </div>
                  </section>
                )}

                {/* 4. Collab Ideas — one row, on purpose.
                    A venue owner browsing the homepage might be exactly who an
                    open idea is looking for, and ideas had no homepage presence
                    at all. Kept to a single line rather than a card grid: at
                    current volume a full section would be mostly empty, which
                    would read as the feature being dead. Promote it once the
                    volume justifies one. */}
                {/* Nothing in this city yet: say so instead of a blank page. */}
                {happeningNowExps.length === 0 && provenExps.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center" data-testid="city-empty">
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">Nothing planned in {cityLabel} yet</p>
                    <p className="mt-1 text-gray-500 dark:text-gray-400">Be the first: start an experience here, or look at another city below.</p>
                    <Button className="mt-4" onClick={() => setLocation('/create-experience')} data-testid="button-city-empty-create">
                      Create an experience
                    </Button>
                  </div>
                )}

                {/* Also in other cities (66.24, board C1). */}
                {cityName && otherCityHappening.length > 0 && (
                  <section id="other-cities-section" data-testid="other-cities-section">
                    <div className="mb-5">
                      <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1">Also in other cities</h2>
                      <p className="text-gray-500 dark:text-gray-400">Tap a city to switch. Your choice is remembered.</p>
                    </div>
                    <div className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                      {otherCityHappening.slice(0, 2).map((experience: any) => renderDiscoveryCard(experience))}
                      {otherCityName && (
                        <button
                          type="button"
                          onClick={() => openCity(otherCityName)}
                          className="flex w-[280px] flex-shrink-0 snap-start items-center justify-center rounded-xl border-2 border-dashed border-primary/30 p-6 text-lg font-semibold text-primary hover:bg-primary/5 sm:w-[320px]"
                          data-testid="button-see-other-city"
                        >
                          See all {otherCityName} events ›
                        </button>
                      )}
                    </div>
                  </section>
                )}

                <CollabIdeasStrip city={cityName} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Communities, not the venue directory. Venue inventory is supply the
          platform manages, so it belongs in the admin dashboard; what a first
          visitor should see is the groups they could join. */}
      <FeaturedCommunities city={cityName} />

      {/* 4. How It Works - 3-Step Social Contract (the MVG model) */}
      <section id="how-it-works" className="py-16 lg:py-24 bg-gray-50 dark:bg-gray-900" data-testid="how-it-works-section">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              Three steps. You pay when you book, and get everything back if the group doesn't form.
            </p>
          </div>

          {/* Steps grid — horizontal on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 lg:gap-8 mb-12 relative">

            {/* Step 1 */}
            <div className="flex flex-col items-center text-center relative" data-testid="how-it-works-step-1">
              <div className="text-6xl mb-5" role="img" aria-label="Booking icon">🗳️</div>
              <div className="inline-flex items-center justify-center w-7 h-7 bg-primary text-white rounded-full text-sm font-bold mb-4">1</div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                Book your spot
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-base leading-relaxed max-w-xs mx-auto">
                You pay when you book. Your booking is your vote that this experience should happen.
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
                Once the minimum group is met, the experience is confirmed automatically. If the group does not reach the minimum, you get a full refund automatically.
              </p>
            </div>
          </div>

          {/* Safety reassurance */}
          <div className="text-center mb-10" data-testid="how-it-works-reassurance">
            <p className="text-gray-400 dark:text-gray-500 text-sm md:text-base italic">
              You pay when you book. If the group does not reach the minimum, you get a full refund automatically.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-white font-semibold px-10 py-6 h-auto text-base"
              onClick={() => {
                const happeningEl = document.getElementById('happening-now-section');
                const provenEl = document.getElementById('proven-popular-section');
                (happeningEl || provenEl)?.scrollIntoView({ behavior: 'smooth' });
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
            For Creators, Venues &amp; Partners
          </p>
        </div>
      </div>

      {/* 7. Win/Win/Win — For Participants, For Creators, For Venues & Partners */}
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
                Launch retreats with zero financial risk: no upfront costs, no losses, only confirmed groups.
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

            {/* For Venues & Partners */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-shadow border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                  For Venues &amp; Partners
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
              onClick={() => setLocation('/create-experience')}
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
                  <BrandLogo className="h-20 w-auto rounded-xl" />
                </div>
                <p className="text-gray-400 mb-6 max-w-md">
                  The platform for community-backed experiences. Create, discover, and fund meaningful local events together.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
                    onClick={() => setLocation('/create-experience')}
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
                      onClick={() => setLocation('/create-experience')}
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
                  <li>
                    {/* The partner guide, not the participant one: someone
                        reading this column is deciding whether to run an event,
                        not whether to book one. */}
                    <button
                      onClick={() => setLocation('/how-it-works/partners')}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="How partnering works for creators, venues and promoters"
                      data-testid="link-footer-partner-guide"
                    >
                      How Partnering Works
                    </button>
                  </li>
                </ul>
              </div>

              {/* For Venues, Partners & Providers */}
              <div>
                <h3 className="text-lg font-semibold mb-4">For Venues &amp; Partners</h3>
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
                      onClick={() => setLocation('/how-it-works/partners')}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="How partnering works for creators, venues and promoters"
                      data-testid="link-footer-partner-guide-venues"
                    >
                      Deal Types &amp; Revenue Share
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
                  <p className="mb-2">&copy; {new Date().getFullYear()} Great. All rights reserved.</p>
                  <p className="text-xs">
                    Payments are processed securely by Stripe. If an event does not reach its minimum group, every buyer gets a full refund automatically.
                  </p>
                </div>

                {/* Links */}
                <div className="flex flex-col sm:flex-row gap-4 text-sm">
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
                      href="/login"
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
