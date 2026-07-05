import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Navigation from "@/components/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { DiscoveryExperienceCard } from "@/components/DiscoveryExperienceCard";

const pillars = [
  { id: "all", title: "All" },
  { id: "health", title: "Health" },
  { id: "sports", title: "Sports" },
  { id: "wellness", title: "Wellness" },
  { id: "food", title: "Food" },
] as const;

const legacyCategoryPillars: Record<string, string[]> = {
  sports_wellness: ["sports", "wellness"],
  retreats: ["health", "wellness"],
  adventure_trips: ["sports"],
};

const quickCategories = [
  "Run Clubs",
  "Yoga",
  "Wellness",
  "Retreats",
  "Workshops",
  "Matcha",
] as const;

const EXPERIENCES_PER_PAGE = 9;

export default function Experiences() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get("search") || "");
  const [selectedCity, setSelectedCity] = useState(() => new URLSearchParams(window.location.search).get("city") || "");
  const [selectedPillar, setSelectedPillar] = useState(() => {
    const category = new URLSearchParams(window.location.search).get("category");
    return category && pillars.some((pillar) => pillar.id === category) ? category : "all";
  });
  const [currentPage, setCurrentPage] = useState(() => {
    const page = Number.parseInt(new URLSearchParams(window.location.search).get("page") || "1", 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
  });
  
  // Enhanced URL parameter handling with routing confirmation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Extract all relevant parameters
    const searchParam = params.get('search');
    const categoryParam = params.get('category');
    const cityParam = params.get('city');
    const startDateParam = params.get('startDate');
    const endDateParam = params.get('endDate');
    
    // Enhanced logging for route confirmation
    console.log("🎯 Explore View (Experiences) Page - Route accessed with parameters:", {
      search: searchParam,
      category: categoryParam,
      city: cityParam,
      startDate: startDateParam,
      endDate: endDateParam,
      source: searchParam ? 'Homepage Search Bar' : 'Direct Navigation'
    });
    
    // Set search query from URL with confirmation
    if (searchParam) {
      console.log(`✅ Search routing confirmed - Query: "${searchParam}" successfully routed to Explore View`);
      setSearchQuery(searchParam);
    }
    
    // Set category from URL with validation
    if (categoryParam) {
      console.log("🏷️ Category parameter detected:", categoryParam);
      if (pillars.some(pillar => pillar.id === categoryParam)) {
        setSelectedPillar(categoryParam);
        console.log(`✅ Category filter applied: ${categoryParam}`);
      } else {
        console.log("⚠️ Invalid category parameter, using default 'all':", categoryParam);
        setSelectedPillar("all");
      }
    }

    if (cityParam) setSelectedCity(cityParam);
    
    // Log date parameters if present
    if (startDateParam || endDateParam) {
      console.log("📅 Date filters detected:", { startDate: startDateParam, endDate: endDateParam });
    }
    
    // Summary routing confirmation log
    const routingSource = searchParam ? 'Homepage Search Bar routing' : 'Direct page access';
    console.log(`🌟 Explore View successfully loaded via ${routingSource}`);
  }, []);

  const { data: experiences = [], isLoading, error, refetch } = useQuery({
    queryKey: ["/api/experiences?includeParticipants=true"],
    retry: 2,
    retryDelay: 1000,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    searchQuery ? params.set("search", searchQuery) : params.delete("search");
    selectedCity ? params.set("city", selectedCity) : params.delete("city");
    selectedPillar !== "all" ? params.set("category", selectedPillar) : params.delete("category");
    currentPage > 1 ? params.set("page", String(currentPage)) : params.delete("page");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [searchQuery, selectedCity, selectedPillar, currentPage]);

  // These discovery inputs can also feed a swipe deck in a later phase.
  const filteredExperiences = Array.isArray(experiences) ? experiences.filter((experience: any) => {
    const query = searchQuery.trim().toLowerCase();
    const searchableText = [
      experience.title,
      experience.description,
      experience.location,
      String(experience.category || "").replace(/_/g, " "),
      ...(Array.isArray(experience.greatPillars) ? experience.greatPillars : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const experiencePillars = Array.isArray(experience.greatPillars)
      ? experience.greatPillars.map((pillar: unknown) => String(pillar).toLowerCase())
      : [];
    const fallbackPillars = legacyCategoryPillars[experience.category] || [];
    const matchesSearch = !query || searchableText.includes(query);
    const matchesCity = !selectedCity
      || String(experience.location || "").toLowerCase().includes(selectedCity.trim().toLowerCase());
    const matchesPillar = selectedPillar === "all"
      || experiencePillars.includes(selectedPillar)
      || (experiencePillars.length === 0 && fallbackPillars.includes(selectedPillar));

    return matchesSearch && matchesCity && matchesPillar;
  }) : [];

  const totalPages = Math.max(1, Math.ceil(filteredExperiences.length / EXPERIENCES_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * EXPERIENCES_PER_PAGE;
  const paginatedExperiences = filteredExperiences.slice(pageStart, pageStart + EXPERIENCES_PER_PAGE);

  useEffect(() => {
    if (!isLoading && currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, isLoading, totalPages]);

  const hasActiveFilters = Boolean(searchQuery || selectedCity || selectedPillar !== "all");
  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCity("");
    setSelectedPillar("all");
    setCurrentPage(1);
  };

  const scrollToResults = () => {
    window.requestAnimationFrame(() => {
      const destination = document.getElementById("experiences-results") || document.getElementById("discovery-filters");
      destination?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const submitHeroSearch = () => {
    setCurrentPage(1);
    scrollToResults();
  };

  const selectQuickCategory = (category: string) => {
    setSearchQuery(category);
    setSelectedCity("");
    setSelectedPillar("all");
    setCurrentPage(1);
    scrollToResults();
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
    document.getElementById("experiences-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Currency formatting helper - handles experience currency
  // DATA CONTRACT: Currency must come from experience.currency - never default to USD
  const formatCurrency = (price: number | string | undefined | null, currency?: string | null) => {
    if (price === undefined || price === null || price === '') return 'Price TBA';
    const numAmount = typeof price === 'string' ? parseFloat(price) : price;
    if (Number.isNaN(numAmount)) return 'Price TBA';
    if (numAmount === 0) return 'Free';
    if (numAmount < 0) return 'Price TBA';
    if (!currency) {
      console.warn('[DataContract] Currency missing - using experience.currency is required');
    }
    const currencyCode = (currency || 'EUR').toUpperCase(); // Default EUR for existing data
    const symbols: Record<string, string> = {
      USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
    };
    const symbol = symbols[currencyCode] || currencyCode + ' ';
    return `${symbol}${numAmount.toFixed(0)}`;
  };
  
  // Helper to get display price from ticket SKUs or legacy price
  const getDisplayPrice = (experience: any): { price: number; hasRange: boolean } => {
    const ticketSkus = experience.ticketSkus || [];
    
    if (ticketSkus.length > 0) {
      const prices = ticketSkus
        .map((s: any) => Number(s.pricePerPerson))
        .filter((p: number) => !Number.isNaN(p) && p >= 0);
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        return { price: minPrice, hasRange: minPrice !== maxPrice };
      }
    }
    
    // Fall back to legacy pricePerPerson or price field
    const legacyPrice = parseFloat(experience.pricePerPerson || experience.price || '0');
    return { price: legacyPrice, hasRange: false };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatLabel = (value: string) => value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  const getExperienceCity = (experience: any) => {
    if (experience.city) return String(experience.city).trim();

    const locationParts = String(experience.location || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const city = locationParts[locationParts.length - 1] || "Location TBA";

    return city.replace(/^\d{3,6}\s+/, "").trim() || city;
  };

  const getCorePillar = (experience: any) => {
    const corePillar = Array.isArray(experience.greatPillars)
      ? experience.greatPillars.find((pillar: unknown) => Boolean(pillar))
      : undefined;

    return formatLabel(String(corePillar || experience.category || "Experience"));
  };

  const getUrgency = (experience: any): { text: string; className: string } | null => {
    const currentParticipants = Number(experience.currentParticipants ?? experience.participantCount ?? 0);
    const participantsNeeded = Number(
      experience.participantsNeeded
      ?? Math.max(0, Number(experience.minimumParticipants || 0) - currentParticipants),
    );
    const isMvgPending = Boolean(experience.requireMinimumParticipants)
      && experience.mvgStatus !== "met"
      && !experience.mvgMet
      && participantsNeeded > 0;

    if (isMvgPending) {
      return {
        text: `⚡ ${participantsNeeded} more needed to confirm`,
        className: "text-amber-700",
      };
    }

    const spotsRemaining = Math.max(0, Number(experience.maxParticipants || 0) - currentParticipants);
    if (spotsRemaining > 0 && spotsRemaining <= 3) {
      return {
        text: `🔥 Only ${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} left`,
        className: "text-red-700",
      };
    }

    return null;
  };

  // Error state with comprehensive feedback
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Search className="h-12 w-12 text-red-500" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Oops! Something went wrong
            </h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              We're having trouble loading experiences right now. This could be due to a network issue or temporary server problem.
            </p>
            <div className="space-y-4">
              <Button 
                onClick={() => refetch()} 
                className="btn-gradient"
                data-testid="button-retry"
              >
                <Loader2 className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <div className="flex gap-4 justify-center">
                <Button 
                  variant="outline" 
                  onClick={() => setLocation('/ai-travel')}
                  data-testid="button-ai-travel"
                >
                  Try AI Travel Planner
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setLocation('/journey-builder')}
                  data-testid="button-create-experience"
                >
                  Create Experience
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state with enhanced skeleton
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Loading header */}
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded-lg w-1/3 mb-4 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
          </div>
          
          {/* Loading filters */}
          <div className="bg-white rounded-lg p-6 mb-8">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1 h-10 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded animate-pulse sm:w-48"></div>
            </div>
          </div>
          
          {/* Loading cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(9)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-200 rounded-t-lg"></div>
                <CardContent className="p-6">
                  <div className="h-6 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded mb-4 w-3/4"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navigation />
      
      {/* Search-first hero */}
      <section className="relative isolate overflow-hidden bg-slate-950 text-white py-14 sm:py-20 lg:py-24">
        <img
          src="/assets/hero-poster.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/90 via-slate-900/75 to-primary/55" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
            Find your people. Try something new.
          </p>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold mb-4 tracking-tight">
            Discover Amazing <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">Experiences</span>
          </h1>
          <p className="text-base sm:text-xl text-white/90 max-w-3xl mx-auto mb-8">
            From transformative retreats to adventure trips - find your next life-changing journey
          </p>

          <form
            className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl bg-white p-2 shadow-2xl shadow-black/25 sm:flex-row sm:rounded-full"
            onSubmit={(event) => {
              event.preventDefault();
              submitHeroSearch();
            }}
            role="search"
          >
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <Input
                type="search"
                placeholder="Search destination, activity, or category..."
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1); }}
                className="h-14 border-0 bg-transparent pl-12 pr-4 text-base text-slate-950 shadow-none placeholder:text-slate-500 focus-visible:ring-0"
                aria-label="Search destination, activity, or category"
                data-testid="input-hero-experience-search"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-14 rounded-xl bg-primary px-8 text-base font-bold hover:bg-primary/90 sm:rounded-full"
              data-testid="button-hero-search"
            >
              Search
            </Button>
          </form>

          <div className="mx-auto mt-5 max-w-5xl overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max justify-start gap-2 sm:justify-center" role="group" aria-label="Popular experience categories">
              {quickCategories.map((category) => {
                const isActive = searchQuery.trim().toLowerCase() === category.toLowerCase();
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => selectQuickCategory(category)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      isActive
                        ? "border-white bg-white text-slate-950"
                        : "border-white/50 bg-slate-950/25 text-white hover:border-white hover:bg-white/20"
                    }`}
                    aria-pressed={isActive}
                    data-testid={`quick-category-${category.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section id="discovery-filters" className="bg-white border-b py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Find your next experience</h2>
            <p className="text-sm text-gray-600">Choose a city and a Great pillar to narrow the marketplace.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_18rem]">
            {/* Search */}
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input
                placeholder="Search experiences..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="h-11 pl-10"
                aria-label="Search experiences"
              />
            </div>

            {/* City Filter */}
            <div className="relative w-full">
              <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="City (e.g. Barcelona)"
                value={selectedCity}
                onChange={(event) => { setSelectedCity(event.target.value); setCurrentPage(1); }}
                className="h-11 pl-10"
                aria-label="Filter by city"
                data-testid="input-city-filter"
              />
            </div>
          </div>

          {/* Great Pillar Filter */}
          <div className="mt-4">
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
              <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap" role="group" aria-label="Filter by Great pillar">
                {pillars.map((pillar) => (
                  <Button
                    key={pillar.id}
                    type="button"
                    size="sm"
                    variant={selectedPillar === pillar.id ? "default" : "outline"}
                    className="shrink-0 rounded-full px-4"
                    onClick={() => { setSelectedPillar(pillar.id); setCurrentPage(1); }}
                    aria-pressed={selectedPillar === pillar.id}
                    data-testid={`filter-pillar-${pillar.id}`}
                  >
                    {pillar.title}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Enhanced Results count with better feedback */}
          <div className="mt-4 text-sm text-gray-600">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <span className={filteredExperiences.length === 0 ? 'text-red-600 font-medium' : ''}>
                  {filteredExperiences.length} experience{filteredExperiences.length !== 1 ? 's' : ''} found
                </span>
                {searchQuery && (
                  <span> for "<strong className="text-gray-800">{searchQuery}</strong>"</span>
                )}
                {selectedCity && (
                  <span> in <strong className="text-gray-800">{selectedCity}</strong></span>
                )}
                {selectedPillar !== "all" && (
                  <span> for <strong className="text-gray-800">{pillars.find(pillar => pillar.id === selectedPillar)?.title}</strong></span>
                )}
              </div>
              
              {hasActiveFilters && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearFilters}
                    className="text-blue-600 hover:text-blue-800 underline"
                    data-testid="button-quick-clear-filters"
                  >
                    Clear filters
                  </button>
                  {filteredExperiences.length === 0 && (
                    <span className="text-red-600 text-xs">• No matches</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Experiences Section */}
      {filteredExperiences.length > 0 && (
        <section id="experiences-results" className="scroll-mt-4 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Available Experiences</h2>
              <Badge className="bg-green-100 text-green-800 border-green-200">
                {filteredExperiences.length} experience{filteredExperiences.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {paginatedExperiences.map((experience) => (
                <DiscoveryExperienceCard key={experience.id} experience={experience} layout="grid" />
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="mt-10 flex flex-col items-center gap-3" aria-label="Experiences pagination" data-testid="experiences-pagination">
                <p className="text-sm text-gray-600">
                  Showing {pageStart + 1}–{Math.min(pageStart + EXPERIENCES_PER_PAGE, filteredExperiences.length)} of {filteredExperiences.length} experiences
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
        </section>
      )}

      {/* Enhanced No Results Section */}
      {filteredExperiences.length === 0 && (
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="h-12 w-12 text-gray-400" />
              </div>
              
              {hasActiveFilters ? (
                <>
                  <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                    No experiences found
                    {searchQuery && ` for "${searchQuery}"`}
                    {selectedCity && ` in ${selectedCity}`}
                    {selectedPillar !== "all" && ` for ${pillars.find(pillar => pillar.id === selectedPillar)?.title}`}
                  </h3>
                  <div className="text-gray-600 mb-6 space-y-2">
                    <p>We couldn't find any experiences matching your criteria.</p>
                    <div className="text-sm">
                      <p>Try:</p>
                      <ul className="list-disc list-inside space-y-1 mt-2">
                        <li>Using different keywords or broader search terms</li>
                        <li>Selecting a different category</li>
                        <li>Checking for spelling errors</li>
                        <li>Browsing all categories</li>
                      </ul>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <Button 
                      onClick={clearFilters}
                      className="btn-gradient"
                      data-testid="button-clear-filters"
                    >
                      Clear All Filters & Browse All
                    </Button>
                    
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button 
                        variant="outline" 
                        onClick={() => setLocation('/ai-travel')}
                        data-testid="button-try-ai-travel"
                      >
                        Try AI Travel Planner
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setLocation('/journey-builder')}
                        data-testid="button-create-your-own"
                      >
                        Create Your Own Experience
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                    No experiences available yet
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Be the first to create an amazing experience for our community!
                  </p>
                  
                  <div className="space-y-4">
                    <Button 
                      onClick={() => setLocation('/journey-builder')}
                      className="btn-gradient"
                      data-testid="button-create-first-experience"
                    >
                      Create the First Experience
                    </Button>
                    
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button 
                        variant="outline" 
                        onClick={() => setLocation('/ai-travel')}
                        data-testid="button-explore-ai-travel"
                      >
                        Explore AI Travel Planner
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setLocation('/creator/profile-setup')}
                        data-testid="button-become-creator"
                      >
                        Become a Creator
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
