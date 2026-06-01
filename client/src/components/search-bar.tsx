import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Calendar as CalendarIcon, AlertCircle, X } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

// Smart placeholder suggestions that rotate
const placeholderSuggestions = [
  "yoga retreat in Bali, meditation workshop, sound healing",
  "cooking class in Italy, wine tasting, cultural tours", 
  "hiking adventure in Patagonia, camping, wildlife photography",
  "digital nomad workation in Lisbon, coworking, networking",
  "music festival in Amsterdam, art galleries, canal tours",
  "surf camp in Costa Rica, beach volleyball, jungle zipline",
  "wellness retreat in Thailand, spa treatments, mindfulness",
  "photography workshop in Iceland, northern lights, hot springs",
  "create running and fitness event, marathon training, group runs"
];

/**
 * Enhanced Search Bar Component with Trip Detection
 * - Routes generic queries to the Explore View (experiences page)
 * - Routes trip-specific queries to AI Travel Planner
 * - Smart trip detection using keywords and patterns
 * - Includes comprehensive logging for routing confirmation
 * - Handles both search queries and date filters
 * - Provides user feedback on routing actions
 */
export default function SearchBar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [placeholderIndex] = useState(Math.floor(Math.random() * placeholderSuggestions.length));
  const [searchError, setSearchError] = useState<string>("");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Trip-specific keywords for routing detection
  const tripKeywords = [
    // Duration-based terms
    'trip', 'journey', 'vacation', 'holiday', 'getaway', 'weekend', 'week-long', 'day trip',
    '3-day', '4-day', '5-day', '7-day', '10-day', 'multi-day',
    
    // Travel-specific terms  
    'flight', 'flights', 'hotel', 'hotels', 'accommodation', 'stay', 'booking',
    'travel to', 'visit', 'explore', 'destination', 'itinerary',
    
    // Experience + location combinations
    'retreat in', 'workshop in', 'experience in', 'adventure in', 'tour of',
    'vacation in', 'holiday in', 'trip to', 'travel to',
    
    // Complete travel planning
    'plan my trip', 'travel plan', 'full trip', 'complete trip', 'travel package',
    'travel itinerary', 'trip planning', 'travel planning'
  ];

  const detectTripQuery = (query: string) => {
    const lowerQuery = query.toLowerCase();
    
    // Check for trip keywords
    const hasTripKeywords = tripKeywords.some(keyword => lowerQuery.includes(keyword));
    
    // Check for location patterns (experience + "in/to" + location)
    const locationPatterns = [
      /\b(retreat|workshop|experience|adventure|tour|vacation|holiday|trip)\s+(in|to|at)\s+[a-zA-Z]+/i,
      /\b[a-zA-Z]+\s+(retreat|workshop|experience|adventure|tour|vacation|holiday|trip)/i,
      /\b(visit|explore|travel\s+to)\s+[a-zA-Z]+/i
    ];
    
    const hasLocationPattern = locationPatterns.some(pattern => pattern.test(lowerQuery));
    
    // Check for duration indicators
    const durationPatterns = [
      /\b\d+[\s-]?(day|week|night)s?\b/i,
      /\b(weekend|week|month)\b/i
    ];
    
    const hasDurationPattern = durationPatterns.some(pattern => pattern.test(lowerQuery));
    
    return hasTripKeywords || hasLocationPattern || hasDurationPattern;
  };

  const handleSearch = () => {
    // Clear any previous errors
    setSearchError("");
    
    // Validation checks
    if (searchQuery.trim().length > 0 && searchQuery.trim().length < 2) {
      setSearchError("Search must be at least 2 characters long");
      toast({
        title: "Search too short",
        description: "Please enter at least 2 characters to search",
        variant: "destructive",
      });
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setSearchError("End date must be after start date");
      toast({
        title: "Invalid date range",
        description: "Please ensure your end date is after your start date",
        variant: "destructive",
      });
      return;
    }

    // Validate dates are not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (startDate && startDate < today) {
      setSearchError("Start date cannot be in the past");
      toast({
        title: "Invalid start date",
        description: "Please select a future date for your experience",
        variant: "destructive",
      });
      return;
    }

    try {
      const query = searchQuery.trim();
      
      // Detect if this is a trip-specific query
      const isTripQuery = query && detectTripQuery(query);
      const hasDateFilter = startDate || endDate;
      
      // Build URL parameters
      const params = new URLSearchParams();
      if (query) {
        params.set('search', query);
      }
      if (startDate) {
        params.set('startDate', format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        params.set('endDate', format(endDate, 'yyyy-MM-dd'));
      }
      
      // Determine routing destination
      let targetRoute = '/experiences'; // Default to Explore View
      let routingType = 'generic';
      
      if (isTripQuery) {
        targetRoute = '/ai-travel';
        routingType = 'trip-specific';
        
        // Add additional context for AI Travel Planner
        if (query) {
          params.set('query', query);
        }
      }
      
      const queryString = params.toString();
      const targetUrl = `${targetRoute}${queryString ? `?${queryString}` : ''}`;
      
      // Enhanced logging for trip detection and routing
      console.log(`🔍 Homepage Search Analysis:`, {
        query,
        isTripQuery,
        routingType,
        targetRoute,
        hasDateFilter,
        queryString
      });
      
      if (isTripQuery) {
        console.log(`✈️ Trip-specific query detected - routing to AI Travel Planner`);
        console.log(`📍 Trip routing details:`, { 
          targetUrl,
          searchQuery: query,
          startDate: startDate ? format(startDate, 'yyyy-MM-dd') : null,
          endDate: endDate ? format(endDate, 'yyyy-MM-dd') : null
        });
      } else {
        console.log(`🎯 Generic query - routing to Explore View`);
        console.log(`📍 Explore routing details:`, { 
          targetUrl,
          searchQuery: query,
          startDate: startDate ? format(startDate, 'yyyy-MM-dd') : null,
          endDate: endDate ? format(endDate, 'yyyy-MM-dd') : null
        });
      }
      
      // Navigate to appropriate destination
      navigate(targetUrl);
      
      // Provide user feedback based on routing
      if (isTripQuery) {
        const feedbackMessage = `Planning your trip: "${query}"${startDate ? ` from ${format(startDate, 'MMM dd')}` : ''}`;
        toast({
          title: "Routing to AI Travel Planner",
          description: feedbackMessage,
        });
        console.log(`✅ Trip routing confirmed: "${feedbackMessage}"`);
      } else if (query || startDate || endDate) {
        const feedbackMessage = query 
          ? `Exploring "${query}"${startDate ? ` from ${format(startDate, 'MMM dd')}` : ''}`
          : `Browsing experiences${startDate ? ` from ${format(startDate, 'MMM dd')}` : ''}`;
          
        toast({
          title: "Routing to Explore View",
          description: feedbackMessage,
        });
        console.log(`✅ Explore routing confirmed: "${feedbackMessage}"`);
      } else {
        toast({
          title: "Browse Experiences",
          description: "Showing all available experiences",
        });
      }
      
    } catch (error) {
      setSearchError("Failed to perform search. Please try again.");
      toast({
        title: "Search failed",
        description: "There was a problem with your search. Please try again.",
        variant: "destructive",
      });
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setStartDate(undefined);
    setEndDate(undefined);
    setSearchError("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="search-glass rounded-2xl p-2 max-w-4xl mx-auto shadow-2xl">
      <div className="flex flex-col gap-3">
        {/* Search Error Display */}
        {searchError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{searchError}</span>
            <button 
              onClick={() => setSearchError("")}
              className="text-red-500 hover:text-red-700"
              data-testid="button-dismiss-error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        
        {/* Main Search Input with Smart Suggestions */}
        <div className="flex-1 relative">
          <Input
            type="text"
            placeholder={`e.g., ${placeholderSuggestions[placeholderIndex]}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className={`border-gray-200 focus:ring-primary text-gray-800 h-12 text-base placeholder:text-gray-400 ${
              searchError ? 'border-red-300 focus:border-red-500' : ''
            }`}
            data-testid="input-search-query"
          />
          
          {/* Clear search button */}
          {(searchQuery || startDate || endDate) && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        {/* Simplified Date Filters Row */}
        <div className="flex flex-col lg:flex-row gap-2 items-center">
          {/* Start Date */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full lg:w-[140px] justify-start text-left font-normal border-gray-200 focus:ring-primary text-gray-800 h-10"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "MMM dd") : "Start Date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                disabled={(date) =>
                  date < new Date() || (endDate ? date > endDate : false)
                }
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* End Date (optional for multi-day events) */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full lg:w-[140px] justify-start text-left font-normal border-gray-200 focus:ring-primary text-gray-800 h-10"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "MMM dd") : "End Date (optional)"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                disabled={(date) =>
                  date < new Date() || (startDate ? date < startDate : false)
                }
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Search Button */}
          <Button 
            onClick={handleSearch} 
            className="w-full lg:w-[120px] btn-gradient h-10"
            data-testid="button-search"
          >
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
        </div>
      </div>
    </div>
  );
}