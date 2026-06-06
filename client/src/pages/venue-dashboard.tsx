import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useVenueAuth } from "@/hooks/useRoleAuth";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  MapPin, 
  Calendar, 
  Users, 
  DollarSign,
  Edit,
  Eye,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Building
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import ProtectedRoute from "@/components/ProtectedRoute";
import Breadcrumb from "@/components/Breadcrumb";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { VenueAvailabilityManager } from "@/components/VenueAvailabilityManager";
import { VenueGoogleCalendarIntegration } from "@/components/VenueGoogleCalendarIntegration";

function VenueDashboardContent() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, hasRequiredRole, isLoading: authLoading } = useVenueAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const breadcrumbs = useBreadcrumbs();

  // Venue listings query - uses correct endpoint for user's own venues
  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ["/api/user/venues"],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: any[], isLoading: boolean };

  // Venue bookings query
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["/api/venue/bookings"],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: any[], isLoading: boolean };

  // Venue analytics query
  const { data: analytics = {}, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/venue/analytics"],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: any, isLoading: boolean };

  // Task 4 — Pending Offers (Handshake inbox)
  const { data: pendingOffers = [], isLoading: offersLoading } = useQuery({
    queryKey: ["/api/venue/pending-offers"],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: any[], isLoading: boolean };

  // Task 4 — Venue Ledger (real sales + my share)
  const { data: ledger = { totalSales: 0, myShare: 0, bookingsCount: 0 }, isLoading: ledgerLoading } = useQuery({
    queryKey: ["/api/venue/ledger"],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: any, isLoading: boolean };

  // Accept / Reject offer mutations
  const acceptOffer = useMutation({
    mutationFn: (experienceId: string) => apiRequest("POST", `/api/venue/offers/${experienceId}/accept`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/venue/pending-offers"] });
      toast({ title: "Offer Accepted", description: "The experience is now Live!" });
    },
    onError: () => toast({ title: "Error", description: "Failed to accept offer", variant: "destructive" }),
  });

  const rejectOffer = useMutation({
    mutationFn: (experienceId: string) => apiRequest("POST", `/api/venue/offers/${experienceId}/reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/venue/pending-offers"] });
      toast({ title: "Offer Rejected", description: "The creator has been notified." });
    },
    onError: () => toast({ title: "Error", description: "Failed to reject offer", variant: "destructive" }),
  });

  const submitForReview = useMutation({
    mutationFn: async (venueId: string) => {
      return await apiRequest("PATCH", `/api/venues/${venueId}/submit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/venues"] });
      toast({
        title: "Submitted for Review",
        description: "Your venue has been submitted and is now pending admin approval.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login"; // External auth redirect - keep window.location
        }, 500);
        return;
      }
      toast({
        title: "Submit Failed",
        description: "Failed to submit venue for review. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteVenue = useMutation({
    mutationFn: async (venueId: string) => {
      return await apiRequest("DELETE", `/api/venues/${venueId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/venues"] });
      toast({
        title: "Venue Deleted",
        description: "Venue listing has been successfully deleted.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login"; // External auth redirect - keep window.location
        }, 500);
        return;
      }
      toast({
        title: "Delete Failed",
        description: "Failed to delete venue. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800" data-testid="badge-approved"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800" data-testid="badge-pending"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800" data-testid="badge-rejected"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case "draft":
        return <Badge className="bg-gray-100 text-gray-800" data-testid="badge-draft"><Edit className="w-3 h-3 mr-1" />Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if ((venuesLoading || bookingsLoading || analyticsLoading) || !isAuthenticated || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!authLoading && !hasRequiredRole) {
    setLocation('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb items={breadcrumbs} className="mb-6" />
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Venue Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage your venue listings and track bookings</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Approved</p>
                  <p className="text-2xl font-bold text-green-600">{venues.filter((v: any) => v.status === 'approved').length}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending Review</p>
                  <p className="text-2xl font-bold text-yellow-600">{venues.filter((v: any) => v.status === 'pending').length}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Drafts</p>
                  <p className="text-2xl font-bold text-gray-600">{venues.filter((v: any) => v.status === 'draft').length}</p>
                </div>
                <Edit className="w-8 h-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Rejected</p>
                  <p className="text-2xl font-bold text-red-600">{venues.filter((v: any) => v.status === 'rejected').length}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Task 4 — Ledger Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Sales</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${ledger.totalSales?.toFixed(2) ?? '0.00'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Gross across all linked experiences</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">My Share</p>
              <p className="text-2xl font-bold text-green-600">
                ${ledger.myShare?.toFixed(2) ?? '0.00'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Based on accepted venue split %</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending Offers</p>
              <p className="text-2xl font-bold text-amber-600">{pendingOffers.length}</p>
              <p className="text-xs text-gray-500 mt-1">Creator proposals awaiting your decision</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="venues" className="space-y-6">
          <TabsList>
            <TabsTrigger value="venues">My Venues</TabsTrigger>
            <TabsTrigger value="offers" className="relative">
              Offers
              {pendingOffers.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs w-5 h-5">
                  {pendingOffers.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* ── Pending Offers Tab ── */}
          <TabsContent value="offers" className="space-y-4">
            <h2 className="text-xl font-semibold">Pending Offers</h2>
            {offersLoading ? (
              <div className="text-center py-8 text-gray-500">Loading offers…</div>
            ) : pendingOffers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No pending offers</p>
                <p className="text-sm mt-1">When a creator proposes an event at your venue, it will appear here.</p>
              </div>
            ) : (
              pendingOffers.map((offer: any) => {
                const platformPct = parseFloat(offer.platformPct || offer.platformRevenuePercentage || '15');
                const venuePct = parseFloat(offer.venueRevenuePercentage || '0');
                const creatorPct = parseFloat(offer.creatorPct || offer.creatorRevenuePercentage || '85');
                return (
                  <Card key={offer.id} className="border-amber-200 dark:border-amber-800">
                    <CardContent className="p-5">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">{offer.title}</h3>
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                              <Clock className="w-3 h-3 mr-1" />Awaiting your decision
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-gray-500">Start Date</p>
                              <p className="font-medium">{offer.startDate ? new Date(offer.startDate).toLocaleDateString() : '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">End Date</p>
                              <p className="font-medium">{offer.endDate ? new Date(offer.endDate).toLocaleDateString() : '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Max Capacity</p>
                              <p className="font-medium">{offer.maxParticipants ?? '—'} people</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Ticket Price</p>
                              <p className="font-medium">{offer.price ? `$${parseFloat(offer.price).toFixed(0)}` : '—'}</p>
                            </div>
                          </div>

                          {/* Proposed Split */}
                          <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border">
                            <p className="text-xs font-semibold text-gray-600 mb-2">Proposed Revenue Split</p>
                            <div className="flex gap-4 text-sm">
                              <span className="text-gray-500">Platform: <strong className="text-gray-900 dark:text-white">{platformPct}%</strong></span>
                              <span className="text-green-600">Your Share: <strong>{venuePct}%</strong></span>
                              <span className="text-gray-500">Creator: <strong>{creatorPct}%</strong></span>
                            </div>
                            {offer.price && offer.maxParticipants && (
                              <p className="text-xs text-gray-500 mt-1">
                                Est. your earnings if full: <strong className="text-green-600">
                                  ${(parseFloat(offer.price) * (offer.maxParticipants || 0) * (venuePct / 100)).toFixed(2)}
                                </strong>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex md:flex-col gap-2 shrink-0">
                          <Button
                            className="bg-green-600 hover:bg-green-700 text-white flex-1 md:flex-none"
                            onClick={() => acceptOffer.mutate(offer.id)}
                            disabled={acceptOffer.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 flex-1 md:flex-none"
                            onClick={() => rejectOffer.mutate(offer.id)}
                            disabled={rejectOffer.isPending}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="venues" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">My Venue Listings</h2>
              <Button 
                onClick={() => setLocation('/venues/new')}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add New Venue
              </Button>
            </div>

            {venuesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            ) : venues.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No venues listed yet</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Start by listing your first venue</p>
                  <Button onClick={() => setLocation('/venues/new')}>
                    List Your Venue
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {venues.map((venue: any) => (
                  <Card key={venue.id} className="overflow-hidden">
                    <div className="aspect-video bg-gray-200 dark:bg-gray-700">
                      {venue.images?.length > 0 ? (
                        <img 
                          src={venue.images[0]} 
                          alt={venue.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Building className="w-12 h-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg truncate">{venue.name}</h3>
                        {getStatusBadge(venue.status)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                        <MapPin className="w-4 h-4" />
                        <span className="truncate">{venue.location}</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
                        {venue.description}
                      </p>
                      <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
                        <span>{venue.venueType}</span>
                        <span>Capacity: {venue.capacity}</span>
                      </div>
                      {venue.status === 'draft' && (
                        <Button
                          className="w-full mb-2 bg-blue-600 hover:bg-blue-700"
                          size="sm"
                          onClick={() => submitForReview.mutate(venue.id)}
                          disabled={submitForReview.isPending}
                          data-testid="button-submit-review"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Submit for Review
                        </Button>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(
                            venue.status === 'approved'
                              ? (venue.slug ? `/v/${venue.slug}` : `/v/${venue.id}`)
                              : `/venues/new?edit=${venue.id}`
                          )}
                          className="flex-1"
                          data-testid="button-view-venue"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(`/venues/new?edit=${venue.id}`)}
                          className="flex-1"
                          data-testid="button-edit-venue"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteVenue.mutate(venue.id)}
                          disabled={deleteVenue.isPending}
                          data-testid="button-delete-venue"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="bookings" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Venue Bookings</h2>
            </div>

            {bookingsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            ) : bookings.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No bookings yet</h3>
                  <p className="text-gray-600 dark:text-gray-400">Bookings will appear here when experiences use your venue</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {bookings.map((booking: any) => (
                  <Card key={booking.id}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">{booking.experience?.title}</h3>
                            {getStatusBadge(booking.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                            <div className="flex items-center gap-1">
                              <Building className="w-4 h-4" />
                              <span>{booking.venue?.name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>{new Date(booking.startDate).toLocaleDateString()} - {new Date(booking.endDate).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span>{booking.participants} participants</span>
                            </div>
                          </div>
                          <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Revenue: ${booking.revenue || 0}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/experiences/${booking.experienceId}`)}
                          >
                            View Experience
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="availability" className="space-y-6">
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Venue Availability Management</h2>
              
              {venues.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No venues to manage</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">Create a venue first to manage its availability</p>
                    <Button onClick={() => setLocation('/venues/new')}>
                      List Your Venue
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {venues.map((venue: any) => (
                    <Card key={venue.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>{venue.name}</CardTitle>
                            <CardDescription>{venue.city}</CardDescription>
                          </div>
                          <Badge variant={venue.approved ? "default" : "secondary"}>
                            {venue.approved ? "Approved" : venue.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <VenueGoogleCalendarIntegration venue={venue} />
                        <VenueAvailabilityManager venueId={venue.id} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Overview</CardTitle>
                  <CardDescription>Your venue earnings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>This Month</span>
                      <span className="font-semibold">${analytics.monthlyRevenue || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Month</span>
                      <span className="font-semibold">${analytics.lastMonthRevenue || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Revenue</span>
                      <span className="font-semibold">${analytics.totalRevenue || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Booking Statistics</CardTitle>
                  <CardDescription>Your venue performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Total Bookings</span>
                      <span className="font-semibold">{analytics.totalBookings || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Occupancy Rate</span>
                      <span className="font-semibold">{analytics.occupancyRate || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Average Booking Value</span>
                      <span className="font-semibold">${analytics.averageBookingValue || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Repeat Bookings</span>
                      <span className="font-semibold">{analytics.repeatBookings || 0}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function VenueDashboard() {
  return (
    <ProtectedRoute requiredRole="venue_provider">
      <VenueDashboardContent />
    </ProtectedRoute>
  );
}
