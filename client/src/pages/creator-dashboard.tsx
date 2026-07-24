import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCreatorAuth } from "@/hooks/useRoleAuth";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getCoverImage, normalizeImageUrl } from "@/lib/utils";
import {
  Plus,
  DollarSign,
  Users,
  Calendar,
  TrendingUp,
  Eye,
  Edit,
  Trash2,
  Archive,
  Gift,
  Clock,
  CheckCircle,
  XCircle,
  Building,
  MapPin,
  AlertCircle,
  Send,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import { formatPromotionDealTerms } from "@/lib/promotionDeals";
import EmbeddedPricingCalculator from "@/components/embedded-pricing-calculator";
import ProtectedRoute from "@/components/ProtectedRoute";
import Breadcrumb from "@/components/Breadcrumb";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import DashboardGuard from "@/components/DashboardGuard";

// Currency formatting helper
// DATA CONTRACT: Currency must come from experience.currency - default EUR for migration
const formatCurrency = (amount: number | string | undefined | null, currency?: string | null) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  if (!currency) {
    console.warn('[DataContract] Currency missing - using EUR for legacy data migration');
  }
  const currencyCode = (currency || 'EUR').toUpperCase(); // Default EUR for existing data migration
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
  };
  const symbol = symbols[currencyCode] || currencyCode + ' ';
  return `${symbol}${numAmount.toFixed(2)}`;
};

// Onboarding Checklist Component
interface OnboardingChecklistProps {
  checklist: any;
  progress: any;
  onComplete: () => void;
}

