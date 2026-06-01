import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { normalizeImageUrl } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, 
  Users, 
  Calendar, 
  Building,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Trash2,
  UserCheck,
  UserX,
  Search,
  Layout,
  ChevronDown,
  ChevronUp,
  Image,
  DollarSign,
  Bed,
  UserCog,
  Target,
  ListOrdered
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import { AdminVenueCalendar } from "@/components/AdminVenueCalendar";
import type { Venue, Experience, ServiceProvider } from "@shared/schema";

interface VenueWithOwner extends Venue {
  ownerName: string | null;
  ownerEmail: string | null;
}

// Helper to format currency with proper symbol
// DATA CONTRACT: Currency must come from experience.currency - never default to USD
function formatCurrency(amount: number | string | null | undefined, currency?: string): string {
  if (amount === null || amount === undefined) return 'N/A';
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numAmount)) return 'N/A';
  if (!currency) {
    console.warn('[DataContract] Currency missing - using experience.currency is required');
  }
  const currencyCode = (currency || 'EUR').toUpperCase(); // Default EUR for existing data migration
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
  };
  const symbol = symbols[currencyCode] || currencyCode + ' ';
  return `${symbol}${numAmount.toFixed(2)}`;
}

export default function AdminDashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [, setLocation] = useLocation();
  const [expandedExperiences, setExpandedExperiences] = useState<Set<string>>(new Set());

  const toggleExperienceDetails = (id: string) => {
    setExpandedExperiences(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Redirect to login if not authenticated or not admin
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.email !== "timtheeuwsen@gmail.com")) {
      toast({
        title: "Unauthorized",
        description: "You don't have admin access.",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/");
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, user, toast]);

  // All experiences query (for full visibility)
  const { data: allExperiences = [], isLoading: experiencesLoading } = useQuery<Experience[]>({
    queryKey: ["/api/admin/experiences"],
    enabled: isAuthenticated && user?.email === "timtheeuwsen@gmail.com",
    retry: false,
  });

  // Experience status filter state - PHASE 7 FIX: Default to "all" for full visibility
  const [experienceStatusFilter, setExperienceStatusFilter] = useState<string>("all");

  // Community applications query
  const { data: communityApplications = [], isLoading: applicationsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/community-applications"],
    enabled: isAuthenticated && user?.email === "timtheeuwsen@gmail.com",
    retry: false,
  });

  // All venues query (not just pending)
  const { data: allVenues = [], isLoading: venuesLoading } = useQuery<VenueWithOwner[]>({
    queryKey: ["/api/admin/venues"],
    enabled: isAuthenticated && user?.email === "timtheeuwsen@gmail.com",
    retry: false,
  });

  // Venue status filter state
  const [venueStatusFilter, setVenueStatusFilter] = useState<string>("all");

  // Pending services query
  const { data: pendingServices = [], isLoading: servicesLoading} = useQuery<ServiceProvider[]>({
    queryKey: ["/api/admin/services"],
    enabled: isAuthenticated && user?.email === "timtheeuwsen@gmail.com",
    retry: false,
  });

  // Platform stats query
  const { data: stats = {}, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/stats"],
    enabled: isAuthenticated && user?.email === "timtheeuwsen@gmail.com",
    retry: false,
  });

  // Approve/Reject Experience
  const updateExperienceStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      return await apiRequest("PATCH", `/api/admin/experiences/${id}`, { status, reviewNotes: notes });
    },
    onSuccess: async (_data, variables) => {
      // Comprehensive cache invalidation for experience status change
      const invalidationPromises = [
        // All experiences lists (use new endpoint)
        queryClient.invalidateQueries({ queryKey: ["/api/admin/experiences"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/experiences"] }),
        
        // Experience-specific queries
        queryClient.invalidateQueries({ queryKey: ['event', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['experience', variables.id] }),
        
        // Experience-related data
        queryClient.invalidateQueries({ queryKey: ['rooms', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['pricing', variables.id] }),
        
        // Creator's experiences list
        queryClient.invalidateQueries({ queryKey: ['/api/my-experiences'] }),
      ];
      
      await Promise.all(invalidationPromises);
      
      setReviewNotes("");
      toast({
        title: "Experience Updated",
        description: "Experience status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update experience status.",
        variant: "destructive",
      });
    },
  });

  // Approve/Reject Community Application
  const updateApplicationStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      return await apiRequest("PATCH", `/api/admin/community-applications/${id}`, { status, reviewNotes: notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/community-applications"] });
      setReviewNotes("");
      toast({
        title: "Application Updated",
        description: "Community application has been reviewed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update application status.",
        variant: "destructive",
      });
    },
  });

  // Approve/Reject Venue
  const updateVenueStatus = useMutation({
    mutationFn: async ({ id, status, notes, slug }: { id: string; status: string; notes?: string; slug?: string }) => {
      return await apiRequest("PATCH", `/api/admin/venues/${id}`, { status, reviewNotes: notes });
    },
    onSuccess: async (_data, variables) => {
      // Comprehensive cache invalidation for venue status change
      const invalidationPromises = [
        // All venues lists
        queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/venues"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/user/venues"] }),
        
        // Venue-specific queries
        queryClient.invalidateQueries({ queryKey: ['venue', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['venue', variables.slug] }),
      ];
      
      // Invalidate public venue page by slug (status change affects visibility)
      if (variables.slug) {
        invalidationPromises.push(
          queryClient.invalidateQueries({ queryKey: [`/api/v/${variables.slug}`] })
        );
      }
      
      await Promise.all(invalidationPromises);
      
      setReviewNotes("");
      toast({
        title: "Venue Updated",
        description: "Venue status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update venue status.",
        variant: "destructive",
      });
    },
  });

  // Delete Venue
  const deleteVenue = useMutation({
    mutationFn: async ({ id, slug }: { id: string; slug?: string }) => {
      return await apiRequest("DELETE", `/api/admin/venues/${id}`);
    },
    onSuccess: async (_data, variables) => {
      // Comprehensive cache invalidation for venue deletion
      const invalidationPromises = [
        // All venues lists
        queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/venues"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/user/venues"] }),
        
        // Venue-specific queries
        queryClient.invalidateQueries({ queryKey: ['venue', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['venue', variables.slug] }),
      ];
      
      // Invalidate public venue page
      if (variables.slug) {
        invalidationPromises.push(
          queryClient.invalidateQueries({ queryKey: [`/api/v/${variables.slug}`] })
        );
      }
      
      await Promise.all(invalidationPromises);
      
      toast({
        title: "Venue Deleted",
        description: "Venue has been permanently deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete venue.",
        variant: "destructive",
      });
    },
  });

  // Update Venue Display Preferences
  const updateVenueDisplayPrefs = useMutation({
    mutationFn: async ({ id, servicesPlacement, slug }: { id: string; servicesPlacement: "sidebar" | "inline"; slug?: string }) => {
      return await apiRequest("PATCH", `/api/admin/venues/${id}/display-prefs`, { 
        displayPrefs: { servicesPlacement } 
      });
    },
    onSuccess: async (_data, variables) => {
      // Invalidate all venue-related queries for immediate UI update
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/venues"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/venues"] });
      
      // Invalidate individual venue query by slug for public page cache
      if (variables.slug) {
        await queryClient.invalidateQueries({ queryKey: [`/api/v/${variables.slug}`] });
      }
      
      toast({
        title: "Display Settings Updated",
        description: "Venue display preferences have been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update display preferences.",
        variant: "destructive",
      });
    },
  });

  // Approve/Reject Service
  const updateServiceStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      return await apiRequest("PATCH", `/api/admin/services/${id}`, { status, reviewNotes: notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
      setReviewNotes("");
      toast({
        title: "Service Updated",
        description: "Service status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update service status.",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <Badge className="bg-green-100 text-green-800" data-testid="badge-published"><CheckCircle className="w-3 h-3 mr-1" />Published</Badge>;
      case "approved":
        return <Badge className="bg-green-100 text-green-800" data-testid="badge-approved"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "pending":
      case "pending_approval":
        return <Badge className="bg-yellow-100 text-yellow-800" data-testid="badge-pending"><Clock className="w-3 h-3 mr-1" />Pending Review</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800" data-testid="badge-rejected"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case "draft":
        return <Badge className="bg-gray-100 text-gray-800" data-testid="badge-draft"><Clock className="w-3 h-3 mr-1" />Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading || !isAuthenticated || user?.email !== "timtheeuwsen@gmail.com") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-red-500" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">Manage platform content and community applications</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card data-testid="card-experience-stats">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Experiences</p>
                  <p className="text-2xl font-bold" data-testid="text-experience-total">{allExperiences.length}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="text-blue-600 dark:text-blue-400" data-testid="text-experience-published">
                      {allExperiences.filter((e: any) => e.status === 'published').length} published
                    </span>
                    {" • "}
                    <span className="text-green-600 dark:text-green-400" data-testid="text-experience-approved">
                      {allExperiences.filter((e: any) => e.status === 'approved').length} approved
                    </span>
                    {" • "}
                    <span className="text-yellow-600 dark:text-yellow-400" data-testid="text-experience-pending">
                      {allExperiences.filter((e: any) => e.status === 'pending' || e.status === 'pending_approval').length} pending
                    </span>
                  </div>
                </div>
                <Calendar className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending Applications</p>
                  <p className="text-2xl font-bold">{communityApplications.filter((a: any) => a.status === 'pending').length}</p>
                </div>
                <Users className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-venue-stats">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Venues</p>
                  <p className="text-2xl font-bold" data-testid="text-venue-total">{allVenues.length}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="text-green-600 dark:text-green-400" data-testid="text-venue-approved">
                      {allVenues.filter((v: any) => v.status === 'approved').length} approved
                    </span>
                    {" • "}
                    <span className="text-yellow-600 dark:text-yellow-400" data-testid="text-venue-pending">
                      {allVenues.filter((v: any) => v.status === 'pending').length} pending
                    </span>
                  </div>
                </div>
                <Building className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending Services</p>
                  <p className="text-2xl font-bold">{pendingServices.filter((s: any) => s.status === 'pending').length}</p>
                </div>
                <Settings className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-6 flex gap-4">
          <Button variant="outline" onClick={() => setLocation('/admin/promoters')}>
            <Target className="h-4 w-4 mr-2" />
            Manage Promoters
          </Button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search across all content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs defaultValue="experiences" className="space-y-6">
          <TabsList>
            <TabsTrigger value="experiences">Experiences</TabsTrigger>
            <TabsTrigger value="applications">Tribe Applications</TabsTrigger>
            <TabsTrigger value="venues">Venues</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="venue-calendars">Venue Calendars</TabsTrigger>
          </TabsList>

          <TabsContent value="experiences" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Experience Management</h2>
              <div className="flex items-center gap-2">
                <Label htmlFor="experience-filter" className="text-sm">Filter:</Label>
                <select
                  id="experience-filter"
                  value={experienceStatusFilter}
                  onChange={(e) => setExperienceStatusFilter(e.target.value)}
                  className="border rounded-md px-3 py-1 text-sm bg-white dark:bg-gray-800"
                  data-testid="select-experience-filter"
                >
                  <option value="all">All Experiences</option>
                  <option value="pending">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="published">Published</option>
                  <option value="rejected">Rejected</option>
                  <option value="draft">Drafts</option>
                </select>
              </div>
            </div>

            {experiencesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            ) : (() => {
              const filteredExperiences = allExperiences.filter((experience: any) => {
                // Apply status filter
                if (experienceStatusFilter !== "all") {
                  if (experienceStatusFilter === "pending") {
                    if (experience.status !== "pending" && experience.status !== "pending_approval") return false;
                  } else {
                    if (experience.status !== experienceStatusFilter) return false;
                  }
                }
                // Apply search filter
                if (searchTerm !== "") {
                  const lowerSearch = searchTerm.toLowerCase();
                  return (
                    experience.title?.toLowerCase().includes(lowerSearch) ||
                    experience.description?.toLowerCase().includes(lowerSearch) ||
                    experience.location?.toLowerCase().includes(lowerSearch)
                  );
                }
                return true;
              });

              return filteredExperiences.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No experiences found</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {experienceStatusFilter === "pending" 
                      ? "All experiences have been reviewed" 
                      : `No ${experienceStatusFilter} experiences match your search`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredExperiences.map((experience: any) => (
                  <Card key={experience.id} data-testid={`card-experience-${experience.id}`}>
                    <CardContent className="p-6">
                      <div className="flex gap-4 mb-4">
                        {/* Cover Image */}
                        <div className="w-32 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                          {experience.coverImageUrl ? (
                            <img 
                              src={normalizeImageUrl(experience.coverImageUrl) || ''} 
                              alt={experience.title} 
                              className="w-full h-full object-cover"
                              data-testid={`img-experience-cover-${experience.id}`}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <Calendar className="w-8 h-8" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{experience.title}</h3>
                            {getStatusBadge(experience.status)}
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{experience.description}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                            <span>Creator: {experience.creatorName}</span>
                            <span>Price: {(() => {
                              const skus = (experience as any).ticketSkus || [];
                              if (skus.length > 0) {
                                const prices = skus.map((s: any) => parseFloat(s.pricePerPerson || 0)).filter((p: number) => p > 0);
                                if (prices.length > 0) {
                                  const minPrice = Math.min(...prices);
                                  const hasMultiple = prices.length > 1 && new Set(prices).size > 1;
                                  return hasMultiple 
                                    ? `From ${formatCurrency(minPrice, (experience as any).currency)}`
                                    : formatCurrency(minPrice, (experience as any).currency);
                                }
                              }
                              return formatCurrency(experience.price, (experience as any).currency);
                            })()}</span>
                            <span>Category: {experience.category}</span>
                            <span>Location: {experience.location}</span>
                            {experience.minimumParticipants && experience.minimumParticipants > 0 && (
                              <>
                                <span data-testid={`mvg-progress-text-${experience.id}`}>
                                  MVG: {experience.currentParticipants || 0}/{experience.minimumParticipants}
                                </span>
                                {(experience as any).lifecycleStatus === 'confirmed' ? (
                                  <Badge className="bg-green-100 text-green-800" data-testid={`mvg-reached-badge-${experience.id}`}>
                                    ✅ MVG Reached
                                  </Badge>
                                ) : (experience as any).lifecycleStatus === 'cancelled' ? (
                                  <Badge className="bg-red-100 text-red-800" data-testid={`mvg-reached-badge-${experience.id}`}>
                                    ✗ Trip Cancelled
                                  </Badge>
                                ) : (
                                  <Badge className="bg-yellow-100 text-yellow-800" data-testid={`mvg-reached-badge-${experience.id}`}>
                                    ⏳ Pending MVG
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                          {experience.reviewNotes && (
                            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                              <p className="text-sm"><strong>Review Notes:</strong> {experience.reviewNotes}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/experience/${experience.id}`)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </div>

                      {/* Show/Hide Details Toggle */}
                      <div className="border-t pt-3 mt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleExperienceDetails(experience.id)}
                          className="w-full flex items-center justify-center gap-2 text-sm"
                          data-testid={`button-toggle-details-${experience.id}`}
                        >
                          {expandedExperiences.has(experience.id) ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              Hide Details
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              Show Details
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Expanded Details Section */}
                      {expandedExperiences.has(experience.id) && (
                        <div className="border-t pt-4 mt-2 space-y-4" data-testid={`details-section-${experience.id}`}>
                          
                          {/* MVG Details - Prominently Displayed */}
                          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4" data-testid={`mvg-details-${experience.id}`}>
                            <div className="flex items-center gap-2 mb-3">
                              <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                              <h4 className="font-semibold text-blue-900 dark:text-blue-100">MVG Details</h4>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500 dark:text-gray-400 block">Min. Participants</span>
                                <span className="font-medium" data-testid={`mvg-min-participants-${experience.id}`}>
                                  {experience.minimumParticipants || 'Not set'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400 block">Current</span>
                                <span className="font-medium" data-testid={`mvg-current-participants-${experience.id}`}>
                                  {experience.currentParticipants || 0}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400 block">Lifecycle</span>
                                <span className="font-medium" data-testid={`mvg-status-${experience.id}`}>
                                  {(() => {
                                    const ls = (experience as any).lifecycleStatus ?? 'confirmed';
                                    if (ls === 'confirmed') return <Badge className="bg-green-100 text-green-800 text-xs">Confirmed</Badge>;
                                    if (ls === 'cancelled') return <Badge className="bg-red-100 text-red-800 text-xs">Cancelled</Badge>;
                                    if (ls === 'forming') return <Badge className="bg-amber-100 text-amber-800 text-xs">Forming</Badge>;
                                    return <Badge variant="secondary" className="text-xs">{ls}</Badge>;
                                  })()}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400 block">MVG Deadline</span>
                                <span className="font-medium" data-testid={`mvg-deadline-${experience.id}`}>
                                  {(experience as any).mvgDeadline ? new Date((experience as any).mvgDeadline).toLocaleDateString() : 'Not set'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Pricing Details */}
                          <div className="border rounded-lg p-4" data-testid={`pricing-details-${experience.id}`}>
                            <div className="flex items-center gap-2 mb-3">
                              <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                              <h4 className="font-semibold">Pricing Details</h4>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-gray-500 dark:text-gray-400 block">Currency</span>
                                <span className="font-medium" data-testid={`pricing-currency-${experience.id}`}>
                                  {(experience as any).currency || 'EUR'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400 block">Deposit Enabled</span>
                                <span className="font-medium" data-testid={`pricing-deposit-enabled-${experience.id}`}>
                                  {((experience as any).depositEnabled || 
                                    ((experience as any).depositAmount && parseFloat((experience as any).depositAmount) > 0) ||
                                    ((experience as any).ticketSkus?.length > 0 && (experience as any).ticketSkus[0]?.depositPerPerson > 0)) 
                                    ? 'Yes' : 'No'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400 block">Deposit Amount</span>
                                <span className="font-medium" data-testid={`pricing-deposit-amount-${experience.id}`}>
                                  {(() => {
                                    // DATA CONTRACT: Fixed deposit amount only (no percentages)
                                    // Check ticketSkus.depositPerPerson first (source of truth)
                                    const skus = (experience as any).ticketSkus || [];
                                    if (skus.length > 0 && skus[0].depositPerPerson && parseFloat(skus[0].depositPerPerson) > 0) {
                                      return formatCurrency(skus[0].depositPerPerson, (experience as any).currency);
                                    }
                                    // Fallback to experience.depositAmount for legacy data
                                    if ((experience as any).depositAmount && parseFloat((experience as any).depositAmount) > 0) {
                                      return formatCurrency((experience as any).depositAmount, (experience as any).currency);
                                    }
                                    // No percentage fallback - DATA CONTRACT enforces fixed amounts only
                                    return 'Not set';
                                  })()}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500 dark:text-gray-400 block">Balance Due (days)</span>
                                <span className="font-medium" data-testid={`pricing-balance-due-${experience.id}`}>
                                  {(experience as any).balanceDueDays || 'Not set'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Ticket SKUs - Source of Truth for Pricing */}
                          {(experience as any).ticketSkus && Array.isArray((experience as any).ticketSkus) && (experience as any).ticketSkus.length > 0 && (
                            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-900/20" data-testid={`ticketskus-section-${experience.id}`}>
                              <div className="flex items-center gap-2 mb-3">
                                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                                <h4 className="font-semibold">Ticket SKUs (Source of Truth)</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left py-2 pr-4">Ticket Name</th>
                                      <th className="text-left py-2 pr-4">Price/Person</th>
                                      <th className="text-left py-2 pr-4">Deposit</th>
                                      <th className="text-left py-2 pr-4">Capacity</th>
                                      <th className="text-left py-2">Sold</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(experience as any).ticketSkus.map((sku: any, skuIndex: number) => (
                                      <tr key={skuIndex} className="border-b last:border-0" data-testid={`sku-row-${experience.id}-${skuIndex}`}>
                                        <td className="py-2 pr-4 font-medium">{sku.ticketName || 'Unnamed'}</td>
                                        <td className="py-2 pr-4">{formatCurrency(sku.pricePerPerson, (experience as any).currency)}</td>
                                        <td className="py-2 pr-4">{sku.depositPerPerson ? formatCurrency(sku.depositPerPerson, (experience as any).currency) : 'N/A'}</td>
                                        <td className="py-2 pr-4">{sku.ticketCapacity || 0}</td>
                                        <td className="py-2">{sku.soldCount || 0}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Gallery Images */}
                          {(experience as any).gallery && Array.isArray((experience as any).gallery) && (experience as any).gallery.length > 0 && (
                            <div className="border rounded-lg p-4" data-testid={`gallery-section-${experience.id}`}>
                              <div className="flex items-center gap-2 mb-3">
                                <Image className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                <h4 className="font-semibold">Gallery Images ({(experience as any).gallery.length})</h4>
                              </div>
                              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                                {(experience as any).gallery.map((imageUrl: string, index: number) => (
                                  <div 
                                    key={index} 
                                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                                    data-testid={`gallery-image-${experience.id}-${index}`}
                                  >
                                    <img 
                                      src={normalizeImageUrl(imageUrl) || ''} 
                                      alt={`Gallery ${index + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Itinerary */}
                          {(experience as any).itinerary && Array.isArray((experience as any).itinerary) && (experience as any).itinerary.length > 0 && (
                            <div className="border rounded-lg p-4" data-testid={`itinerary-section-${experience.id}`}>
                              <div className="flex items-center gap-2 mb-3">
                                <ListOrdered className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                <h4 className="font-semibold">Itinerary ({(experience as any).itinerary.length} days)</h4>
                              </div>
                              <div className="space-y-3">
                                {(experience as any).itinerary.map((day: any, dayIndex: number) => (
                                  <div key={dayIndex} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3" data-testid={`itinerary-day-${experience.id}-${dayIndex}`}>
                                    <div className="font-medium text-sm mb-2">
                                      Day {day.day || dayIndex + 1}: {day.title || 'Untitled'}
                                    </div>
                                    {day.timeSlots && Array.isArray(day.timeSlots) && day.timeSlots.length > 0 && (
                                      <div className="space-y-1 pl-4">
                                        {day.timeSlots.map((slot: any, slotIndex: number) => (
                                          <div key={slotIndex} className="text-xs text-gray-600 dark:text-gray-400">
                                            <span className="font-medium">{slot.time || slot.startTime}:</span> {slot.activity || slot.description}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Rooms Breakdown */}
                          {(experience as any).rooms && Array.isArray((experience as any).rooms) && (experience as any).rooms.length > 0 && (
                            <div className="border rounded-lg p-4" data-testid={`rooms-section-${experience.id}`}>
                              <div className="flex items-center gap-2 mb-3">
                                <Bed className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                <h4 className="font-semibold">Rooms ({(experience as any).rooms.length})</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left py-2 pr-4">Room Name</th>
                                      <th className="text-left py-2 pr-4">Quantity</th>
                                      <th className="text-left py-2">Price/Person</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(experience as any).rooms.map((room: any, roomIndex: number) => {
                                      // Look up price from ticketSkus by sourceRoomId
                                      const skus = (experience as any).ticketSkus || [];
                                      const matchingSku = skus.find((s: any) => s.sourceRoomId === room.id);
                                      const roomPrice = matchingSku?.pricePerPerson || room.pricePerPerson || room.price || 0;
                                      return (
                                        <tr key={roomIndex} className="border-b last:border-0" data-testid={`room-row-${experience.id}-${roomIndex}`}>
                                          <td className="py-2 pr-4">{room.name || room.roomName || 'Unnamed Room'}</td>
                                          <td className="py-2 pr-4">{room.quantity || room.count || 1}</td>
                                          <td className="py-2">{formatCurrency(roomPrice, (experience as any).currency)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Roles */}
                          {(experience as any).roles && Array.isArray((experience as any).roles) && (experience as any).roles.length > 0 && (
                            <div className="border rounded-lg p-4" data-testid={`roles-section-${experience.id}`}>
                              <div className="flex items-center gap-2 mb-3">
                                <UserCog className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                                <h4 className="font-semibold">Roles ({(experience as any).roles.length})</h4>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {(experience as any).roles.map((role: any, roleIndex: number) => (
                                  <div 
                                    key={roleIndex} 
                                    className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3"
                                    data-testid={`role-item-${experience.id}-${roleIndex}`}
                                  >
                                    <div className="font-medium text-sm">{role.name || role.roleName || 'Unnamed Role'}</div>
                                    {role.requirements && (
                                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        Requirements: {role.requirements}
                                      </div>
                                    )}
                                    {role.description && (
                                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        {role.description}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {(experience.status === 'pending' || experience.status === 'pending_approval') && (
                        <div className="border-t pt-4">
                          <div className="mb-3">
                            <Textarea
                              placeholder="Add review notes (optional)..."
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              className="mb-3"
                              data-testid={`textarea-review-notes-${experience.id}`}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updateExperienceStatus.mutate({ 
                                id: experience.id, 
                                status: 'approved', 
                                notes: reviewNotes 
                              })}
                              disabled={updateExperienceStatus.isPending}
                              className="bg-green-600 hover:bg-green-700"
                              data-testid={`button-approve-experience-${experience.id}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateExperienceStatus.mutate({ 
                                id: experience.id, 
                                status: 'rejected', 
                                notes: reviewNotes 
                              })}
                              disabled={updateExperienceStatus.isPending}
                              data-testid={`button-reject-experience-${experience.id}`}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
            })()}
          </TabsContent>

          <TabsContent value="applications" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">Tribe Applications</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Simple applications to join specific experience communities (different from detailed participant profiles)
                </p>
              </div>
            </div>

            {applicationsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            ) : communityApplications.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No applications</h3>
                  <p className="text-gray-600 dark:text-gray-400">Community applications will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {communityApplications.filter((application: any) => 
                  searchTerm === "" || 
                  application.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  application.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  application.email.toLowerCase().includes(searchTerm.toLowerCase())
                ).map((application: any) => (
                  <Card key={application.id}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{application.firstName} {application.lastName}</h3>
                            {getStatusBadge(application.status)}
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 mb-3">{application.email}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <strong>Remote Work:</strong> {application.remoteWorkStatus}
                            </div>
                            <div>
                              <strong>Applied:</strong> {new Date(application.createdAt).toLocaleDateString()}
                            </div>
                            <div className="md:col-span-2">
                              <strong>Current Work:</strong> {application.currentWork}
                            </div>
                            <div className="md:col-span-2">
                              <strong>Travel Goals:</strong> {application.travelGoals}
                            </div>
                            <div className="md:col-span-2">
                              <strong>What Drives You:</strong> {application.whatDrivesYou}
                            </div>
                            <div className="md:col-span-2">
                              <strong>Perfect Experience:</strong> {application.perfectExperience}
                            </div>
                            <div className="md:col-span-2">
                              <strong>Community Contribution:</strong> {application.communityContribution}
                            </div>
                          </div>
                          {application.reviewNotes && (
                            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg mt-3">
                              <p className="text-sm"><strong>Review Notes:</strong> {application.reviewNotes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {application.status === 'pending' && (
                        <div className="border-t pt-4">
                          <div className="mb-3">
                            <Textarea
                              placeholder="Add review notes (optional)..."
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              className="mb-3"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updateApplicationStatus.mutate({ 
                                id: application.id, 
                                status: 'approved', 
                                notes: reviewNotes 
                              })}
                              disabled={updateApplicationStatus.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <UserCheck className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateApplicationStatus.mutate({ 
                                id: application.id, 
                                status: 'rejected', 
                                notes: reviewNotes 
                              })}
                              disabled={updateApplicationStatus.isPending}
                            >
                              <UserX className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="venues" className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Venue Management</h2>
            </div>

            {venuesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            ) : allVenues.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    No venues found
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    There are no venues in the system yet
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Pricing</TableHead>
                        <TableHead>Payment Timing</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>Deposit</TableHead>
                        <TableHead>Terms</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allVenues.map((venue) => (
                        <TableRow key={venue.id} data-testid={`venue-row-${venue.id}`}>
                          <TableCell className="font-medium" data-testid={`venue-name-${venue.id}`}>
                            {venue.name}
                          </TableCell>
                          <TableCell data-testid={`venue-owner-${venue.id}`}>
                            {venue.ownerName || venue.ownerEmail || 'Unknown'}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(venue.status || 'draft')}
                          </TableCell>
                          <TableCell data-testid={`venue-pricing-${venue.id}`}>
                            {(venue as any).pricingModel ? (
                              <span className="text-xs">
                                {(venue as any).pricingModel === 'whole_venue' ? 'Whole Venue' : 
                                 (venue as any).pricingModel === 'per_room' ? 'Per Room' : 
                                 (venue as any).pricingModel}
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell data-testid={`venue-payment-timing-${venue.id}`}>
                            {(venue as any).paymentTimingModel ? (
                              <span className="text-xs">
                                {(venue as any).paymentTimingModel === 'soft_hold_deposit_balance' ? 'Soft Hold → Deposit' : 
                                 (venue as any).paymentTimingModel === 'deposit_upfront_balance' ? 'Deposit Upfront' : 
                                 (venue as any).paymentTimingModel === 'deposit_balance_arrival' ? 'Balance on Arrival' : 
                                 (venue as any).paymentTimingModel}
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell data-testid={`venue-commission-${venue.id}`}>
                            {venue.commissionPercent ? `${venue.commissionPercent}%` : '-'}
                          </TableCell>
                          <TableCell data-testid={`venue-deposit-${venue.id}`}>
                            {venue.depositPercent ? `${venue.depositPercent}%` : '-'}
                          </TableCell>
                          <TableCell data-testid={`venue-terms-${venue.id}`}>
                            {(venue as any).termsConfirmed ? (
                              <span className="inline-flex items-center text-green-600">
                                <CheckCircle className="w-4 h-4 mr-1" />
                                <span className="text-xs">Confirmed</span>
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              {venue.status === 'pending' && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => updateVenueStatus.mutate({ 
                                      id: venue.id, 
                                      status: 'approved', 
                                      notes: '',
                                      slug: venue.slug
                                    })}
                                    disabled={updateVenueStatus.isPending}
                                    className="bg-green-600 hover:bg-green-700"
                                    data-testid={`button-approve-${venue.id}`}
                                  >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => updateVenueStatus.mutate({ 
                                      id: venue.id, 
                                      status: 'rejected', 
                                      notes: '',
                                      slug: venue.slug
                                    })}
                                    disabled={updateVenueStatus.isPending}
                                    data-testid={`button-reject-${venue.id}`}
                                  >
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Reject
                                  </Button>
                                </>
                              )}
                              {venue.status === 'approved' && venue.slug && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(`/v/${venue.slug}`, '_blank')}
                                  data-testid={`button-view-public-${venue.id}`}
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  View
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLocation(`/venue/setup?edit=${venue.id}`)}
                                data-testid={`button-edit-${venue.id}`}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete "${venue.name}"? This action cannot be undone.`)) {
                                    deleteVenue.mutate({ id: venue.id, slug: venue.slug });
                                  }
                                }}
                                disabled={deleteVenue.isPending}
                                data-testid={`button-delete-${venue.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="services" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Service Approvals</h2>
            </div>

            {servicesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            ) : pendingServices.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No pending services</h3>
                  <p className="text-gray-600 dark:text-gray-400">All services have been reviewed</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingServices.filter((service: any) => 
                  searchTerm === "" || 
                  service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  service.serviceType.toLowerCase().includes(searchTerm.toLowerCase())
                ).map((service: any) => (
                  <Card key={service.id}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{service.name}</h3>
                            {getStatusBadge(service.status)}
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 mb-3">{service.description}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                            <span>Type: {service.serviceType}</span>
                            <span>Pricing: {service.pricing}</span>
                            <span>Provider: {service.providerName}</span>
                          </div>
                        </div>
                      </div>
                      
                      {service.status === 'pending' && (
                        <div className="border-t pt-4">
                          <div className="mb-3">
                            <Textarea
                              placeholder="Add review notes (optional)..."
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              className="mb-3"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updateServiceStatus.mutate({ 
                                id: service.id, 
                                status: 'approved', 
                                notes: reviewNotes 
                              })}
                              disabled={updateServiceStatus.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateServiceStatus.mutate({ 
                                id: service.id, 
                                status: 'rejected', 
                                notes: reviewNotes 
                              })}
                              disabled={updateServiceStatus.isPending}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="venue-calendars" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Venue Availability Calendars</h2>
            </div>
            <AdminVenueCalendar />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}