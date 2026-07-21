import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, MapPin, Users, Plane, Hotel, Car, Utensils, Camera, Sparkles, Clock, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import Navigation from '@/components/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';
import BrandLogo from '@/components/BrandLogo';

interface TravelPlan {
  id: string;
  destination: string;
  dates: string;
  travelers: number;
  budget: string;
  travelStyle: string;
  itinerary: Array<{
    day: number;
    activities: string[];
    accommodation: string;
    transportation: string;
    meals: string[];
  }>;
  flights: Array<{
    airline: string;
    departure: string;
    arrival: string;
    price: number;
  }>;
  hotels: Array<{
    name: string;
    rating: number;
    price: number;
    location: string;
  }>;
  // Optional properties for extended functionality
  platformExperiences?: Array<{
    id: string;
    title: string;
    description: string;
    price: number;
    category: string;
  }>;
  externalExperiences?: Array<{
    id: string;
    title: string;
    description: string;
    price: number;
    provider: string;
  }>;
  completeTripValue?: {
    totalCost: number;
    savings: number;
    breakdown: {
      flights: number;
      hotels: number;
      experiences: number;
    };
  };
}

export default function AITravel() {
  const [, setLocation] = useLocation();
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travelers, setTravelers] = useState('2');
  const [budget, setBudget] = useState('');
  const [incomingQuery, setIncomingQuery] = useState('');
  const [isApiActive] = useState(false); // Set to true when API is ready
  
  // Handle URL parameters from homepage search routing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    const searchParam = params.get('search') || params.get('query');
    const destinationParam = params.get('destination');
    const startDateParam = params.get('startDate');
    const endDateParam = params.get('endDate');
    
    // Enhanced logging for trip routing confirmation
    console.log("✈️ AI Travel Planner - Route accessed with parameters:", {
      search: searchParam,
      destination: destinationParam,
      startDate: startDateParam,
      endDate: endDateParam,
      source: searchParam ? 'Homepage Search Bar (Trip Query)' : 'Direct Navigation'
    });
    
    if (searchParam) {
      console.log(`✅ Trip routing confirmed - Query: "${searchParam}" successfully routed to AI Travel Planner`);
      setIncomingQuery(searchParam);
    }
    
    if (destinationParam) {
      console.log(`📍 Destination extracted from query: ${destinationParam}`);
      setDestination(destinationParam);
    }
    
    if (startDateParam) {
      setStartDate(startDateParam);
    }
    
    if (endDateParam) {
      setEndDate(endDateParam);
    }
    
    // Summary routing confirmation log
    const routingSource = searchParam ? 'Homepage Search Bar (Trip-Specific)' : 'Direct page access';
    console.log(`🌟 AI Travel Planner successfully loaded via ${routingSource}`);
  }, []);
  
  const [travelStyle, setTravelStyle] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [travelPlan, setTravelPlan] = useState<TravelPlan | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [isPlaceholderMode, setIsPlaceholderMode] = useState(!isApiActive);
  const [apiStatus, setApiStatus] = useState<any>(null);
  const breadcrumbs = useBreadcrumbs();
  
  const { toast } = useToast();

  // Check API health status (separate from URL params handling)
  useEffect(() => {
    // Check API health status first
    const checkApiHealth = async () => {
      try {
        const response = await apiRequest('GET', '/api/ai-travel/health');
        const healthData = await response.json();
        setApiStatus(healthData);
        
        // Set placeholder mode based on API status
        setIsPlaceholderMode(healthData.status === 'development' || healthData.status === 'unavailable');
        
        console.log("🏥 AI Travel API Status:", healthData);
      } catch (error) {
        console.error("Failed to check API health:", error);
        setIsPlaceholderMode(true);
        setApiStatus({ status: 'unavailable', message: 'Unable to connect to travel services' });
      }
    };
    
    checkApiHealth();
  }, []);

  const generatePlanMutation = useMutation({
    mutationFn: async (planData: any) => {
      console.log("🚀 Generating travel plan with data:", planData);
      const response = await apiRequest('POST', '/api/ai-travel/generate-plan', planData);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.isPlaceholder) {
        setIsPlaceholderMode(true);
        const statusMessage = data.status === 'development' 
          ? "AI Travel Planner is in development. Explore our platform experiences while we build this feature!"
          : "Travel planning is temporarily unavailable. Check out these great experiences instead!";
        
        toast({
          title: "Feature Coming Soon",
          description: statusMessage,
        });
      } else {
        setTravelPlan(data);
        setIsPlaceholderMode(false);
        toast({
          title: "Travel Plan Generated!",
          description: "Your personalized itinerary is ready.",
        });
      }
    },
    onError: (error) => {
      console.error("Travel plan generation error:", error);
      setIsPlaceholderMode(true);
      toast({
        title: "Connection Error",
        description: "Unable to connect to travel planning services. Try again later or browse our experiences.",
        variant: "destructive",
      });
    },
  });

  const handleGeneratePlan = () => {
    if (!destination || !startDate || !endDate || !budget || !travelStyle) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    generatePlanMutation.mutate({
      destination,
      startDate,
      endDate,
      travelers: parseInt(travelers),
      budget,
      travelStyle,
      interests,
    });
  };

  const toggleInterest = (interest: string) => {
    setInterests(prev => 
      prev.includes(interest) 
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const interestOptions = [
    { icon: Camera, label: 'Photography' },
    { icon: Utensils, label: 'Food & Dining' },
    { icon: Users, label: 'Nightlife' },
    { icon: MapPin, label: 'Historical Sites' },
    { icon: Plane, label: 'Adventure Sports' },
    { icon: Hotel, label: 'Relaxation' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <Navigation />
      
      {/* Breadcrumb Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <Breadcrumb items={breadcrumbs} />
      </div>
      
      {/* Hero Section */}
      <div className="relative bg-gradient-primary py-20 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Sparkles className="h-8 w-8 animate-pulse" />
            <h1 className="text-4xl md:text-6xl font-bold">
              AI Travel Planner
            </h1>
          </div>
          <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto opacity-90">
            Tell us where you want to go, and our AI will create a personalized itinerary 
            with flights, hotels, and experiences tailored just for you.
          </p>
          
          {/* Query Context Display */}
          {userQuery && (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 max-w-2xl mx-auto mb-6">
              <div className="flex items-center gap-2 text-sm opacity-80">
                <Clock className="h-4 w-4" />
                <span>Based on your search:</span>
              </div>
              <p className="text-lg font-medium mt-1">"{userQuery}"</p>
            </div>
          )}
          
          {/* Dynamic Status Notice */}
          {apiStatus && (
            <Alert className={`max-w-2xl mx-auto ${
              apiStatus.status === 'development' 
                ? 'bg-blue-50 border-blue-200' 
                : apiStatus.status === 'unavailable' 
                ? 'bg-red-50 border-red-200' 
                : 'bg-amber-50 border-amber-200'
            }`}>
              <AlertCircle className={`h-4 w-4 ${
                apiStatus.status === 'development' 
                  ? 'text-blue-600' 
                  : apiStatus.status === 'unavailable' 
                  ? 'text-red-600' 
                  : 'text-amber-600'
              }`} />
              <AlertDescription className={
                apiStatus.status === 'development' 
                  ? 'text-blue-800' 
                  : apiStatus.status === 'unavailable' 
                  ? 'text-red-800' 
                  : 'text-amber-800'
              }>
                <strong>
                  {apiStatus.status === 'development' && 'In Development'}
                  {apiStatus.status === 'unavailable' && 'Service Unavailable'}
                  {apiStatus.status === 'error_fallback' && 'Temporary Issue'}
                </strong>{' '}
                {apiStatus.message} {' '}
                <button 
                  onClick={() => setLocation('/experiences')}
                  className="underline hover:no-underline cursor-pointer"
                >
                  Browse experiences instead
                </button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Planning Form */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl text-primary">Plan Your Perfect Trip</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Destination */}
              <div>
                <label className="block text-sm font-medium mb-2">Where do you want to go?</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <Input
                    placeholder="Enter destination (e.g., Tokyo, Japan)"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">End Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              {/* Travelers */}
              <div>
                <label className="block text-sm font-medium mb-2">Number of Travelers</label>
                <Select value={travelers} onValueChange={setTravelers}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select travelers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Traveler</SelectItem>
                    <SelectItem value="2">2 Travelers</SelectItem>
                    <SelectItem value="3">3 Travelers</SelectItem>
                    <SelectItem value="4">4 Travelers</SelectItem>
                    <SelectItem value="5">5+ Travelers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-sm font-medium mb-2">Budget Range</label>
                <Select value={budget} onValueChange={setBudget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select budget range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="budget">Budget ($50-100/day)</SelectItem>
                    <SelectItem value="mid-range">Mid-range ($100-300/day)</SelectItem>
                    <SelectItem value="luxury">Luxury ($300+/day)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Travel Style */}
              <div>
                <label className="block text-sm font-medium mb-2">Travel Style</label>
                <Select value={travelStyle} onValueChange={setTravelStyle}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select travel style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adventure">Adventure & Exploration</SelectItem>
                    <SelectItem value="relaxation">Relaxation & Wellness</SelectItem>
                    <SelectItem value="cultural">Cultural & Historical</SelectItem>
                    <SelectItem value="foodie">Food & Culinary</SelectItem>
                    <SelectItem value="family">Family-Friendly</SelectItem>
                    <SelectItem value="business">Business & Work</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Interests */}
              <div>
                <label className="block text-sm font-medium mb-3">What interests you? (Optional)</label>
                <div className="grid grid-cols-2 gap-3">
                  {interestOptions.map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      onClick={() => toggleInterest(label)}
                      className={`flex items-center space-x-2 p-3 rounded-lg border transition-all ${
                        interests.includes(label)
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white hover:bg-gray-50 border-gray-200'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button 
                onClick={handleGeneratePlan}
                disabled={generatePlanMutation.isPending || (apiStatus?.status === 'unavailable')}
                className="w-full btn-gradient text-lg py-6"
                data-testid="button-generate-plan"
              >
                {generatePlanMutation.isPending ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Generating Plan...
                  </>
                ) : apiStatus?.status === 'unavailable' ? (
                  'Service Unavailable'
                ) : apiStatus?.status === 'development' ? (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Try Preview Mode
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate My Travel Plan
                  </>
                )}
              </Button>
              
              {(isPlaceholderMode || apiStatus?.status === 'development') && (
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-3">
                    {apiStatus?.status === 'development' 
                      ? 'While we build this feature, check out our hand-curated experiences:'
                      : 'Service temporarily unavailable. Explore our platform experiences:'
                    }
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setLocation('/experiences?category=retreats')}
                      data-testid="button-browse-retreats"
                    >
                      Retreats
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setLocation('/experiences?category=workations')}
                      data-testid="button-browse-workations"
                    >
                      Workations
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setLocation('/experiences')}
                      data-testid="button-browse-all"
                    >
                      All Experiences
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          <div className="space-y-6">
            {/* Coming Soon Placeholder when API is not active */}
            {!isApiActive && !generatePlanMutation.isPending && !travelPlan && (
              <Card className="shadow-lg border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <Sparkles className="h-16 w-16 mx-auto mb-4 text-amber-600" />
                    <h3 className="text-2xl font-bold mb-4 text-amber-800">Coming Soon: AI Travel Planner</h3>
                    <p className="text-amber-700 mb-6 max-w-md mx-auto">
                      We're building an incredible AI-powered travel planner that will create personalized 
                      itineraries with flights, hotels, and experiences tailored just for you.
                    </p>
                    
                    {incomingQuery && (
                      <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 max-w-lg mx-auto mb-6">
                        <div className="flex items-center gap-2 text-sm text-amber-600 mb-1">
                          <Clock className="h-4 w-4" />
                          <span>Your search will be supported:</span>
                        </div>
                        <p className="font-semibold text-amber-800">"{incomingQuery}"</p>
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto text-sm">
                        <div className="flex items-center gap-2 text-amber-700">
                          <Plane className="h-4 w-4" />
                          <span>Flight Integration</span>
                        </div>
                        <div className="flex items-center gap-2 text-amber-700">
                          <Hotel className="h-4 w-4" />
                          <span>Hotel Bookings</span>
                        </div>
                        <div className="flex items-center gap-2 text-amber-700">
                          <Users className="h-4 w-4" />
                          <span>Experience Curation</span>
                        </div>
                      </div>
                      
                      <div className="pt-4">
                        <p className="text-sm text-amber-600 mb-4">
                          Meanwhile, explore our hand-curated experiences:
                        </p>
                        <div className="flex gap-2 justify-center flex-wrap">
                          <Button 
                            variant="outline" 
                            className="border-amber-300 text-amber-700 hover:bg-amber-100"
                            onClick={() => setLocation('/experiences?category=retreats')}
                            data-testid="button-browse-retreats-placeholder"
                          >
                            Retreats
                          </Button>
                          <Button 
                            variant="outline" 
                            className="border-amber-300 text-amber-700 hover:bg-amber-100"
                            onClick={() => setLocation('/experiences?category=workations')}
                            data-testid="button-browse-workations-placeholder"
                          >
                            Workations
                          </Button>
                          <Button 
                            variant="outline" 
                            className="border-amber-300 text-amber-700 hover:bg-amber-100"
                            onClick={() => setLocation('/experiences?category=adventure-trips')}
                            data-testid="button-browse-adventures-placeholder"
                          >
                            Adventures
                          </Button>
                          <Button 
                            className="btn-gradient"
                            onClick={() => setLocation('/experiences')}
                            data-testid="button-browse-all-placeholder"
                          >
                            Browse All Experiences
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {generatePlanMutation.isPending && (
              <Card className="shadow-lg">
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                    <h3 className="text-lg font-semibold mb-2">Creating Your Perfect Trip</h3>
                    <p className="text-gray-600">Our AI is analyzing flights, hotels, and experiences...</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {travelPlan && (
              <div className="space-y-6">
                {/* Trip Overview */}
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-xl text-primary">Your Trip to {travelPlan.destination}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Dates:</span> {travelPlan.dates}
                      </div>
                      <div>
                        <span className="font-medium">Travelers:</span> {travelPlan.travelers}
                      </div>
                      <div>
                        <span className="font-medium">Budget:</span> {travelPlan.budget}
                      </div>
                      <div>
                        <span className="font-medium">Style:</span> {travelPlan.travelStyle}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Flights */}
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Plane className="h-5 w-5" />
                      <span>Recommended Flights</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {travelPlan.flights.map((flight, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className="font-medium">{flight.airline}</h4>
                              <p className="text-sm text-gray-600">{flight.departure} → {flight.arrival}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-primary">${flight.price}</p>
                              <p className="text-xs text-gray-500">Via Amadeus API</p>
                              <Button size="sm" className="mt-1">Book Now</Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Hotels */}
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Hotel className="h-5 w-5" />
                      <span>Recommended Hotels</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {travelPlan.hotels.map((hotel, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className="font-medium">{hotel.name}</h4>
                              <p className="text-sm text-gray-600">{hotel.location}</p>
                              <div className="flex items-center mt-1">
                                {Array.from({ length: hotel.rating }).map((_, i) => (
                                  <span key={i} className="text-yellow-400">★</span>
                                ))}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-primary">${hotel.price}/night</p>
                              <p className="text-xs text-gray-500">Via Amadeus API</p>
                              <Button size="sm" className="mt-1">Book Now</Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Platform Experiences - Show First */}
                {travelPlan.platformExperiences && travelPlan.platformExperiences.length > 0 && (
                  <Card className="shadow-lg border-primary/20">
                    <CardHeader>
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <BrandLogo className="h-12 w-auto rounded-md" />
                        <span>Experiences in {travelPlan.destination}</span>
                        <Badge variant="secondary">Platform Partners</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {travelPlan.platformExperiences.map((experience: any, index: number) => (
                          <div key={index} className="border rounded-lg p-4 border-primary/10 bg-gradient-to-r from-blue-50 to-purple-50">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-semibold text-primary">{experience.title}</h4>
                                <p className="text-sm text-gray-600 mb-2">{experience.location}</p>
                                <p className="text-sm mb-3">{experience.description}</p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{experience.category}</Badge>
                                  <Badge variant="secondary">Verified Creator</Badge>
                                </div>
                              </div>
                              <div className="text-right ml-4">
                                <p className="font-bold text-primary text-lg">{experience.price}</p>
                                <Button size="sm" className="mt-2">View Details</Button>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="text-center pt-2">
                          <Button variant="outline" onClick={() => setLocation('/experiences')}>
                            Browse All Platform Experiences
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* External Experiences - Show when platform doesn't have enough */}
                {travelPlan.externalExperiences && travelPlan.externalExperiences.length > 0 && (
                  <Card className="shadow-lg border-gray-200">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <MapPin className="h-5 w-5 text-gray-600" />
                        <span>Additional Experiences in {travelPlan.destination}</span>
                        <Badge variant="outline">Third-Party Partners</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {travelPlan.externalExperiences.map((experience: any, index: number) => (
                          <div key={index} className="border rounded-lg p-4 border-gray-200 bg-gray-50">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-semibold text-gray-900">{experience.title}</h4>
                                <p className="text-sm text-gray-600 mb-2">{experience.provider} • {experience.duration}</p>
                                <p className="text-sm mb-3">{experience.description}</p>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center">
                                    {Array.from({ length: Math.floor(experience.rating) }).map((_, i) => (
                                      <span key={i} className="text-yellow-400 text-sm">★</span>
                                    ))}
                                    <span className="text-sm text-gray-600 ml-1">{experience.rating}</span>
                                  </div>
                                  <Badge variant="outline" className="text-xs">GetYourGuide</Badge>
                                </div>
                              </div>
                              <div className="text-right ml-4">
                                <p className="font-bold text-gray-900 text-lg">{experience.price}</p>
                                <Button size="sm" variant="outline" className="mt-2">View on Partner Site</Button>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="text-center pt-2">
                          <p className="text-xs text-gray-500">
                            Showing additional experiences from our trusted partners when platform options are limited
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Complete Trip Value */}
                {travelPlan.completeTripValue && (
                  <Card className="shadow-lg border-green-200 bg-green-50">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <h3 className="font-semibold text-green-800 mb-2">Complete Travel Solution</h3>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-2xl font-bold text-green-700">{travelPlan.completeTripValue.platformExperiences}</div>
                            <div className="text-green-600">Platform Experiences</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-green-700">{travelPlan.completeTripValue.externalExperiences}</div>
                            <div className="text-green-600">Partner Experiences</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-green-700">{travelPlan.completeTripValue.totalOptions}</div>
                            <div className="text-green-600">Total Options</div>
                          </div>
                        </div>
                        <p className="text-xs text-green-600 mt-3">
                          ✓ Platform-first approach ✓ Complete customer journey ✓ Flight integration ready
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Itinerary */}
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <MapPin className="h-5 w-5" />
                      <span>Day-by-Day Itinerary</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {travelPlan.itinerary.map((day, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <h4 className="font-semibold text-primary mb-3">Day {day.day}</h4>
                          <div className="space-y-2">
                            <div>
                              <span className="font-medium">Activities:</span>
                              <ul className="list-disc list-inside ml-4 text-sm">
                                {day.activities.map((activity, i) => (
                                  <li key={i}>{activity}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium">Accommodation:</span> {day.accommodation}
                            </div>
                            <div className="text-sm">
                              <span className="font-medium">Transportation:</span> {day.transportation}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* API Integration Status */}
                <Card className="shadow-lg border-orange-200 bg-orange-50">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2 text-orange-700">
                      <Plane className="h-5 w-5" />
                      <span>Real Travel Data Integration</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span>✈️ Flight Search (Amadeus API)</span>
                        <Badge variant="outline" className="text-orange-600 border-orange-600">API Ready</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>🏨 Hotel Search (Amadeus API)</span>
                        <Badge variant="outline" className="text-orange-600 border-orange-600">API Ready</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>🎯 Activities (GetYourGuide API)</span>
                        <Badge variant="outline" className="text-orange-600 border-orange-600">API Ready</Badge>
                      </div>
                      <p className="text-xs text-gray-600 pt-2">
                        Connect your API keys to get real-time flight prices, hotel availability, and local experiences. 
                        Platform experiences are prioritized and shown first.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
