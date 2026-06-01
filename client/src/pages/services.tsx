import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Clock, Users, DollarSign, Star, Filter } from "lucide-react";
import type { ServiceProvider } from "@shared/schema";
import Navigation from "@/components/navigation";

// Service categories for filtering
const serviceCategories = [
  { value: "all", label: "All Services" },
  { value: "accommodation", label: "Accommodation" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "transportation", label: "Transportation" },
  { value: "equipment_rental", label: "Equipment Rental" },
  { value: "wellness_spa", label: "Wellness & Spa" },
  { value: "adventure_sports", label: "Adventure Sports" },
  { value: "guided_tours", label: "Guided Tours" },
  { value: "entertainment", label: "Entertainment" },
  { value: "photography", label: "Photography" },
  { value: "event_planning", label: "Event Planning" },
  { value: "fitness_training", label: "Fitness Training" },
  { value: "creative_workshops", label: "Creative Workshops" },
  { value: "technical_support", label: "Technical Support" },
  { value: "language_translation", label: "Language Translation" },
  { value: "childcare", label: "Childcare" },
  { value: "medical_support", label: "Medical Support" }
];

// Price models for filtering
const priceModels = [
  { value: "all", label: "All Price Models" },
  { value: "per_hour", label: "Per Hour" },
  { value: "per_day", label: "Per Day" },
  { value: "per_person", label: "Per Person" },
  { value: "per_session", label: "Per Session" },
  { value: "flat_rate", label: "Flat Rate" }
];

export default function ServicesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedPriceModel, setSelectedPriceModel] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: services = [], isLoading, error } = useQuery<ServiceProvider[]>({
    queryKey: ["/api/service-providers"],
  });

  // Filter services based on search and filters
  const filteredServices = services.filter((service) => {
    const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         service.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === "all" || service.serviceCategory === selectedCategory;
    const matchesPriceModel = selectedPriceModel === "all" || service.priceModel === selectedPriceModel;
    
    return matchesSearch && matchesCategory && matchesPriceModel && service.approved;
  });

  const formatPrice = (price: number | null, priceModel: string, currency: string = 'EUR') => {
    if (!price) return "Contact for pricing";
    
    const formattedPrice = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(Number(price));
    
    switch (priceModel) {
      case "per_hour": return `${formattedPrice}/hour`;
      case "per_day": return `${formattedPrice}/day`;
      case "per_person": return `${formattedPrice}/person`;
      case "per_session": return `${formattedPrice}/session`;
      case "per_event": return `${formattedPrice}/event`;
      case "flat_rate": return formattedPrice;
      default: return formattedPrice;
    }
  };

  const getCategoryLabel = (category: string) => {
    return serviceCategories.find(cat => cat.value === category)?.label || category;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Unable to Load Services</h2>
          <p className="text-gray-600 mb-6">We're having trouble loading the services. Please try again later.</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Services & Providers</h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Discover professional services to enhance your experiences
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Search services, providers, or descriptions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="md:w-auto w-full"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {showFilters && (
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Service Category</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceCategories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="priceModel">Price Model</Label>
                  <Select value={selectedPriceModel} onValueChange={setSelectedPriceModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select price model" />
                    </SelectTrigger>
                    <SelectContent>
                      {priceModels.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Results Summary */}
      <div className="mb-6">
        <p className="text-gray-600 dark:text-gray-300">
          {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Services Grid */}
      {filteredServices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-xl font-semibold mb-2">No services found</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Try adjusting your search terms or filters to find what you're looking for.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => (
            <Card key={service.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              {service.profileImageUrl && (
                <div className="aspect-video w-full overflow-hidden">
                  <img 
                    src={service.profileImageUrl} 
                    alt={service.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{service.name}</CardTitle>
                  <Badge variant="secondary">
                    {getCategoryLabel(service.serviceCategory)}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600">
                  Service Provider
                </p>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <p className="text-gray-600 dark:text-gray-300 text-sm line-clamp-3">
                  {service.description}
                </p>
                
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                    <DollarSign className="w-4 h-4 mr-2" />
                    {formatPrice(service.price ? Number(service.price) : null, service.priceModel || 'per_hour')}
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                    <MapPin className="w-4 h-4 mr-2" />
                    {service.location}
                  </div>
                  
                  {service.serviceType && service.serviceType.length > 0 && (
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                      <Users className="w-4 h-4 mr-2" />
                      Specializes in: {service.serviceType.join(', ')}
                    </div>
                  )}
                </div>
                
                {service.tags && service.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {service.tags.slice(0, 3).map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {service.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{service.tags.length - 3} more
                      </Badge>
                    )}
                  </div>
                )}
                
                <div className="pt-2">
                  <Button className="w-full">
                    Contact Provider
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}