function OnboardingChecklist({ checklist, progress, onComplete }: OnboardingChecklistProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const updateStep = useMutation({
    mutationFn: async ({ step, data }: { step: string; data?: any }) => {
      return await apiRequest("POST", "/api/creator/onboard", { step, data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/onboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creator-profile"] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: "Failed to update progress. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Start (or resume) Stripe Connect onboarding and send the creator to Stripe's
  // hosted flow. The previous implementation only created an account server-side and
  // never redirected, so verification could never actually complete.
  const connectStripe = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/connect-url", {
        returnPath: "/creator-dashboard?tab=earnings",
      });
      return res.json();
    },
    onSuccess: (data: { url?: string }) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't open Stripe",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleStripeConnect = () => connectStripe.mutate();

  const getStepIcon = (step: string, completed: boolean) => {
    const icons = {
      profile: completed ? <CheckCircle className="w-6 h-6 text-green-500" /> : <Users className="w-6 h-6 text-gray-400" />,
      payout: completed ? <CheckCircle className="w-6 h-6 text-green-500" /> : <DollarSign className="w-6 h-6 text-gray-400" />,
      venue: completed ? <CheckCircle className="w-6 h-6 text-green-500" /> : <Calendar className="w-6 h-6 text-gray-400" />,
      firstEvent: completed ? <CheckCircle className="w-6 h-6 text-green-500" /> : <Plus className="w-6 h-6 text-gray-400" />
    };
    return icons[step as keyof typeof icons];
  };

  const getStepAction = (step: string, stepData: any) => {
    switch (step) {
      case 'profile':
        return stepData.completed ? (
          <Badge className="bg-green-100 text-green-800">Complete</Badge>
        ) : (
          <Button size="sm" onClick={() => setLocation('/creator/profile-setup')}>
            Complete Profile
          </Button>
        );
      case 'payout':
        return stepData.completed ? (
          <Badge className="bg-green-100 text-green-800">Connected</Badge>
        ) : (
          <Button size="sm" onClick={handleStripeConnect} disabled={connectStripe.isPending}>
            {connectStripe.isPending ? 'Connecting...' : 'Connect Payments'}
          </Button>
        );
      case 'venue':
        return stepData.completed ? (
          <Badge className="bg-green-100 text-green-800">{stepData.data.venuesCreated} Venues</Badge>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setLocation('/venues')}>
            Add Venue
          </Button>
        );
      case 'firstEvent':
        return stepData.completed ? (
          <Badge className="bg-green-100 text-green-800">{stepData.data.experiencesCreated} Created</Badge>
        ) : (
          <Button size="sm" onClick={() => setLocation('/event-builder')}>
            Create First Experience
          </Button>
        );
      default:
        return null;
    }
  };

  const stepTitles = {
    profile: "Creator Profile",
    payout: "Payment Setup", 
    venue: "Venue Setup",
    firstEvent: "First Experience"
  };

  const stepDescriptions = {
    profile: "Complete your basic creator profile with bio and contact details",
    payout: "Connect your Stripe account to receive payments",
    venue: "Add at least one venue where you'll host experiences",
    firstEvent: "Create your first experience to start accepting bookings"
  };

  // Check if onboarding is complete
  if (progress.percentage === 100) {
    onComplete();
    return null;
  }

  return (
    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
      <CardHeader>
        <CardTitle className="text-blue-800 dark:text-blue-200">Creator Onboarding</CardTitle>
        <CardDescription className="text-blue-700 dark:text-blue-300">
          Complete these steps to unlock the Journey Builder and start creating experiences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600 dark:text-gray-400">Onboarding Progress</span>
            <span className="font-medium">{progress.completed} of {progress.total} complete</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500" 
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Complete all steps to unlock the Journey Builder
          </p>
        </div>

        {/* Checklist Items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(checklist).map(([step, stepData]: [string, any]) => (
            <Card key={step} className={`transition-all ${stepData.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    {getStepIcon(step, stepData.completed)}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div>
                      <h4 className="font-medium">{stepTitles[step as keyof typeof stepTitles]}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {stepDescriptions[step as keyof typeof stepDescriptions]}
                      </p>
                    </div>
                    <div className="flex justify-between items-center">
                      {getStepAction(step, stepData)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Call-to-action for next step */}
        {progress.percentage > 0 && progress.percentage < 100 && (
          <Card className="bg-gradient-to-r from-purple-500 to-blue-500 text-white border-0">
            <CardContent className="p-6 text-center">
              <h3 className="text-lg font-semibold mb-2">You're {progress.percentage}% Complete!</h3>
              <p className="mb-4">
                {progress.completed === 3 ? "Just one more step to unlock the Event Builder!" : "Keep going to unlock experience creation"}
              </p>
              <Button variant="secondary" onClick={() => setLocation('/event-builder')}>
                Start Event Builder
              </Button>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

// ── Payouts: Stripe Connect status + actions ────────────────────────────────
type ConnectStatus = {
  connected: boolean;
  status: 'not_connected' | 'incomplete' | 'pending' | 'verified';
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirementsDue?: string[];
};

function PayoutsConnectCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<ConnectStatus>({
    queryKey: ["/api/stripe/connect-status"],
  });

  // Handle the redirect back from Stripe's hosted onboarding and refresh status.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("stripe_success") === "true";
    const refresh = params.get("stripe_refresh") === "true";
    if (success || refresh) {
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/connect-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/onboard"] });
      if (success) {
        toast({ title: "Stripe updated", description: "We've refreshed your payout status." });
      }
      params.delete("stripe_success");
      params.delete("stripe_refresh");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/connect-url", {
        returnPath: "/creator-dashboard?tab=earnings",
      });
      return res.json();
    },
    onSuccess: (data: { url?: string }) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (error: any) =>
      toast({ title: "Couldn't open Stripe", description: error?.message || "Please try again.", variant: "destructive" }),
  });

  const openDashboard = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/dashboard-link");
      return res.json();
    },
    onSuccess: (data: { url?: string }) => {
      if (data?.url) window.open(data.url, "_blank", "noopener");
    },
    onError: (error: any) =>
      toast({ title: "Couldn't open Stripe dashboard", description: error?.message || "Please try again.", variant: "destructive" }),
  });

  const st: ConnectStatus['status'] = status?.status ?? "not_connected";
  const meta: Record<ConnectStatus['status'], { badge: JSX.Element; icon: JSX.Element; title: string; body: string; cta: string }> = {
    not_connected: {
      badge: <Badge className="bg-gray-200 text-gray-800">Not connected</Badge>,
      icon: <DollarSign className="w-6 h-6 text-purple-600" />,
      title: "Connect your Stripe account to get paid",
      body: "Payouts from your experiences are sent to your own Stripe account. Connect it once to start receiving money — it takes about 2 minutes.",
      cta: "Connect Stripe account",
    },
    incomplete: {
      badge: <Badge className="bg-amber-100 text-amber-800">Setup unfinished</Badge>,
      icon: <AlertCircle className="w-6 h-6 text-amber-600" />,
      title: "Finish setting up your payouts",
      body: "Your Stripe onboarding was started but not completed. Finish it so we can send your earnings.",
      cta: "Finish Stripe setup",
    },
    pending: {
      badge: <Badge className="bg-blue-100 text-blue-800">Verifying</Badge>,
      icon: <Clock className="w-6 h-6 text-blue-600" />,
      title: "Stripe is verifying your details",
      body: "Your information is submitted and under review by Stripe. This usually clears quickly — add any missing details below if prompted.",
      cta: "Update details",
    },
    verified: {
      badge: <Badge className="bg-green-100 text-green-800">Connected &amp; ready</Badge>,
      icon: <CheckCircle className="w-6 h-6 text-green-600" />,
      title: "You're all set to receive payouts",
      body: "Your Stripe account is verified and payouts are enabled. Earnings are paid out 7 days after each event ends.",
      cta: "Open Stripe dashboard",
    },
  };
  const view = meta[st];
  const isVerified = st === "verified";
  const busy = connect.isPending || openDashboard.isPending;

  return (
    <Card className="border-purple-200 bg-purple-50/60 dark:bg-purple-950/30 dark:border-purple-800" data-testid="card-stripe-connect">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            {view.icon}
            Payouts — Stripe Connect
          </CardTitle>
          {isLoading ? <Badge variant="outline">Checking…</Badge> : view.badge}
        </div>
        <CardDescription>{view.title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">{view.body}</p>

        {!isVerified && (status?.requirementsDue?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
            Stripe still needs: {status!.requirementsDue!.map((r) => r.replace(/[._]/g, " ")).join(", ")}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => (isVerified ? openDashboard.mutate() : connect.mutate())}
            disabled={busy}
            data-testid="button-stripe-connect"
          >
            {busy ? "Opening…" : view.cta}
          </Button>
          {isVerified && (
            <Button variant="outline" onClick={() => connect.mutate()} disabled={busy}>
              Update bank details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CreatorDashboardContent() {
  const { user, isAuthenticated, isLoading: authLoading, hasRequiredRole } = useCreatorAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const breadcrumbs = useBreadcrumbs();

  // Check if creator profile exists
  const { data: creatorProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['/api/creator-profile'],
    enabled: isAuthenticated,
    retry: false
  });

  // Get onboarding checklist data
  const { data: onboardingData, isLoading: onboardingLoading } = useQuery({
    queryKey: ['/api/creator/onboard'],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false
  });

  // Creator experiences query
  const { data: experiences = [], isLoading: experiencesLoading } = useQuery({
    queryKey: ["/api/creator/experiences"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  });

  // Creator pending experiences query
  const { data: pendingExperiences = [], isLoading: pendingExperiencesLoading } = useQuery({
    queryKey: ["/api/creator/experiences/pending"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  });

  // Creator analytics query
  const { data: analytics = {}, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/creator/analytics/30"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  });

  // Creator earnings query
  const { data: earnings = {}, isLoading: earningsLoading } = useQuery({
    queryKey: ["/api/creator/earnings/30"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  });

  // Task 4 — Creator Ledger (real split-based earnings)
  const { data: ledger = { totalSales: 0, myShare: 0, platformFees: 0, spaceShare: 0, bookingsCount: 0 } } = useQuery({
    queryKey: ["/api/creator/ledger"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  }) as { data: any };

  // Revenue analytics query
  const { data: revenueAnalytics = {}, isLoading: revenueLoading } = useQuery({
    queryKey: ["/api/creator/revenue-analytics"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  });

  // Experience drafts query - fetch creator's saved drafts
  const { data: experienceDrafts = [], isLoading: draftsLoading } = useQuery({
    queryKey: ["/api/experience-drafts"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  });

  // Creator venues query
  const { data: venues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ["/api/venues/my"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  });

  // Incoming venue bids for open events (Reverse Handshake)
  const { data: venueOffers = [], isLoading: venueOffersLoading } = useQuery({
    queryKey: ["/api/creator/venue-offers"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  }) as { data: any[], isLoading: boolean };

  // Accepted/confirmed venue deals
  const { data: acceptedVenueDeals = [] } = useQuery({
    queryKey: ["/api/creator/venue-offers/accepted"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  }) as { data: any[] };

  const { data: roleApplications = [], isLoading: roleApplicationsLoading } = useQuery({
    queryKey: ["/api/creator/role-applications"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
    refetchOnMount: "always",
  }) as { data: any[]; isLoading: boolean };

  const { data: approvedRoles = [], isLoading: approvedRolesLoading } = useQuery({
    queryKey: ["/api/creator/approved-roles"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
    refetchOnMount: "always",
  }) as { data: any[]; isLoading: boolean };

  const resolveRoleApplication = useMutation({
    mutationFn: async ({ assignmentId, action }: { assignmentId: string; action: "approve" | "decline" }) => {
      const response = await apiRequest("POST", `/api/creator/role-applications/${assignmentId}/${action}`, {});
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/role-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/approved-roles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/experiences"] });
      toast({
        title: variables.action === "approve" ? "Role Approved" : "Application Declined",
        description: variables.action === "approve"
          ? "The participant is confirmed and has been notified."
          : "The participant has been notified.",
      });
    },
    onError: (error: any) => toast({
      title: "Could not update application",
      description: error?.message || "Please try again.",
      variant: "destructive",
    }),
  });

  const acceptVenueOffer = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await apiRequest("POST", `/api/creator/venue-offers/${offerId}/accept`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.requiresPayment && data.checkoutUrl) {
        // Upfront Rental: redirect creator to Stripe to pay the venue rental fee
        toast({ title: "Rental Payment Required", description: data.message || "Complete payment to activate the event." });
        window.location.href = data.checkoutUrl;
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/creator/venue-offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/venue-offers/accepted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/experiences"] });
      toast({
        title: data.awaitingVenuePayment ? "Counter Accepted" : "Venue Linked!",
        description: data.message || (data.awaitingVenuePayment
          ? "The venue can now complete its sponsorship payment."
          : "The venue has been confirmed for your event."),
      });
    },
    onError: () => toast({ title: "Error", description: "Failed to accept offer", variant: "destructive" }),
  });

  const declineVenueOffer = useMutation({
    mutationFn: (offerId: string) => apiRequest("POST", `/api/creator/venue-offers/${offerId}/decline`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/venue-offers"] });
      toast({ title: "Offer Declined", description: "The venue owner has been notified." });
    },
    onError: () => toast({ title: "Error", description: "Failed to decline offer", variant: "destructive" }),
  });

  // Promotion Deals — Digital Handshake for promoters/brands (Part 3)
  const { data: promotionDeals = [], isLoading: promotionDealsLoading } = useQuery({
    queryKey: ["/api/creator/promotion-deals"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  }) as { data: any[], isLoading: boolean };

  const { data: perkFulfillments = [], isLoading: perkFulfillmentsLoading } = useQuery({
    queryKey: ["/api/creator/perk-fulfillments"],
    enabled: isAuthenticated && !!creatorProfile,
    retry: false,
  }) as { data: any[]; isLoading: boolean };

  const updatePerkFulfillment = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "unlocked" | "fulfilled" }) => {
      const response = await apiRequest("PATCH", `/api/creator/perk-fulfillments/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/perk-fulfillments"] });
      toast({
        title: "Perk Fulfilled",
        description: "The reward is now recorded as delivered.",
      });
    },
    onError: (error: any) => toast({
      title: "Could not update fulfillment",
      description: error?.message || "Please try again.",
      variant: "destructive",
    }),
  });

  const respondToPromotionDeal = useMutation({
    mutationFn: async ({ dealId, action }: { dealId: string; action: 'accept' | 'decline' }) => {
      const response = await apiRequest("POST", `/api/creator/promotion-deals/${dealId}/${action}`, {});
      return response.json() as Promise<{ status?: string; dealType?: string }>;
    },
    onSuccess: (data, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/promotion-deals"] });
      toast({
        title: action === 'accept' ? "Counter Offer Accepted" : "Counter Offer Declined",
        description: action === 'accept'
          ? data.status === 'pending_payment'
            ? "Terms approved. The brand has been asked to complete sponsorship payment."
            : "The partner now has a tracking link for this experience."
          : "The partner has been notified.",
      });
    },
    onError: () => toast({ title: "Error", description: "Failed to respond to counter offer", variant: "destructive" }),
  });

  // Delete draft mutation
  const deleteDraft = useMutation({
    mutationFn: async (draftId: string) => {
      return await apiRequest("DELETE", `/api/experience-drafts/${draftId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experience-drafts"] });
      toast({
        title: "Draft Deleted",
        description: "Draft has been successfully deleted.",
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
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Delete Failed",
        description: "Failed to delete draft. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Published experiences are archived so their financial and contract history remains intact.
  const archiveExperience = useMutation({
    mutationFn: async (experienceId: string) => {
      return await apiRequest("PATCH", `/api/creator/experiences/${experienceId}/archive`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creator/experiences"] });
      toast({
        title: "Experience Archived",
        description: "It is hidden from active listings while its records remain available for audit.",
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
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Archive Failed",
        description: "Failed to archive experience. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Helper function - must be after all hooks
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "published":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Published</Badge>;
      case "pending":
      case "pending_approval":
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case "cancelled":
        return <Badge className="bg-gray-100 text-gray-700"><Archive className="w-3 h-3 mr-1" />Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Type the data for better TypeScript support
  const typedExperiences = (experiences as any[]).filter((exp: any) =>
    exp.status !== 'pending_approval' && exp.status !== 'pending' && !exp.archivedAt
  );
  const visibleFulfillments = perkFulfillments.filter((item: any) => item.status !== "voided");
  const typedAnalytics = analytics as any;
  const typedEarnings = earnings as any;
  const typedRevenueAnalytics = revenueAnalytics as any;

  const isLoading = authLoading || profileLoading || onboardingLoading || experiencesLoading || pendingExperiencesLoading || analyticsLoading || earningsLoading || revenueLoading || draftsLoading;

  // Determine states
  const isFirstTimeCreator = onboardingData && (onboardingData as any)?.progress?.percentage < 100;
  const isReturningCreator = onboardingData && (onboardingData as any)?.progress?.percentage === 100;

  // Now handle conditional rendering AFTER all hooks are called
  
  // Show loading state during authentication check
  if (authLoading || profileLoading || onboardingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    window.location.href = '/api/login';
    return null;
  }

  // Redirect participants and non-creator roles to home
  if (!authLoading && !hasRequiredRole) {
    setLocation('/');
    return null;
  }

  // Show profile setup prompt if no creator profile exists or profile is not completed
  if (!creatorProfile || !(creatorProfile as any)?.completed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="pt-20 pb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                Complete Your Creator Profile
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                To access your creator dashboard, you need to complete your creator profile setup first.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  onClick={() => setLocation('/creator/profile-setup')}
                  data-testid="button-complete-creator-profile"
                >
                  Complete Creator Profile
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={() => setLocation('/creator/earnings')}
                  data-testid="button-learn-more"
                >
                  Learn More
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb items={breadcrumbs} className="mb-6" />
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Creator Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage your experiences and track your earnings</p>
        </div>

        {/* Task 4 — Ledger: Total Sales vs My Share */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border border-green-200 dark:border-green-800">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Sales</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">${ledger.totalSales?.toFixed(2)}</p>
            <p className="text-xs text-gray-500">{ledger.bookingsCount} booking{ledger.bookingsCount !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My Share</p>
            <p className="text-2xl font-bold text-green-600">${ledger.myShare?.toFixed(2)}</p>
            <p className="text-xs text-gray-500">Based on accepted creatorPct</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform Fees</p>
            <p className="text-2xl font-bold text-gray-600">${ledger.platformFees?.toFixed(2)}</p>
            <p className="text-xs text-gray-500">15% fixed fee</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Space Share</p>
            <p className="text-2xl font-bold text-blue-600">${ledger.spaceShare?.toFixed(2)}</p>
            <p className="text-xs text-gray-500">Paid to venue partners</p>
          </div>
        </div>

        {/* Revenue Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Net Earnings</p>
                  <p className="text-2xl font-bold">
                    {earningsLoading ? '...' : formatCurrency((typedEarnings.summary?.totalEarnings || 0) / 100, 'EUR')}
                  </p>
                  <p className="text-xs text-gray-500">After all fees</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Gross Revenue</p>
                  <p className="text-2xl font-bold">
                    {earningsLoading ? '...' : formatCurrency((typedEarnings.summary?.totalGross || 0) / 100, 'EUR')}
                  </p>
                  <p className="text-xs text-gray-500">{typedEarnings.summary?.bookingsCount || 0} bookings</p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Platform Fees</p>
                  <p className="text-2xl font-bold">
                    {earningsLoading ? '...' : formatCurrency((typedEarnings.summary?.totalPlatformFees || 0) / 100, 'EUR')}
                  </p>
                  <p className="text-xs text-gray-500">15% platform fee</p>
                </div>
                <Calendar className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg. Booking</p>
                  <p className="text-2xl font-bold">
                    {earningsLoading ? '...' : formatCurrency((typedEarnings.summary?.averageBookingValue || 0) / 100, 'EUR')}
                  </p>
                  <p className="text-xs text-gray-500">Per booking value</p>
                </div>
                <TrendingUp className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") || (isFirstTimeCreator ? "setup" : "experiences")} className="space-y-6">
          <TabsList className="h-auto flex-wrap justify-start">
            {isFirstTimeCreator ? <TabsTrigger value="setup">Complete Setup</TabsTrigger> : null}
            <TabsTrigger value="experiences">My Experiences</TabsTrigger>
            <TabsTrigger value="role-applications" className="relative">
              Role Applications
              {roleApplications.length > 0 && (
                <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs text-white">
                  {roleApplications.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="venue-offers" className="relative">
              Venue Offers
              {venueOffers.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-xs w-5 h-5">
                  {venueOffers.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="active-deals" className="relative">
              Active Deals
              {acceptedVenueDeals.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-green-600 text-white text-xs w-5 h-5">
                  {acceptedVenueDeals.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="promotion-deals" className="relative">
              Promotion Deals
              {promotionDeals.filter((d: any) => d.status === 'countered' && d.pendingActionBy === 'creator').length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-pink-500 text-white text-xs w-5 h-5">
                  {promotionDeals.filter((d: any) => d.status === 'countered' && d.pendingActionBy === 'creator').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="fulfillment" className="relative">
              Fulfillment
              {perkFulfillments.filter((item: any) => item.status === "unlocked").length > 0 && (
                <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs text-white">
                  {perkFulfillments.filter((item: any) => item.status === "unlocked").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-6">
            {onboardingData ? (
              <OnboardingChecklist 
                checklist={(onboardingData as any)?.checklist || {}}
                progress={(onboardingData as any)?.progress || {}}
                onComplete={() => {
                  toast({
                    title: "Setup Complete!",
                    description: "You can now create experiences and start earning.",
                  });
                  setLocation('/event-builder');
                }}
              />
            ) : (
              <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
                <CardContent className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                  <p>Loading onboarding checklist...</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="experiences" className="space-y-6">
            {/* Show setup reminder for first-time creators but don't block drafts */}
            {isFirstTimeCreator && (experienceDrafts as any[]).length === 0 && (
              <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
                <CardContent className="text-center py-12">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Calendar className="w-8 h-8 text-orange-600" />
                  </div>
                  <h3 className="text-lg font-medium text-orange-800 dark:text-orange-200 mb-2">Complete Setup First</h3>
                  <p className="text-orange-700 dark:text-orange-300 mb-4">
                    Finish your creator onboarding to unlock experience creation
                  </p>
                  <Button onClick={() => {
                    const setupTab = document.querySelector('[value="setup"]') as HTMLElement;
                    setupTab?.click();
                  }}>
                    Continue Setup
                  </Button>
                </CardContent>
              </Card>
            )}
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">My Experiences</h2>
                <Button 
                  onClick={() => setLocation('/event-builder')}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create New Experience
                </Button>
              </div>

              {/* Drafts Section */}
              {(experienceDrafts as any[]).length > 0 && (
                <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
                  <CardHeader>
                    <CardTitle className="text-blue-800 dark:text-blue-200 flex items-center gap-2">
                      <Edit className="w-5 h-5" />
                      Drafts ({(experienceDrafts as any[]).length})
                    </CardTitle>
                    <CardDescription className="text-blue-700 dark:text-blue-300">
                      Continue editing your saved drafts or submit them for approval
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {(experienceDrafts as any[]).map((draft: any) => (
                        <Card key={draft.id} className="bg-white dark:bg-gray-800 border-blue-200">
                          <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-t-lg">
                            {getCoverImage(draft.coverImageUrl, draft.gallery) ? (
                              <img 
                                src={getCoverImage(draft.coverImageUrl, draft.gallery) || ''} 
                                alt={draft.title || 'Draft'}
                                className="w-full h-full object-cover rounded-t-lg"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Edit className="w-8 h-8 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-semibold text-sm truncate" data-testid={`text-draft-title-${draft.id}`}>
                                {draft.title || 'Untitled Draft'}
                              </h3>
                              <Badge className="bg-blue-100 text-blue-800">
                                <Edit className="w-3 h-3 mr-1" />
                                Draft
                              </Badge>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400 text-xs mb-3 line-clamp-2">
                              {draft.description || 'No description yet'}
                            </p>
                            <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                              <span>{draft.category || 'No category'}</span>
                              <span>Updated {new Date(draft.updatedAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => setLocation(`/event-builder/${draft.id}`)}
                                className="flex-1 text-xs"
                                data-testid={`button-continue-draft-${draft.id}`}
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Continue Editing
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteDraft.mutate(draft.id)}
                                disabled={deleteDraft.isPending}
                                data-testid={`button-delete-draft-${draft.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Pending Experiences Section */}
              {(pendingExperiences as any[]).length > 0 && (
                <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800">
                  <CardHeader>
                    <CardTitle className="text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Pending Approval ({(pendingExperiences as any[]).length})
                    </CardTitle>
                    <CardDescription className="text-yellow-700 dark:text-yellow-300">
                      These experiences are awaiting admin approval before they can be published
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {(pendingExperiences as any[]).map((experience: any) => (
                        <Card key={experience.id} className="bg-white dark:bg-gray-800 border-yellow-200">
                          <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-t-lg overflow-hidden">
                            {getCoverImage(experience.coverImageUrl, experience.gallery) ? (
                              <img 
                                src={getCoverImage(experience.coverImageUrl, experience.gallery) || ''} 
                                alt={experience.title}
                                className="w-full h-full object-cover"
                                data-testid={`img-pending-cover-${experience.id}`}
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-yellow-100 to-orange-100 dark:from-yellow-900 dark:to-orange-900 flex items-center justify-center">
                                <Calendar className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                              </div>
                            )}
                          </div>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-semibold text-sm truncate" data-testid={`text-pending-title-${experience.id}`}>
                                {experience.title}
                              </h3>
                              {getStatusBadge(experience.status)}
                            </div>
                            <p className="text-gray-600 dark:text-gray-400 text-xs mb-3 line-clamp-2">
                              {experience.description}
                            </p>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {experience.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {experience.category.replace(/_/g, ' ')}
                                </Badge>
                              )}
                            </div>
                            <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                              <span className="font-medium">{formatCurrency(experience.price, experience.currency)}</span>
                              <span>
                                <Users className="w-3 h-3 inline mr-1" />
                                {experience.maxParticipants || experience.capacity || '—'} capacity
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLocation(`/experiences/${experience.id}`)}
                                className="flex-1 text-xs"
                                data-testid={`button-view-pending-${experience.id}`}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                Preview
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLocation(`/event-builder?edit=${experience.id}`)}
                                className="flex-1 text-xs"
                                data-testid={`button-edit-pending-${experience.id}`}
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                title="Archive experience"
                                aria-label={`Archive ${experience.title}`}
                                onClick={() => {
                                  if (window.confirm(`Archive "${experience.title}"? It will be removed from the approval queue.`)) {
                                    archiveExperience.mutate(experience.id);
                                  }
                                }}
                                disabled={archiveExperience.isPending}
                              >
                                <Archive className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {experiencesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                </div>
              ) : typedExperiences.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No experiences yet</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">Start creating amazing experiences for your community</p>
                    <Button onClick={() => setLocation('/event-builder')}>
                      Create Your First Experience
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {typedExperiences.map((experience: any) => (
                    <Card key={experience.id} className="overflow-hidden" data-testid={`card-experience-${experience.id}`}>
                      <div className="aspect-video bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        {getCoverImage(experience.coverImageUrl, experience.gallery) ? (
                          <img 
                            src={getCoverImage(experience.coverImageUrl, experience.gallery) || ''} 
                            alt={experience.title}
                            className="w-full h-full object-cover"
                            data-testid={`img-experience-cover-${experience.id}`}
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 flex items-center justify-center">
                            <Calendar className="w-12 h-12 text-primary" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-lg truncate">{experience.title}</h3>
                          <div className="flex items-center gap-1">
                            {(experience as any).lifecycleStatus === 'forming' && (
                              <Badge className="bg-amber-100 text-amber-800 text-xs">Forming</Badge>
                            )}
                            {(experience as any).lifecycleStatus === 'confirmed' && (experience as any).requireMinimumParticipants && (
                              <Badge className="bg-green-100 text-green-800 text-xs">Confirmed</Badge>
                            )}
                            {(experience as any).lifecycleStatus === 'cancelled' && (
                              <Badge className="bg-red-100 text-red-800 text-xs">Cancelled</Badge>
                            )}
                            {getStatusBadge(experience.status)}
                          </div>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
                          {experience.description}
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {experience.category && (
                            <Badge variant="secondary" className="text-xs">
                              {experience.category.replace(/_/g, ' ')}
                            </Badge>
                          )}
                          {experience.type && (
                            <Badge variant="outline" className="text-xs">
                              {experience.type}
                            </Badge>
                          )}
                        </div>
                        {/* Pricing from ticketSkus (source of truth) */}
                        <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
                          <span className="font-medium" data-testid={`text-price-${experience.id}`}>
                            {(() => {
                              const skus = experience.ticketSkus || [];
                              if (skus.length > 0) {
                                const prices = skus.map((s: any) => parseFloat(s.pricePerPerson || 0)).filter((p: number) => p > 0);
                                if (prices.length > 0) {
                                  const minPrice = Math.min(...prices);
                                  const hasMultiple = prices.length > 1 && new Set(prices).size > 1;
                                  return hasMultiple 
                                    ? `From ${formatCurrency(minPrice, experience.currency)}`
                                    : formatCurrency(minPrice, experience.currency);
                                }
                              }
                              return formatCurrency(experience.price, experience.currency);
                            })()}
                          </span>
                          <span>
                            <Users className="w-3 h-3 inline mr-1" />
                            {experience.participantCount || 0}/{experience.maxParticipants || experience.capacity || '∞'}
                          </span>
                        </div>
                        
                        {/* Fixed deposit display (not percentage) */}
                        {(experience.depositEnabled || (experience.depositAmount && parseFloat(experience.depositAmount) > 0) || (experience.ticketSkus && experience.ticketSkus.length > 0 && experience.ticketSkus[0]?.depositPerPerson)) && (
                          <div className="text-xs text-gray-500 mb-2" data-testid={`text-deposit-${experience.id}`}>
                            <span>Deposit: </span>
                            <span className="font-medium">
                              {(() => {
                                // Check for fixed deposit amount first (source of truth)
                                if (experience.depositAmount && parseFloat(experience.depositAmount) > 0) {
                                  return formatCurrency(experience.depositAmount, experience.currency);
                                }
                                // Check ticketSkus for deposit
                                const skus = experience.ticketSkus || [];
                                if (skus.length > 0 && skus[0].depositPerPerson && parseFloat(skus[0].depositPerPerson) > 0) {
                                  return formatCurrency(skus[0].depositPerPerson, experience.currency);
                                }
                                // DATA CONTRACT: No percentage fallback - use fixed amounts only
                                return 'Not set';
                              })()}
                            </span>
                          </div>
                        )}
                        
                        {/* MVG progress and deadline */}
                        {(experience.mvgEnabled || (experience.minimumParticipants && experience.minimumParticipants > 0)) && (
                          <div className="text-xs text-gray-500 mb-3" data-testid={`mvg-progress-text-${experience.id}`}>
                            <span className="flex items-center gap-1">
                              MVG: {experience.participantCount || experience.currentParticipants || 0}/{experience.mvgMinimumSize || experience.minimumParticipants || experience.mvgMin}
                              {(experience as any).lifecycleStatus === 'confirmed' ? (
                                <span data-testid={`mvg-status-indicator-${experience.id}`}>
                                  <CheckCircle className="w-3 h-3 text-green-500" />
                                </span>
                              ) : (experience as any).lifecycleStatus === 'cancelled' ? (
                                <span className="text-red-500" data-testid={`mvg-status-indicator-${experience.id}`}> ✗</span>
                              ) : (
                                <span className="text-orange-500" data-testid={`mvg-status-indicator-${experience.id}`}> ⏳</span>
                              )}
                            </span>
                            {experience.mvgDeadline && (
                              <span className="block mt-1" data-testid={`mvg-deadline-${experience.id}`}>
                                Deadline: {new Date(experience.mvgDeadline).toLocaleDateString()}
                              </span>
                            )}
                            {experience.mvgDeadlineDays && !experience.mvgDeadline && experience.startDate && (
                              <span className="block mt-1" data-testid={`mvg-deadline-${experience.id}`}>
                                Deadline: {experience.mvgDeadlineDays} days before start
                              </span>
                            )}
                            {experience.cancellationReason && (
                              <span className="block mt-1 text-red-600" data-testid={`cancellation-reason-${experience.id}`}>
                                {experience.cancellationReason}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/experiences/${experience.id}`)}
                            className="flex-1"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/event-builder?edit=${experience.id}`)}
                            className="flex-1"
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Archive experience"
                            aria-label={`Archive ${experience.title}`}
                            onClick={() => {
                              if (window.confirm(`Archive "${experience.title}"? It will be removed from active listings.`)) {
                                archiveExperience.mutate(experience.id);
                              }
                            }}
                            disabled={archiveExperience.isPending}
                          >
                            <Archive className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

          <TabsContent value="venues" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Marketplace Spaces</h2>
              <Button 
                onClick={() => setLocation('/venue-profile-setup')}
                className="flex items-center gap-2"
                data-testid="button-create-venue"
              >
                <Plus className="w-4 h-4" />
                Create New Venue
              </Button>
            </div>

            {venuesLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              </div>
            ) : (venues as any[]).length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No venues yet</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">Create a venue to host your experiences</p>
                  <Button onClick={() => setLocation('/venue-profile-setup')} data-testid="button-create-first-venue">
                    Create Your First Venue
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(venues as any[]).map((venue: any) => (
                  <Card key={venue.id} className="overflow-hidden" data-testid={`card-venue-${venue.id}`}>
                    <div className="aspect-video bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      {venue.logoUrl ? (
                        <img 
                          src={normalizeImageUrl(venue.logoUrl) || ''} 
                          alt={venue.name}
                          className="w-full h-full object-cover"
                          data-testid={`img-venue-logo-${venue.id}`}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900 dark:to-blue-900 flex items-center justify-center">
                          <Building className="w-12 h-12 text-primary" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg truncate" data-testid={`text-venue-name-${venue.id}`}>{venue.name}</h3>
                        {getStatusBadge(venue.status || 'draft')}
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
                        {venue.description}
                      </p>
                      <div className="flex items-center text-sm text-gray-500 mb-4">
                        <MapPin className="w-4 h-4 mr-1" />
                        <span className="truncate">{venue.city || venue.location || 'No location'}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(`/venues/${venue.slug || venue.id}`)}
                          className="flex-1"
                          data-testid={`button-view-venue-${venue.id}`}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(`/venue-profile-setup?edit=${venue.id}`)}
                          className="flex-1"
                          data-testid={`button-edit-venue-${venue.id}`}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Venue Offers Tab — Incoming Reverse Handshake bids ── */}
          <TabsContent value="role-applications" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Role Applications</h2>
              <p className="mt-1 text-sm text-gray-500">Approve or decline participants who applied for roles and gigs on your experiences.</p>
            </div>

            {roleApplicationsLoading ? (
              <div className="py-10 text-center text-gray-500">Loading applications...</div>
            ) : roleApplications.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
                  <p className="font-medium">No pending role applications</p>
                  <p className="mt-1 text-sm">New participant applications will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              roleApplications.map((row: any) => {
                const assignment = row.assignment || {};
                const applicant = row.applicant || {};
                const role = row.role || {};
                const experience = row.experience || {};
                const applicantName = [applicant.firstName, applicant.lastName].filter(Boolean).join(" ") || applicant.email || "Participant";
                return (
                  <Card key={assignment.id} className="border-amber-200 dark:border-amber-800">
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold">{applicantName}</h3>
                            <Badge className="border-amber-300 bg-amber-100 text-amber-800">Pending Review</Badge>
                          </div>
                          <p className="text-sm text-gray-600">
                            Applied for <strong>{role.name}</strong> on <strong>{experience.title}</strong>
                          </p>
                          {role.description && <p className="text-sm text-gray-500">{role.description}</p>}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            {applicant.email && <span>{applicant.email}</span>}
                            {assignment.appliedAt && <span>Applied {new Date(assignment.appliedAt).toLocaleDateString()}</span>}
                            <span>{role.currentCount || 0}/{role.maxCount || 1} roles filled</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 gap-2 md:flex-col">
                          <Button
                            className="flex-1 bg-green-600 text-white hover:bg-green-700 md:flex-none"
                            onClick={() => resolveRoleApplication.mutate({ assignmentId: assignment.id, action: "approve" })}
                            disabled={resolveRoleApplication.isPending}
                            data-testid={`button-approve-role-application-${assignment.id}`}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" />Approve
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 border-red-300 text-red-600 hover:bg-red-50 md:flex-none"
                            onClick={() => resolveRoleApplication.mutate({ assignmentId: assignment.id, action: "decline" })}
                            disabled={resolveRoleApplication.isPending}
                            data-testid={`button-decline-role-application-${assignment.id}`}
                          >
                            <XCircle className="mr-1 h-4 w-4" />Decline
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}

            <div className="pt-4">
              <h2 className="text-xl font-semibold">Approved Roles</h2>
              <p className="mt-1 text-sm text-gray-500">Confirmed staff for roles and gigs across your experiences.</p>
            </div>

            {approvedRolesLoading ? (
              <div className="py-10 text-center text-gray-500">Loading approved roles...</div>
            ) : approvedRoles.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  <CheckCircle className="mx-auto mb-3 h-12 w-12 opacity-30" />
                  <p className="font-medium">No approved staff yet</p>
                  <p className="mt-1 text-sm">Approved applications will stay visible here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {approvedRoles.map((row: any) => {
                  const assignment = row.assignment || {};
                  const applicant = row.applicant || {};
                  const role = row.role || {};
                  const experience = row.experience || {};
                  const applicantName = [applicant.firstName, applicant.lastName].filter(Boolean).join(" ") || applicant.email || "Participant";
                  return (
                    <Card key={assignment.id} className="border-green-200 dark:border-green-800">
                      <CardContent className="p-5">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold">{applicantName}</h3>
                            <Badge className="border-green-300 bg-green-100 text-green-800">Approved</Badge>
                          </div>
                          <p className="text-sm text-gray-600">
                            <strong>{role.name}</strong> on <strong>{experience.title}</strong>
                          </p>
                          {role.description && <p className="text-sm text-gray-500">{role.description}</p>}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            {applicant.email && <span>{applicant.email}</span>}
                            {assignment.confirmedAt && <span>Approved {new Date(assignment.confirmedAt).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="venue-offers" className="space-y-4">
            <h2 className="text-xl font-semibold">Incoming Venue Offers</h2>
            <p className="text-sm text-gray-500">
              Venue owners have submitted proposals for your open events or countered a direct invitation. Review their Commercial Model and accept the one that works for you.
              Accepting an offer links the venue to your event and activates the Stripe payment split.
            </p>

            {venueOffersLoading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                Loading offers…
              </div>
            ) : venueOffers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No venue offers yet</p>
                <p className="text-sm mt-1">Venue owners who are interested in hosting your open events will appear here.</p>
              </div>
            ) : (
              venueOffers.map((row: any) => {
                const offer = row.offer ?? row;
                const venue = row.venue ?? {};
                const experience = row.experience ?? {};
                const modelLabels: Record<string, string> = {
                  access_only: "Access Only / Pay-at-Counter",
                  fixed_fee: "Flat Fee",
                  per_head: "Per Head",
                  minimum_spend: "Minimum Spend",
                  revenue_share: "Revenue Share (%)",
                  venue_sponsored: "Venue-Sponsored (Venue pays You)",
                  upfront_rental: "Upfront Rental (You pay Venue)",
                };
                const terms = offer.terms ?? {};
                const currency = String(terms.currency || experience.currency || "EUR").toUpperCase();
                const formatMoney = (value: unknown) => new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency,
                  minimumFractionDigits: 2,
                }).format(Number(value || 0));
                return (
                  <Card key={offer.id} className="border-blue-200 dark:border-blue-800">
                    <CardContent className="p-5">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          {/* Experience + venue headline */}
                          <div>
                            <p className="text-xs text-gray-500 mb-1">
                              For event: <strong>{experience.title || offer.experienceId}</strong>
                              {experience.slug || experience.id ? (
                                <a
                                  href={`/experience/${experience.slug || experience.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 text-blue-600 hover:underline dark:text-blue-400"
                                  data-testid="link-view-event-details"
                                >
                                  View Event Details →
                                </a>
                              ) : null}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-lg">{venue.name || "Venue"}</h3>
                              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                                <AlertCircle className="w-3 h-3 mr-1" />Incoming Offer
                              </Badge>
                            </div>
                            {venue.city && (
                              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" />{venue.city}
                              </p>
                            )}
                          </div>

                          {/* Commercial terms */}
                          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border text-sm space-y-1">
                            <p className="text-xs font-semibold text-gray-600 mb-1">Proposed Commercial Model</p>
                            <p><span className="text-gray-500">Model:</span> <strong>{modelLabels[offer.model] ?? offer.model}</strong></p>
                            {offer.model === "fixed_fee" && <p><span className="text-gray-500">Flat Fee:</span> <strong>{formatMoney(terms.fixedFee)}</strong></p>}
                            {offer.model === "per_head" && <p><span className="text-gray-500">Per Head:</span> <strong>{formatMoney(terms.perHeadAmount)}</strong></p>}
                            {offer.model === "minimum_spend" && <p><span className="text-gray-500">Min. Spend:</span> <strong>{formatMoney(terms.minimumSpend)}</strong></p>}
                            {offer.model === "revenue_share" && <p><span className="text-gray-500">Revenue Share:</span> <strong>{terms.revenueSharePct ?? 0}%</strong></p>}
                            {offer.model === "access_only" && <p><span className="text-gray-500">Access Fee:</span> <strong>{formatMoney(terms.accessFee)}</strong></p>}
                            {offer.model === "venue_sponsored" && <p><span className="text-gray-500">Sponsorship (venue pays you):</span> <strong className="text-green-600">+{formatMoney(terms.fixedFee)}</strong></p>}
                            {offer.model === "upfront_rental" && (
                              <p><span className="text-gray-500">Rental fee (you pay upfront):</span> <strong className="text-orange-600">-{formatMoney(terms.fixedFee)}</strong>
                                <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Charged on Accept</span>
                              </p>
                            )}
                          </div>

                          {/* Optional message from venue owner */}
                          {offer.message && (
                            <p className="text-sm text-gray-600 italic border-l-2 border-blue-300 pl-3">"{offer.message}"</p>
                          )}
                        </div>

                        {/* Accept / Decline */}
                        <div className="flex md:flex-col gap-2 shrink-0">
                          <Button
                            className="bg-green-600 hover:bg-green-700 text-white flex-1 md:flex-none"
                            onClick={() => acceptVenueOffer.mutate(offer.id)}
                            disabled={acceptVenueOffer.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />Accept
                          </Button>
                          <Button
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 flex-1 md:flex-none"
                            onClick={() => declineVenueOffer.mutate(offer.id)}
                            disabled={declineVenueOffer.isPending}
                          >
                            <XCircle className="w-4 h-4 mr-1" />Decline
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}

            {/* Accepted deals live in their own tab so an agreed deal visibly leaves
                the Offers queue instead of lingering underneath it. */}
            {acceptedVenueDeals.length > 0 && (
              <p className="mt-6 rounded-lg border border-green-200 bg-green-50/60 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/10 dark:text-green-200">
                <CheckCircle className="mr-1 inline h-4 w-4" />
                {acceptedVenueDeals.length} accepted {acceptedVenueDeals.length === 1 ? "deal has" : "deals have"} moved to the <strong>Active Deals</strong> tab.
              </p>
            )}
          </TabsContent>

          {/* ── Active Deals Tab — venue agreements the creator has accepted ── */}
          <TabsContent value="active-deals" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Active Deals</h2>
              <p className="mt-1 text-sm text-gray-500">
                Venue agreements you've accepted. These are locked in and linked to your event — including counter-offers you agreed to.
              </p>
            </div>

            {acceptedVenueDeals.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No active deals yet</p>
                <p className="text-sm mt-1">Accept a venue offer and it will move here automatically.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {acceptedVenueDeals.map((row: any) => {
                  const offer = row.offer ?? row;
                  const venue = row.venue ?? {};
                  const exp = row.experience ?? {};
                  const modelLabels: Record<string, string> = {
                    access_only: "Access Only",
                    fixed_fee: "Flat Fee",
                    per_head: "Per Head",
                    minimum_spend: "Minimum Spend",
                    revenue_share: "Revenue Share (%)",
                    venue_sponsored: "Venue-Sponsored",
                    upfront_rental: "Upfront Rental",
                  };
                  const terms = offer.terms ?? {};
                  return (
                    <Card key={offer.id} className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">
                              Event: <strong>{exp.title || offer.experienceId}</strong>
                              {exp.slug || exp.id ? (
                                <a
                                  href={`/experience/${exp.slug || exp.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 text-blue-600 hover:underline dark:text-blue-400"
                                  data-testid="link-view-event-details"
                                >
                                  View Event Details →
                                </a>
                              ) : null}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{venue.name || "Venue"}</span>
                              {venue.city && <span className="text-sm text-gray-500">· {venue.city}</span>}
                              <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" />Confirmed
                              </Badge>
                            </div>
                          </div>
                          <div className="text-sm text-right shrink-0">
                            <span className="text-gray-500">Deal: </span>
                            <strong>{modelLabels[offer.model] ?? offer.model}</strong>
                            {offer.model === "fixed_fee" && <span className="ml-1 text-gray-600">— €{terms.fixedFee ?? 0}</span>}
                            {offer.model === "per_head" && <span className="ml-1 text-gray-600">— €{terms.perHeadAmount ?? 0}/head</span>}
                            {offer.model === "minimum_spend" && <span className="ml-1 text-gray-600">— €{terms.minimumSpend ?? 0} min</span>}
                            {offer.model === "revenue_share" && <span className="ml-1 text-gray-600">— {terms.revenueSharePct ?? 0}%</span>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Promotion Deals Tab — Digital Handshake for promoters/brands (Part 3) ── */}
          <TabsContent value="promotion-deals" className="space-y-4">
            <h2 className="text-xl font-semibold">Promotion Deals</h2>
            <p className="text-sm text-gray-500">
              Direct offers you've sent (Options A &amp; B) and marketplace counter offers from the public pool (Option C).
            </p>

            {promotionDealsLoading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                Loading promotion deals…
              </div>
            ) : promotionDeals.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Send className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No promotion deals yet</p>
                <p className="text-sm mt-1">Direct offers you send and marketplace counter offers will appear here.</p>
              </div>
            ) : (
              <>
                {/* Needs your response: countered marketplace bids */}
                {promotionDeals
                  .filter((deal: any) => deal.status === 'countered' && deal.pendingActionBy === 'creator')
                  .map((deal: any) => (
                    <Card key={deal.id} className="border-pink-200 dark:border-pink-800">
                      <CardContent className="p-5">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-lg">{deal.experienceTitle}</h3>
                              <Badge className="bg-pink-100 text-pink-800 border-pink-300">
                                <Clock className="w-3 h-3 mr-1" />Counter Offer
                              </Badge>
                              <a
                                href={`/experience/${deal.experienceSlug || deal.experienceId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                data-testid="link-view-event-details"
                              >
                                View Event Details →
                              </a>
                            </div>
                            <p className="text-sm text-gray-500">
                              From: <strong>{deal.partnerName || deal.partnerEmail || "A partner"}</strong>
                            </p>
                            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border text-sm space-y-1">
                              <p className="text-xs font-semibold text-gray-600 mb-1">Countered Terms</p>
                              <p>{formatPromotionDealTerms(deal.dealType, deal.terms)}</p>
                            </div>
                            {deal.counterMessage && (
                              <p className="text-sm text-gray-600 italic border-l-2 border-pink-300 pl-3">"{deal.counterMessage}"</p>
                            )}
                          </div>
                          <div className="flex md:flex-col gap-2 shrink-0">
                            <Button
                              className="bg-green-600 hover:bg-green-700 text-white flex-1 md:flex-none"
                              onClick={() => respondToPromotionDeal.mutate({ dealId: deal.id, action: 'accept' })}
                              disabled={respondToPromotionDeal.isPending}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />Accept
                            </Button>
                            <Button
                              variant="outline"
                              className="border-red-300 text-red-600 hover:bg-red-50 flex-1 md:flex-none"
                              onClick={() => respondToPromotionDeal.mutate({ dealId: deal.id, action: 'decline' })}
                              disabled={respondToPromotionDeal.isPending}
                            >
                              <XCircle className="w-4 h-4 mr-1" />Decline
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                {/* Sent direct offers still awaiting the partner's response */}
                {promotionDeals.some((deal: any) => deal.status === 'pending') && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-base">Sent Offers — Awaiting Response</h3>
                    {promotionDeals
                      .filter((deal: any) => deal.status === 'pending')
                      .map((deal: any) => (
                        <Card key={deal.id}>
                          <CardContent className="p-4 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{deal.experienceTitle}</p>
                              <p className="text-xs text-gray-500">
                                To: {deal.partnerName || deal.partnerEmail || "Invited partner"} · {formatPromotionDealTerms(deal.dealType, deal.terms)}
                              </p>
                            </div>
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                              <Clock className="w-3 h-3 mr-1" />Pending
                            </Badge>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}

                {promotionDeals.some((deal: any) => deal.status === 'pending_payment') && (
                  <div className="mt-6 space-y-2">
                    <h3 className="font-semibold text-base">Financial Sponsorships — Pending Payment</h3>
                    {promotionDeals
                      .filter((deal: any) => deal.status === 'pending_payment')
                      .map((deal: any) => (
                        <Card key={deal.id} className="border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20">
                          <CardContent className="p-4 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{deal.experienceTitle}</p>
                              <p className="text-xs text-gray-500">
                                {deal.partnerName || deal.partnerEmail || "Partner"} · {formatPromotionDealTerms(deal.dealType, deal.terms)}
                              </p>
                            </div>
                            <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                              <Clock className="w-3 h-3 mr-1" />Pending Payment
                            </Badge>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}

                {/* Confirmed deals */}
                {promotionDeals.some((deal: any) => deal.status === 'accepted') && (
                  <div className="mt-8 space-y-3">
                    <h3 className="font-semibold text-base flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />Confirmed Promotion Deals
                    </h3>
                    {promotionDeals
                      .filter((deal: any) => deal.status === 'accepted')
                      .map((deal: any) => (
                        <Card key={deal.id} className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10">
                          <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Event: <strong>{deal.experienceTitle}</strong></p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold">{deal.partnerName || deal.partnerEmail || "Partner"}</span>
                                  <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">
                                    <CheckCircle className="w-3 h-3 mr-1" />Confirmed
                                  </Badge>
                                </div>
                              </div>
                              <div className="text-sm text-right shrink-0 text-gray-600">
                                {formatPromotionDealTerms(deal.dealType, deal.terms)}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}

                {/* Declined */}
                {promotionDeals.some((deal: any) => deal.status === 'declined') && (
                  <div className="mt-6 space-y-2">
                    <h3 className="font-semibold text-base text-gray-500">Declined</h3>
                    {promotionDeals
                      .filter((deal: any) => deal.status === 'declined')
                      .map((deal: any) => (
                        <div key={deal.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b last:border-0">
                          <span className="truncate">{deal.experienceTitle} — {deal.partnerName || deal.partnerEmail || "Partner"}</span>
                          <Badge className="bg-red-100 text-red-800 border-red-300">
                            <XCircle className="w-3 h-3 mr-1" />Declined
                          </Badge>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="fulfillment" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Perk Fulfillment</h2>
              <p className="mt-1 text-sm text-gray-500">
                Referral milestones as they progress. A reward becomes fulfillable once its target is reached — mark each item fulfilled after you deliver it.
              </p>
            </div>

            {perkFulfillmentsLoading ? (
              <div className="py-10 text-center text-gray-500">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                Loading fulfillment queue...
              </div>
            ) : visibleFulfillments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  <Gift className="mx-auto mb-3 h-12 w-12 opacity-30" />
                  <p className="font-medium">No referral milestones yet</p>
                  <p className="mt-1 text-sm">Participants appear here as soon as their referral link drives a qualifying booking.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead className="border-b bg-gray-50 text-left text-xs font-medium uppercase text-gray-500 dark:bg-gray-900">
                        <tr>
                          <th className="px-4 py-3">Recipient</th>
                          <th className="px-4 py-3">Experience</th>
                          <th className="px-4 py-3">Audience</th>
                          <th className="px-4 py-3">Progress</th>
                          <th className="px-4 py-3">Reward</th>
                          <th className="px-4 py-3">Unlocked</th>
                          <th className="px-4 py-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleFulfillments.map((item: any) => {
                          const recipientName = [item.beneficiary?.firstName, item.beneficiary?.lastName]
                            .filter(Boolean)
                            .join(" ") || item.beneficiary?.email || "Participant";
                          return (
                            <tr key={item.id} className="border-b last:border-0">
                              <td className="px-4 py-4">
                                <p className="font-medium">{recipientName}</p>
                                {item.beneficiary?.email && <p className="text-xs text-gray-500">{item.beneficiary.email}</p>}
                              </td>
                              <td className="px-4 py-4 font-medium">{item.experience?.title || "Experience"}</td>
                              <td className="px-4 py-4">
                                <Badge variant="outline">
                                  {item.referralAudience === "participant" ? "Participant" : "Official Partner"}
                                </Badge>
                              </td>
                              <td className="px-4 py-4 font-medium">
                                {item.qualifyingBookings}/{item.milestoneTarget} bookings
                              </td>
                              <td className="max-w-[240px] px-4 py-4">{item.rewardDescription}</td>
                              <td className="px-4 py-4 text-gray-500">
                                {item.unlockedAt ? new Date(item.unlockedAt).toLocaleDateString() : "-"}
                              </td>
                              <td className="px-4 py-4 text-right">
                                {item.status === "fulfilled" ? (
                                  <Badge className="bg-green-100 text-green-800">
                                    <CheckCircle className="mr-1 h-3 w-3" />Fulfilled
                                  </Badge>
                                ) : item.status === "unlocked" ? (
                                  <Button
                                    size="sm"
                                    onClick={() => updatePerkFulfillment.mutate({ id: item.id, status: "fulfilled" })}
                                    disabled={updatePerkFulfillment.isPending}
                                  >
                                    <Gift className="mr-1 h-4 w-4" />Mark Fulfilled
                                  </Button>
                                ) : (
                                  <Badge className="bg-blue-100 text-blue-800">
                                    <Clock className="mr-1 h-3 w-3" />In progress
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="earnings" className="space-y-6">
            {/* Stripe Connect — where the creator sets up / manages payouts */}
            <PayoutsConnectCard />

            {/* Earnings Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Revenue Breakdown (Last 30 Days)</CardTitle>
                  <CardDescription>Detailed breakdown of your earnings and fees</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <span className="font-medium">Gross Revenue</span>
                      <span className="text-xl font-bold text-blue-600">
                        {earningsLoading ? '...' : formatCurrency((typedEarnings.summary?.totalGross || 0) / 100, 'EUR')}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <span>Platform Fee (15%)</span>
                      <span className="font-semibold text-red-600">
                        -{earningsLoading ? '...' : formatCurrency((typedEarnings.summary?.totalPlatformFees || 0) / 100, 'EUR')}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <span>Stripe Processing Fee (2.9% + 30¢)</span>
                      <span className="font-semibold text-red-600">
                        -{earningsLoading ? '...' : formatCurrency((typedEarnings.summary?.totalStripeFees || 0) / 100, 'EUR')}
                      </span>
                    </div>
                    
                    <hr className="my-4" />
                    
                    <div className="flex justify-between items-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      <span className="font-semibold text-lg">Net Earnings</span>
                      <span className="text-2xl font-bold text-green-600">
                        {earningsLoading ? '...' : formatCurrency((typedEarnings.summary?.totalEarnings || 0) / 100, 'EUR')}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payout Status</CardTitle>
                  <CardDescription>Your payout information</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Completed Payouts</span>
                      <span className="font-semibold text-green-600">
                        {typedEarnings.summary?.completedPayouts || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pending Payouts</span>
                      <span className="font-semibold text-yellow-600">
                        {typedEarnings.summary?.pendingPayouts || 0}
                      </span>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Payouts are processed weekly for amounts over €20
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Individual Earnings Table */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Earnings</CardTitle>
                <CardDescription>Individual booking earnings and breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {earningsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : typedEarnings.earnings && typedEarnings.earnings.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Booking ID</th>
                          <th className="text-left p-2">Gross Amount</th>
                          <th className="text-left p-2">Platform Fee</th>
                          <th className="text-left p-2">Stripe Fee</th>
                          <th className="text-left p-2">Net Earnings</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {typedEarnings.earnings.map((earning: any) => (
                          <tr key={earning.id} className="border-b">
                            <td className="p-2 font-mono text-sm">{earning.bookingId.slice(-8)}</td>
                            <td className="p-2 font-semibold">{formatCurrency(earning.grossAmount / 100, 'EUR')}</td>
                            <td className="p-2 text-red-600">-{formatCurrency(earning.platformFeeAmount / 100, 'EUR')}</td>
                            <td className="p-2 text-red-600">-{formatCurrency(earning.stripeFeeAmount / 100, 'EUR')}</td>
                            <td className="p-2 font-semibold text-green-600">{formatCurrency(earning.netAmount / 100, 'EUR')}</td>
                            <td className="p-2">
                              <Badge 
                                className={
                                  earning.payoutStatus === 'completed' ? 'bg-green-100 text-green-800' :
                                  earning.payoutStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }
                              >
                                {earning.payoutStatus}
                              </Badge>
                            </td>
                            <td className="p-2 text-sm text-gray-600">
                              {new Date(earning.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No earnings yet. Create an experience to start earning!
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Creator Role-Based Pricing</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  Calculate your earnings based on your creator role and support level. Choose between being an Experience Facilitator or Network Influencer.
                </p>
              </div>
              <EmbeddedPricingCalculator />
            </div>

            {/* Commercial model guide */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Commercial Model Guide</CardTitle>
                  <CardDescription>Use the event builder calculator for final commercial terms</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                        Understanding Our Fee Structure
                      </h4>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                        <li>• Platform Fee: 20-34% based on role and support level</li>
                        <li>• Stripe Processing: 2.9% + 30¢ (secure payment processing)</li>
                        <li>• Experience Facilitator: 66-80% depending on support level</li>
                        <li>• Network Influencer: 25% revenue share for bringing community</li>
                      </ul>
                    </div>

                    <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                        Pricing Best Practices
                      </h4>
                      <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
                        <li>• Research similar experiences in your area</li>
                        <li>• Factor in your costs (venue, materials, time)</li>
                        <li>• Consider your expertise and unique value</li>
                        <li>• Start competitive, increase with positive reviews</li>
                      </ul>
                    </div>

                    <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                      <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                        Maximize Your Earnings
                      </h4>
                      <ul className="text-sm text-yellow-800 dark:text-yellow-200 space-y-1">
                        <li>• Bundle add-ons (materials, meals, photos)</li>
                        <li>• Offer early bird discounts for advance bookings</li>
                        <li>• Create tiered pricing (basic, premium, VIP)</li>
                        <li>• Consider group size for optimal profitability</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Revenue Analytics from API */}
              <Card>
                <CardHeader>
                  <CardTitle>Your Pricing Performance</CardTitle>
                  <CardDescription>How your current pricing is performing</CardDescription>
                </CardHeader>
                <CardContent>
                  {revenueLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : typedRevenueAnalytics.earningsByExperience && typedRevenueAnalytics.earningsByExperience.length > 0 ? (
                    <div className="space-y-3">
                      {typedRevenueAnalytics.earningsByExperience.map((exp: any) => (
                        <div key={exp.experienceId} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-start mb-2">
                            <h5 className="font-medium truncate">{exp.experienceTitle}</h5>
                            <span className="text-sm text-gray-500">{exp.totalBookings} bookings</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500">Avg. Booking:</span>
                              <span className="font-semibold ml-1">
                                ${(exp.averageBookingValue / 100).toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Net Earned:</span>
                              <span className="font-semibold ml-1 text-green-600">
                                ${(exp.totalNet / 100).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      Create experiences to see pricing performance
                    </div>
                  )}
                </CardContent>
                </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Performance Metrics</CardTitle>
                  <CardDescription>Your experience performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Total Views</span>
                      <span className="font-semibold">{typedAnalytics.totalViews || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Booking Conversion</span>
                      <span className="font-semibold">{typedAnalytics.conversionRate || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg. Rating</span>
                      <span className="font-semibold">{typedAnalytics.averageRating || 0}/5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Repeat Customers</span>
                      <span className="font-semibold">{typedAnalytics.repeatCustomers || 0}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Popular Experiences</CardTitle>
                  <CardDescription>Your top performing experiences</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {typedAnalytics.topExperiences?.map((exp: any, index: number) => (
                      <div key={exp.id} className="flex justify-between items-center">
                        <span className="truncate">{index + 1}. {exp.title}</span>
                        <span className="text-sm text-gray-500">{exp.bookings} bookings</span>
                      </div>
                    )) || <p className="text-gray-500">No data available</p>}
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

export default function CreatorDashboard() {
  return (
    <DashboardGuard requiredRole="creator">
      <ProtectedRoute requiredRole="creator">
        <CreatorDashboardContent />
      </ProtectedRoute>
    </DashboardGuard>
  );
}
