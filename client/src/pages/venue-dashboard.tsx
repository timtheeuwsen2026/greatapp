import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useVenueAuth } from "@/hooks/useRoleAuth";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  Building,
  Search,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Send,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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

  // City filter for the Open Events feed
  const [openEventsCityFilter, setOpenEventsCityFilter] = useState("");

  // Task 4 — Venue Ledger (real sales + my share)
  const { data: ledger = { totalSales: 0, myShare: 0, bookingsCount: 0 }, isLoading: ledgerLoading } = useQuery({
    queryKey: ["/api/venue/ledger"],
    enabled: isAuthenticated,
    retry: false,
  }) as { data: any, isLoading: boolean };

  // Open Events feed — experiences actively seeking a venue, optionally filtered by city
  const { data: openEvents = [], isLoading: openEventsLoading } = useQuery({
    queryKey: ["/api/venue/open-events", openEventsCityFilter],
    queryFn: async () => {
      const url = openEventsCityFilter.trim()
        ? `/api/venue/open-events?city=${encodeURIComponent(openEventsCityFilter.trim())}`
        : "/api/venue/open-events";
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: isAuthenticated,
    retry: false,
  }) as { data: any[], isLoading: boolean };

  // "Offer to Host" modal state
  const [offerModal, setOfferModal] = useState<{ open: boolean; event: any | null }>({ open: false, event: null });
  const [offerForm, setOfferForm] = useState({ venueId: "", model: "access_only", fixedFee: "", perHeadAmount: "", minimumSpend: "", revenueSharePct: "", accessFee: "", message: "" });

  const submitOffer = useMutation({
    mutationFn: async ({ experienceId, venueId, model, terms, message }: any) =>
      apiRequest("POST", `/api/venue/open-events/${experienceId}/offer`, { venueId, model, terms, message }),
    onSuccess: () => {
      setOfferModal({ open: false, event: null });
      setOfferForm({ venueId: "", model: "access_only", fixedFee: "", perHeadAmount: "", minimumSpend: "", revenueSharePct: "", accessFee: "", message: "" });
      toast({ title: "Offer Submitted", description: "Your offer is awaiting admin approval. Once approved, the creator will be able to see and respond to it." });
    },
    onError: () => toast({ title: "Error", description: "Failed to submit offer", variant: "destructive" }),
  });

  const handleSubmitOffer = () => {
    if (!offerModal.event || !offerForm.venueId || !offerForm.model) return;
    const terms: Record<string, number> = {};
    if (offerForm.model === "fixed_fee" && offerForm.fixedFee) terms.fixedFee = parseFloat(offerForm.fixedFee);
    if (offerForm.model === "per_head" && offerForm.perHeadAmount) terms.perHeadAmount = parseFloat(offerForm.perHeadAmount);
    if (offerForm.model === "minimum_spend" && offerForm.minimumSpend) terms.minimumSpend = parseFloat(offerForm.minimumSpend);
    if (offerForm.model === "revenue_share" && offerForm.revenueSharePct) terms.revenueSharePct = parseFloat(offerForm.revenueSharePct);
    if (offerForm.model === "access_only" && offerForm.accessFee) terms.accessFee = parseFloat(offerForm.accessFee);
    // venue_sponsored: venue pays creator flat fee — stored as fixedFee
    if (offerForm.model === "venue_sponsored" && offerForm.fixedFee) terms.fixedFee = parseFloat(offerForm.fixedFee);
    // upfront_rental: creator pays venue flat fee — also stored as fixedFee
    if (offerForm.model === "upfront_rental" && offerForm.fixedFee) terms.fixedFee = parseFloat(offerForm.fixedFee);
    submitOffer.mutate({ experienceId: offerModal.event.id, venueId: offerForm.venueId, model: offerForm.model, terms, message: offerForm.message });
  };

  // Accept / Reject offer mutations
  const acceptOffer = useMutation({
    mutationFn: async (experienceId: string) => {
      const res = await apiRequest("POST", `/api/venue/offers/${experienceId}/accept`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.requiresPayment && data.checkoutUrl) {
        // Venue-Sponsored deal: redirect to Stripe Checkout to pay the sponsorship fee
        toast({ title: "Sponsorship Payment Required", description: data.message || "Complete payment to activate the event." });
        window.location.href = data.checkoutUrl;
        return;
      }
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

  const resubmitVenue = useMutation({
    mutationFn: async (venueId: string) => {
      return await apiRequest("PATCH", `/api/venues/${venueId}/resubmit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/venues"] });
      toast({ title: "Submitted for review", description: "Your venue has been sent back to the admin for review." });
    },
    onError: (error: any) => {
      toast({ title: "Resubmit failed", description: error?.message || "Something went wrong.", variant: "destructive" });
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
            <TabsTrigger value="open-events" className="relative">
              Open Events
              {openEvents.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-xs w-5 h-5">
                  {openEvents.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* ── Open Events Feed Tab ── */}
          {/* Creators who published with venueType="open" appear here so venue owners can reach out */}
          <TabsContent value="open-events" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-xl font-semibold">Open Events — Seeking a Venue</h2>
              {/* City filter: narrows results by the event's location field */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  className="pl-9"
                  placeholder="Filter by city…"
                  value={openEventsCityFilter}
                  onChange={(e) => setOpenEventsCityFilter(e.target.value)}
                />
              </div>
            </div>

            <p className="text-sm text-gray-500">
              These creators have published their event but haven't confirmed a venue yet.
              If your space is a good fit, express your interest and they'll receive your venue profile.
            </p>

            {openEventsLoading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                Loading open events…
              </div>
            ) : openEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No open events found</p>
                <p className="text-sm mt-1">
                  {openEventsCityFilter.trim()
                    ? `No creators are looking for a venue in "${openEventsCityFilter}" right now. Try clearing the filter.`
                    : "No creators are currently seeking a venue. Check back soon."}
                </p>
                {openEventsCityFilter.trim() && (
                  <button
                    className="mt-3 text-sm text-blue-600 underline"
                    onClick={() => setOpenEventsCityFilter("")}
                  >
                    Clear filter
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  // Label maps defined inside render so they're co-located with the card UI
                  const spaceTypeLabels: Record<string, string> = {
                    coffee_shop: "Coffee Shop",
                    restaurant: "Restaurant / Bar",
                    fitness_studio: "Fitness Studio",
                    yoga_studio: "Yoga Studio",
                    coworking: "Co-working Space",
                    retail_gallery: "Retail / Gallery",
                    outdoor_park: "Outdoor / Park",
                    private_villa: "Private Villa",
                    retreat_center: "Retreat Center",
                    hotel_conference: "Hotel / Conference Room",
                    other: "Other",
                  };
                  const targetDealLabels: Record<string, string> = {
                    access_only: "Access Only / Pay-at-Counter",
                    fixed_fee: "Flat Fee",
                    per_head: "Per Head",
                    minimum_spend: "Minimum Spend",
                    revenue_share: "Revenue Share",
                  };
                  return openEvents.map((event: any) => (
                    <Card key={event.id} className="border-blue-200 dark:border-blue-800">
                      <CardContent className="p-5">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-lg">{event.title}</h3>
                              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                                <AlertCircle className="w-3 h-3 mr-1" />Seeking Venue
                              </Badge>
                              {event.venueOpenSpaceType && (
                                <Badge variant="outline" className="text-gray-600">
                                  {spaceTypeLabels[event.venueOpenSpaceType] ?? event.venueOpenSpaceType}
                                </Badge>
                              )}
                            </div>

                            {event.shortDescription && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                {event.shortDescription}
                              </p>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <p className="text-xs text-gray-500">Location</p>
                                <p className="font-medium flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-gray-400" />
                                  {event.location || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Start Date</p>
                                <p className="font-medium">
                                  {event.startDate ? new Date(event.startDate).toLocaleDateString() : "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">End Date</p>
                                <p className="font-medium">
                                  {event.endDate ? new Date(event.endDate).toLocaleDateString() : "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Event Size</p>
                                <p className="font-medium flex items-center gap-1">
                                  <Users className="w-3 h-3 text-gray-400" />
                                  {event.maxParticipants ? `${event.maxParticipants} people` : "—"}
                                </p>
                              </div>
                            </div>

                            {event.venueTargetDeal && (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-500">Preferred deal:</span>
                                <Badge className="bg-green-100 text-green-800 border-green-300">
                                  {targetDealLabels[event.venueTargetDeal] ?? event.venueTargetDeal}
                                </Badge>
                              </div>
                            )}
                          </div>

                          {/* Offer to Host — opens modal for venue owner to submit Commercial Model */}
                          {(() => {
                            const approvedVenues = venues.filter((v: any) => v.status === 'approved');
                            const hasApproved = approvedVenues.length > 0;
                            return (
                              <div className="shrink-0">
                                <Button
                                  className="bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto disabled:opacity-60"
                                  onClick={() => {
                                    setOfferForm(f => ({ ...f, venueId: approvedVenues[0]?.id ?? "" }));
                                    setOfferModal({ open: true, event });
                                  }}
                                  disabled={!hasApproved}
                                  title={!hasApproved ? "Your venue must be approved by admin before you can submit offers" : undefined}
                                >
                                  <Send className="w-4 h-4 mr-2" />
                                  Offer to Host
                                </Button>
                                {!hasApproved && venues.length > 0 && (
                                  <p className="text-xs text-amber-600 mt-1">Venue pending admin approval</p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  ));
                })()}
              </div>
            )}
          </TabsContent>

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
                const contract = offer.contract || {};
                const terms = contract.terms || {};
                const risk = contract.risk || {};
                const platformPct = parseFloat(terms.platformPct || offer.platformPct || offer.platformRevenuePercentage || '15');
                const modelLabels: Record<string, string> = {
                  fixed_fee: 'Flat Fee Offer',
                  per_head: 'Per Head',
                  minimum_spend: 'Minimum Spend Guarantee',
                  revenue_share: 'Percentage Revenue Share',
                  access_only: 'Access-Only / Pay-at-Counter',
                  venue_sponsored: 'Venue-Sponsored (You Pay Creator)',
                  upfront_rental: 'Upfront Rental (Creator Pays You)',
                };
                const formatMoney = (value: any) => {
                  const num = parseFloat(String(value || 0));
                  return `${(terms.currency || offer.currency || 'EUR').toUpperCase()} ${Number.isFinite(num) ? num.toFixed(2) : '0.00'}`;
                };
                const venuePayoutPreview = (() => {
                  const gross = parseFloat(offer.price || '0') * (offer.maxParticipants || 0);
                  switch (contract.model) {
                    case 'fixed_fee':
                      return terms.fixedFee || 0;
                    case 'per_head':
                      return (terms.perHeadAmount || 0) * (offer.maxParticipants || 0);
                    case 'minimum_spend':
                      return terms.minimumSpend || 0;
                    case 'revenue_share':
                      return gross * ((terms.revenueSharePct || 0) / 100);
                    case 'venue_sponsored':
                      return -(terms.fixedFee || 0); // negative — venue pays out
                    case 'upfront_rental':
                      return terms.fixedFee || 0; // positive — venue receives rental fee
                    case 'access_only':
                    default:
                      return terms.accessFee || 0;
                  }
                })();
                return (
                  <Card key={offer.id} className="border-amber-200 dark:border-amber-800">
                    <CardContent className="p-5">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">{offer.title}</h3>
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                              <Clock className="w-3 h-3 mr-1" />Incoming Offer
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

                          {/* Contract Object */}
                          <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border">
                            <p className="text-xs font-semibold text-gray-600 mb-2">Digital Handshake Contract</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                              <span className="text-gray-500">Model: <strong className="text-gray-900 dark:text-white">{modelLabels[contract.model] || contract.model || 'Access-Only'}</strong></span>
                              <span className="text-gray-500">Status: <strong className="capitalize">{contract.status || 'pending'}</strong></span>
                              <span className="text-gray-500">Platform: <strong>{platformPct}%</strong></span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-500 mt-2">
                              {contract.model === 'fixed_fee' && <span>Flat Fee: <strong>{formatMoney(terms.fixedFee)}</strong></span>}
                              {contract.model === 'per_head' && <span>Per Head: <strong>{formatMoney(terms.perHeadAmount)}</strong></span>}
                              {contract.model === 'minimum_spend' && <span>Minimum Spend: <strong>{formatMoney(terms.minimumSpend)}</strong></span>}
                              {contract.model === 'revenue_share' && <span>Revenue Share: <strong>{terms.revenueSharePct || 0}%</strong></span>}
                              {contract.model === 'access_only' && <span>Access Fee: <strong>{formatMoney(terms.accessFee)}</strong></span>}
                              {contract.model === 'venue_sponsored' && <span>Sponsorship Fee (you pay): <strong className="text-orange-600">{formatMoney(terms.fixedFee)}</strong></span>}
                              {contract.model === 'upfront_rental' && <span>Rental Fee (creator pays you): <strong className="text-green-600">{formatMoney(terms.fixedFee)}</strong></span>}
                              <span>Risk: <strong>{risk.requireMinimumParticipants ? `MVG ${risk.minimumParticipants || 0}` : 'No MVG required'}</strong></span>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              {contract.model === 'venue_sponsored'
                                ? <>Sponsorship cost to you: <strong className="text-orange-600">{formatMoney(terms.fixedFee || 0)}</strong></>
                                : contract.model === 'upfront_rental'
                                  ? <>Rental income from creator: <strong className="text-green-600">{formatMoney(terms.fixedFee || 0)}</strong></>
                                  : <>Est. venue payout if full: <strong className="text-green-600">{formatMoney(venuePayoutPreview)}</strong></>
                              }
                            </p>
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

                      {venue.status === 'rejected' && (() => {
                        const count = venue.rejectionCount ?? 0;
                        const locked = count >= 3;
                        return (
                          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-red-700">Rejected by admin</p>
                                {venue.reviewNotes && (
                                  <p className="text-xs text-red-600 mt-0.5">{venue.reviewNotes}</p>
                                )}
                              </div>
                              <span className="text-xs text-red-400 shrink-0">{count}/3</span>
                            </div>
                            {!locked && count >= 1 && (
                              <div className="flex items-start gap-1 rounded bg-amber-50 border border-amber-200 px-2 py-1.5">
                                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-amber-700">
                                  {count === 2
                                    ? "Warning: if rejected again you must create a new listing."
                                    : "If this offer is rejected 3 times, you will need to create a new offer."}
                                </p>
                              </div>
                            )}
                            {locked && (
                              <div className="flex items-start gap-1 rounded bg-red-100 border border-red-300 px-2 py-1.5">
                                <AlertTriangle className="h-3 w-3 text-red-600 mt-0.5 shrink-0" />
                                <p className="text-xs text-red-700 font-medium">Rejected 3 times. Please create a new listing.</p>
                              </div>
                            )}
                            {!locked && (
                              <Button
                                className="w-full bg-blue-600 hover:bg-blue-700"
                                size="sm"
                                onClick={() => resubmitVenue.mutate(venue.id)}
                                disabled={resubmitVenue.isPending}
                                data-testid="button-resubmit-venue"
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Submit Again
                              </Button>
                            )}
                          </div>
                        );
                      })()}
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

      {/* ── Offer to Host Modal ── */}
      <Dialog open={offerModal.open} onOpenChange={(open) => setOfferModal(m => ({ ...m, open }))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Offer to Host: {offerModal.event?.title}</DialogTitle>
            <DialogDescription>
              Submit your Commercial Model to the creator. They'll review all offers and accept one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Venue selector — only approved venues can be offered */}
            {venues.filter((v: any) => v.status === 'approved').length > 1 && (
              <div>
                <Label>Which venue are you offering?</Label>
                <Select value={offerForm.venueId} onValueChange={(v) => setOfferForm(f => ({ ...f, venueId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                  <SelectContent>
                    {venues.filter((v: any) => v.status === 'approved').map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Commercial Model selector */}
            <div>
              <Label>Commercial Model</Label>
              <Select value={offerForm.model} onValueChange={(v) => setOfferForm(f => ({ ...f, model: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="access_only">Access Only / Pay-at-Counter</SelectItem>
                  <SelectItem value="fixed_fee">Flat Fee (Creator pays Venue)</SelectItem>
                  <SelectItem value="per_head">Per Head</SelectItem>
                  <SelectItem value="minimum_spend">Minimum Spend</SelectItem>
                  <SelectItem value="revenue_share">Revenue Share (%)</SelectItem>
                  <SelectItem value="venue_sponsored">Venue-Sponsored (Venue pays Creator)</SelectItem>
                  <SelectItem value="upfront_rental">Upfront Rental (Creator pays Venue)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount field — changes based on selected model */}
            {offerForm.model === "fixed_fee" && (
              <div>
                <Label>Flat Fee (€)</Label>
                <Input type="number" min="0" placeholder="e.g. 500" value={offerForm.fixedFee} onChange={e => setOfferForm(f => ({ ...f, fixedFee: e.target.value }))} />
              </div>
            )}
            {offerForm.model === "per_head" && (
              <div>
                <Label>Per Head Amount (€)</Label>
                <Input type="number" min="0" placeholder="e.g. 10" value={offerForm.perHeadAmount} onChange={e => setOfferForm(f => ({ ...f, perHeadAmount: e.target.value }))} />
              </div>
            )}
            {offerForm.model === "minimum_spend" && (
              <div>
                <Label>Minimum Spend (€)</Label>
                <Input type="number" min="0" placeholder="e.g. 200" value={offerForm.minimumSpend} onChange={e => setOfferForm(f => ({ ...f, minimumSpend: e.target.value }))} />
              </div>
            )}
            {offerForm.model === "revenue_share" && (
              <div>
                <Label>Revenue Share (%)</Label>
                <Input type="number" min="0" max="100" placeholder="e.g. 20" value={offerForm.revenueSharePct} onChange={e => setOfferForm(f => ({ ...f, revenueSharePct: e.target.value }))} />
              </div>
            )}
            {offerForm.model === "access_only" && (
              <div>
                <Label>Access Fee (€, optional — 0 for fully free access)</Label>
                <Input type="number" min="0" placeholder="e.g. 0" value={offerForm.accessFee} onChange={e => setOfferForm(f => ({ ...f, accessFee: e.target.value }))} />
              </div>
            )}
            {offerForm.model === "venue_sponsored" && (
              <div>
                <Label>Sponsorship Fee (€) — amount you pay to the creator</Label>
                <Input type="number" min="1" placeholder="e.g. 200" value={offerForm.fixedFee} onChange={e => setOfferForm(f => ({ ...f, fixedFee: e.target.value }))} />
                <p className="text-xs text-gray-500 mt-1">You will be charged this amount via Stripe when you accept. Paid to the creator 7 days after the event.</p>
              </div>
            )}
            {offerForm.model === "upfront_rental" && (
              <div>
                <Label>Rental Fee (€) — amount the creator pays you upfront</Label>
                <Input type="number" min="1" placeholder="e.g. 500" value={offerForm.fixedFee} onChange={e => setOfferForm(f => ({ ...f, fixedFee: e.target.value }))} />
                <p className="text-xs text-gray-500 mt-1">The creator will be charged this rental fee via Stripe the moment they accept. You receive payment 7 days after the event.</p>
              </div>
            )}

            {/* Optional message */}
            <div>
              <Label>Message to Creator (optional)</Label>
              <Textarea
                placeholder="Introduce your space and why it's a great fit for this event…"
                rows={3}
                value={offerForm.message}
                onChange={e => setOfferForm(f => ({ ...f, message: e.target.value }))}
              />
            </div>

            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSubmitOffer}
              disabled={submitOffer.isPending || !offerForm.venueId || !offerForm.model}
            >
              <Send className="w-4 h-4 mr-2" />
              {submitOffer.isPending ? "Submitting…" : "Submit Offer to Creator"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
