import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Navigation from "@/components/navigation";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Calendar, Users, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { normalizeImageUrl } from "@/lib/utils";

const categories = [
  { id: "all", title: "All Categories" },
  { id: "sports_wellness", title: "Sports & Wellness Events" },
  { id: "retreats", title: "Retreats" },
  { id: "adventure_trips", title: "Adventure Trips" },
  { id: "community_social", title: "Community & Social" },
  { id: "workations", title: "Workations" },
  { id: "festivals_events", title: "Festivals & Special Events" }
];

export default function Experiences() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  
  // Enhanced URL parameter handling with routing confirmation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Extract all relevant parameters
    const searchParam = params.get('search');
    const categoryParam = params.get('category');
    const startDateParam = params.get('startDate');
    const endDateParam = params.get('endDate');
    
    // Enhanced logging for route confirmation
    console.log("🎯 Explore View (Experiences) Page - Route accessed with parameters:", {
      search: searchParam,
      category: categoryParam,
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
      if (categories.some(cat => cat.id === categoryParam)) {
        setSelectedCategory(categoryParam);
        console.log(`✅ Category filter applied: ${categoryParam}`);
      } else {
        console.log("⚠️ Invalid category parameter, using default 'all':", categoryParam);
        setSelectedCategory("all");
      }
    }
    
    // Log date parameters if present
    if (startDateParam || endDateParam) {
      console.log("📅 Date filters detected:", { startDate: startDateParam, endDate: endDateParam });
    }
    
    // Summary routing confirmation log
    const routingSource = searchParam ? 'Homepage Search Bar routing' : 'Direct page access';
    console.log(`🌟 Explore View successfully loaded via ${routingSource}`);
  }, []);

  const { data: experiences = [], isLoading, error, refetch } = useQuery({
    queryKey: ["/api/experiences"],
    retry: 2,
    retryDelay: 1000,
  });

  // Filter user experiences based on search and category
  const filteredExperiences = Array.isArray(experiences) ? experiences.filter((experience: any) => {
    const matchesSearch = 
      experience.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      experience.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      experience.location.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === "all" || experience.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  }) : [];

  // Currency formatting helper - handles experience currency
  // DATA CONTRACT: Currency must come from experience.currency - never default to USD
  const formatCurrency = (price: number | string | undefined | null, currency?: string | null) => {
    const numAmount = typeof price === 'string' ? parseFloat(price) : (price || 0);
    // Guard: Show "Price TBA" for zero or missing prices
    if (numAmount <= 0 || isNaN(numAmount)) {
      return 'Price TBA';
    }
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
      const prices = ticketSkus.map((s: any) => s.pricePerPerson).filter((p: number) => p > 0);
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
            <div className="flex gap-4">
              <div className="flex-1 h-10 bg-gray-200 rounded animate-pulse"></div>
              <div className="w-48 h-10 bg-gray-200 rounded animate-pulse"></div>
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
      
      {/* Header */}
      <section className="bg-gradient-to-br from-primary via-primary/80 to-secondary text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Discover Amazing <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">Experiences</span>
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
            From transformative retreats to adventure trips - find your next life-changing journey
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg"
              variant="outline"
              className="border-2 border-white text-white hover:bg-white hover:text-gray-800 bg-white/10 backdrop-blur-sm"
              onClick={() => {
                try {
                  console.log("🎯 Experiences Page - Navigating to participant profile setup");
                  setLocation('/participant-profile-setup');
                } catch (error) {
                  console.error("❌ Navigation error to participant profile:", error);
                  // Fallback to experiences page after brief delay
                  setTimeout(() => {
                    console.log("🔄 Fallback routing to experiences page");
                    setLocation('/experiences');
                  }, 1000);
                }
              }}
              data-testid="button-setup-profile"
            >
              Set Up Your Profile
            </Button>
            <Button 
              size="lg"
              className="bg-white text-primary hover:bg-gray-100"
              onClick={() => {
                try {
                  console.log("🎯 Experiences Page - Navigating to creator profile setup");
                  setLocation('/creator/profile-setup');
                } catch (error) {
                  console.error("❌ Navigation error to creator profile:", error);
                  // Fallback to experiences page after brief delay
                  setTimeout(() => {
                    console.log("🔄 Fallback routing to experiences page");
                    setLocation('/experiences');
                  }, 1000);
                }
              }}
              data-testid="button-become-creator"
            >
              Become a Creator
            </Button>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="bg-white border-b py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input
                placeholder="Search experiences..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Category Filter */}
            <div className="w-full md:w-64">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                {selectedCategory !== "all" && (
                  <span> in {categories.find(cat => cat.id === selectedCategory)?.title}</span>
                )}
              </div>
              
              {(searchQuery || selectedCategory !== "all") && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}
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
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Available Experiences</h2>
              <Badge className="bg-green-100 text-green-800 border-green-200">
                {filteredExperiences.length} experience{filteredExperiences.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredExperiences.map((experience) => (
                <Card key={experience.id} className="overflow-hidden hover:shadow-lg transition-shadow" data-testid={`card-experience-${experience.id}`}>
                  <div className="aspect-video relative overflow-hidden">
                    {experience.coverImageUrl ? (
                      <img 
                        src={normalizeImageUrl(experience.coverImageUrl) || ''} 
                        alt={experience.title}
                        className="w-full h-full object-cover"
                        data-testid={`img-experience-cover-${experience.id}`}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center mx-auto mb-2">
                            <Calendar className="h-8 w-8 text-primary" />
                          </div>
                          <p className="text-sm font-medium text-gray-600">Community Experience</p>
                        </div>
                      </div>
                    )}
                    <Badge 
                      variant="secondary" 
                      className={`absolute top-3 right-3 ${
                        (experience.status === 'approved' || experience.status === 'published') 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {(experience.status === 'approved' || experience.status === 'published') ? 'Verified' : 'Pending'}
                    </Badge>
                  </div>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-2">
                      <CardTitle className="text-lg font-semibold line-clamp-2">{experience.title}</CardTitle>
                      <div className="text-right ml-2">
                        {(() => {
                          const { price, hasRange } = getDisplayPrice(experience);
                          return (
                            <>
                              {hasRange && <div className="text-xs text-gray-500">From</div>}
                              <div className="text-xl font-bold text-primary" data-testid="text-price">{formatCurrency(price, experience.currency)}</div>
                              <div className="text-sm text-gray-500">per person</div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    
                    <p className="text-gray-600 text-sm mb-4 line-clamp-3">{experience.description}</p>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        {experience.location}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2" />
                        {formatDate(experience.startDate)} - {formatDate(experience.endDate)}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Users className="h-4 w-4 mr-2" />
                        {experience.participantCount || 0} / {experience.maxParticipants} participants
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Link href={`/experience/${experience.id}`} className="flex-1">
                        <Button className="w-full" variant="outline">
                          View Details
                        </Button>
                      </Link>
                      <Link href={`/checkout/${experience.id}`} className="flex-1">
                        <Button className="w-full btn-gradient">
                          Join Experience
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
              
              {searchQuery || selectedCategory !== "all" ? (
                <>
                  <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                    No experiences found
                    {searchQuery && ` for "${searchQuery}"`}
                    {selectedCategory !== "all" && ` in ${categories.find(cat => cat.id === selectedCategory)?.title}`}
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
                      onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}
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