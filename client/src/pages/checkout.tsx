import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import MVGProgressWidget from "@/components/MVGProgressWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { MapPin, Calendar, Users, Lock, Clock, Shield, AlertCircle, CheckCircle, Heart } from "lucide-react";
import { normalizeImageUrl, getBaseUrl } from "@/lib/utils";
import { getAttribution, clearAttribution } from "@/hooks/usePromoterAttribution";

type Experience = {
  id: string;
  title: string;
  shortDescription?: string;
  description: string;
  price: number;
  pricePerPerson?: number;
  depositAmount?: number;
  startDate: string;
  endDate: string;
  location: string;
  maxParticipants: number;
  currentParticipants: number;
  coverImageUrl?: string;
  requireMinimumParticipants?: boolean;
  minimumParticipants?: number;
  mvgDeadline?: string;
  escrowEnabled?: boolean;
  currency?: string;
};

const formatCurrency = (amount: number | string | undefined | null, currency?: string | null) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  if (!currency) {
    console.warn('[DataContract] Currency missing - using EUR for legacy data migration');
  }
  const currencyCode = (currency || 'EUR').toUpperCase();
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
  };
  const symbol = symbols[currencyCode] || currencyCode + ' ';
  return `${symbol}${numAmount.toFixed(2)}`;
};

const stripePromise = import.meta.env.VITE_STRIPE_PUBLIC_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : Promise.resolve(null);

const CheckoutForm = ({ experience, paymentInfo, paymentMode }: {
  experience: Experience;
  paymentMode: 'deposit' | 'full';
  paymentInfo: {
    isMVGExperience: boolean;
    isDepositPayment: boolean;
    depositAmount: number;
    balanceAmount: number;
    fullPrice: number;
    mvgMin?: number;
    mvgDeadline?: string;
    ticketSkuId?: string;
    ticketName?: string;
    hasDeposit?: boolean;
    pricingMode?: 'fixed' | 'pwyw';
    suggestedPrice?: number | null;
    minPrice?: number;
  } | null;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDeposit = paymentMode === 'deposit' && (paymentInfo?.hasDeposit || paymentInfo?.isDepositPayment);
  const experienceFullPrice = paymentInfo?.fullPrice || experience.pricePerPerson || experience.price;
  const chargeAmount = isDeposit ? paymentInfo?.depositAmount || 0 : experienceFullPrice;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${getBaseUrl()}/booking-success?experience=${experience.id}`,
        },
        redirect: "if_required",
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (paymentIntent && (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded")) {
        try {
          const attribution = getAttribution();
          
          const response = await apiRequest("POST", "/api/bookings", {
            experienceId: experience.id,
            amount: experienceFullPrice,
            isEscrow: experience.requireMinimumParticipants,
            stripePaymentIntentId: paymentIntent.id,
            promoterId: attribution.promoterId,
            referralCode: attribution.referralCode,
            shareToken: attribution.shareToken,
            ticketSkuId: paymentInfo?.ticketSkuId,
            paymentType: paymentMode
          });
          
          clearAttribution();

          const data = await response.json();
          
          queryClient.invalidateQueries({ queryKey: ["/api/experiences"] });
          queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id] });
          queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id, "participants"] });
          queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id, "participants-with-skills"] });
          queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id, "booking-stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/creator/experiences"] });
          
          toast({
            title: data.mvgResult?.action === "mvg_confirmed" ? "🎉 Group Complete!" : "Booking Confirmed!",
            description: data.message,
          });

          const bookingId = data.booking?.id || '';
          const postPaymentPath = isDeposit
            ? `/recruit?experience=${experience.id}&booking=${bookingId}`
            : `/booking-success?experience=${experience.id}&booking=${bookingId}`;
          window.location.href = postPaymentPath;
        } catch (bookingError) {
          toast({
            title: "Booking Error", 
            description: "Payment processed but booking creation failed. Please contact support.",
            variant: "destructive",
          });
        }
      } else if (paymentIntent && paymentIntent.status === "processing") {
        toast({
          title: "Payment Processing",
          description: "Your payment is being processed. You'll receive confirmation shortly.",
        });
        
        try {
          const attribution = getAttribution();
          
          const response = await apiRequest("POST", "/api/bookings", {
            experienceId: experience.id,
            amount: experienceFullPrice,
            isEscrow: experience.requireMinimumParticipants,
            stripePaymentIntentId: paymentIntent.id,
            promoterId: attribution.promoterId,
            referralCode: attribution.referralCode,
            shareToken: attribution.shareToken,
            ticketSkuId: paymentInfo?.ticketSkuId,
            paymentType: paymentMode
          });
          
          const processingData = await response.json();
          clearAttribution();

          queryClient.invalidateQueries({ queryKey: ["/api/experiences"] });
          queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id] });
          queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id, "participants"] });
          queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id, "participants-with-skills"] });
          queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id, "booking-stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/creator/experiences"] });

          const processingBookingId = processingData.booking?.id || '';
          const processingPostPaymentPath = isDeposit
            ? `/recruit?experience=${experience.id}&booking=${processingBookingId}`
            : `/booking-success?experience=${experience.id}&booking=${processingBookingId}`;
          window.location.href = processingPostPaymentPath;
        } catch (bookingError) {
          console.error("Failed to create booking for processing payment:", bookingError);
        }
      }
    } catch (err: any) {
      toast({
        title: "Payment Error",
        description: err.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMVG = paymentInfo?.isMVGExperience || experience.requireMinimumParticipants;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      {isDeposit && paymentInfo && (
        <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="font-medium text-sm mb-2 text-blue-900 dark:text-blue-100">Payment Breakdown</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total Price:</span>
              <span className="font-medium">{formatCurrency(paymentInfo.fullPrice, experience.currency)}</span>
            </div>
            <div className="flex justify-between text-blue-700 dark:text-blue-300">
              <span>Deposit Due Today:</span>
              <span className="font-bold">{formatCurrency(paymentInfo.depositAmount, experience.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Balance (Due Later):</span>
              <span>{formatCurrency(paymentInfo.balanceAmount, experience.currency)}</span>
            </div>
          </div>
        </div>
      )}
      
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-gradient-to-br from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-300 disabled:text-gray-500 disabled:opacity-100 transition-all shadow-md hover:shadow-lg"
        size="lg"
        data-testid="button-complete-booking"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Processing...
          </span>
        ) : !stripe ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Loading payment...
          </span>
        ) : isDeposit
          ? `Deposit Due Today: ${formatCurrency(chargeAmount, experience.currency)}`
          : `Complete Booking — ${formatCurrency(chargeAmount, experience.currency)}`
        }
      </Button>
      
      {isMVG && isDeposit && (
        <div className="text-xs text-center text-gray-600 dark:text-gray-400 space-y-1">
          <div className="flex items-center justify-center space-x-1">
            <Shield className="h-3 w-3 text-green-600" />
            <span>Deposit charged now, balance due if minimum reached</span>
          </div>
          <div>💳 Deposit: {formatCurrency(paymentInfo?.depositAmount || 0, experience.currency)} charged immediately</div>
          <div>💸 Full refund if minimum not met by deadline</div>
          <div>✅ Balance ({formatCurrency(paymentInfo?.balanceAmount || 0, experience.currency)}) charged when event confirms</div>
          {paymentInfo?.mvgMin && (
            <div className="mt-2 font-medium">
              Minimum group size: {paymentInfo.mvgMin} participants
            </div>
          )}
        </div>
      )}
      
      {isMVG && !isDeposit && (
        <div className="text-xs text-center text-gray-600 dark:text-gray-400 space-y-1">
          <div className="flex items-center justify-center space-x-1">
            <Shield className="h-3 w-3 text-green-600" />
            <span>Payment held securely until minimum group size reached</span>
          </div>
          <div>💳 Full {formatCurrency(chargeAmount, experience.currency)} held until event confirms</div>
          <div>💸 Automatic refund if minimum not met by deadline</div>
          <div>✅ Charged only when event confirms</div>
          {paymentInfo?.mvgMin && (
            <div className="mt-2 font-medium">
              Minimum group size: {paymentInfo.mvgMin} participants
            </div>
          )}
        </div>
      )}
      
      {!isMVG && isDeposit && paymentInfo && (
        <div className="text-xs text-center text-gray-600 dark:text-gray-400 space-y-1">
          <div>💳 Deposit secures your spot immediately</div>
          <div>📅 Balance ({formatCurrency(paymentInfo.balanceAmount, experience.currency)}) payment due closer to event date</div>
        </div>
      )}
    </form>
  );
};

export default function Checkout() {
  const [, params] = useRoute("/checkout/:id");
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentLoading, setPaymentIntentLoading] = useState(false);
  const [paymentInitError, setPaymentInitError] = useState<string | null>(null);
  const [freeRsvpInfo, setFreeRsvpInfo] = useState<{
    fullPrice: number;
    ticketSkuId?: string;
    ticketName?: string;
  } | null>(null);
  const [freeRsvpSubmitting, setFreeRsvpSubmitting] = useState(false);
  const [freeRsvpError, setFreeRsvpError] = useState<string | null>(null);
  const freeRsvpStartedRef = useRef(false);
  const [paymentInfo, setPaymentInfo] = useState<{
    isMVGExperience: boolean;
    isDepositPayment: boolean;
    depositAmount: number;
    balanceAmount: number;
    fullPrice: number;
    mvgMin?: number;
    mvgDeadline?: string;
    ticketSkuId?: string;
    ticketName?: string;
    hasDeposit?: boolean;
    pricingMode?: 'fixed' | 'pwyw';
    suggestedPrice?: number | null;
    minPrice?: number;
  } | null>(null);

  // ── PWYW state ─────────────────────────────────────────────────────────
  // pwywReady: ticket is PWYW and experience data loaded; show price input
  const [pwywReady, setPwywReady] = useState(false);
  const [pwywPrice, setPwywPrice] = useState<number>(0);
  const [pwywMin, setPwywMin] = useState<number>(0);
  const [pwywSubmitted, setPwywSubmitted] = useState(false);
  const experienceId = params?.id;
  
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const ticketSkuId = urlParams.get('ticketSkuId');
  const initialPaymentMode = urlParams.get('paymentMode') as 'deposit' | 'full' | null;
  
  const [paymentMode, setPaymentMode] = useState<'deposit' | 'full'>(initialPaymentMode || 'deposit');

  const { data: experience, isLoading: experienceLoading } = useQuery<Experience>({
    queryKey: ["/api/experiences", experienceId],
    enabled: !!experienceId && isAuthenticated,
  });

  const { data: bookingStats } = useQuery<{ currentBookings: number; confirmedBookings: number }>({
    queryKey: ["/api/experiences", experienceId, "booking-stats"],
    enabled: !!experienceId && !!experience?.requireMinimumParticipants,
    refetchInterval: 30000,
  });

  const createPaymentIntent = useCallback(async (mode: 'deposit' | 'full', userPrice?: number) => {
    if (!experience || !experienceId) return;

    setPaymentIntentLoading(true);
    setPaymentInitError(null);
    try {
      const body: Record<string, any> = {
        amount: experience.pricePerPerson || experience.price,
        experienceId: experienceId,
        ticketSkuId: ticketSkuId || undefined,
        paymentMode: mode,
      };
      if (userPrice !== undefined) body.userPrice = userPrice;

      const res = await apiRequest("POST", "/api/create-payment-intent", body);
      const data = await res.json();
      if (data.freeRsvp) {
        setFreeRsvpInfo({
          fullPrice: 0,
          ticketSkuId: ticketSkuId || undefined,
          ticketName: data.ticketName,
        });
        setPaymentInfo({
          isMVGExperience: data.isMVGExperience || false,
          isDepositPayment: false,
          depositAmount: 0,
          balanceAmount: 0,
          fullPrice: 0,
          mvgMin: data.mvgMin,
          mvgDeadline: data.mvgDeadline,
          ticketSkuId: ticketSkuId || undefined,
          ticketName: data.ticketName,
          hasDeposit: false,
          pricingMode: data.pricingMode || 'fixed',
          suggestedPrice: data.suggestedPrice ?? null,
          minPrice: data.minPrice ?? 0,
        });
        setClientSecret("");
        return;
      }
      if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
        throw new Error("Stripe checkout is not configured. Add VITE_STRIPE_PUBLIC_KEY and restart the app.");
      }
      if (!data.clientSecret) {
        throw new Error("Payment setup did not return a client secret.");
      }
      setClientSecret(data.clientSecret);
      setPaymentInfo({
        isMVGExperience: data.isMVGExperience || false,
        isDepositPayment: data.isDepositPayment || false,
        depositAmount: data.depositAmount || 0,
        balanceAmount: data.balanceAmount || 0,
        fullPrice: data.fullPrice || experience.pricePerPerson || experience.price,
        mvgMin: data.mvgMin,
        mvgDeadline: data.mvgDeadline,
        ticketSkuId: ticketSkuId || undefined,
        ticketName: data.ticketName,
        hasDeposit: data.hasDeposit || false,
        pricingMode: data.pricingMode || 'fixed',
        suggestedPrice: data.suggestedPrice ?? null,
        minPrice: data.minPrice ?? 0,
      });

      if (data.hasDeposit === false && mode === 'deposit') {
        setPaymentMode('full');
      }
    } catch (error: any) {
      const message = error?.message || "Failed to initialize payment. Please try again.";
      setPaymentInitError(message);
      toast({
        title: "Payment setup failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPaymentIntentLoading(false);
    }
  }, [experience, experienceId, ticketSkuId, toast]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to complete your booking.",
        variant: "destructive",
      });
      // Send them to login, then bring them right back to this checkout afterwards.
      const returnTo = window.location.pathname + window.location.search;
      setTimeout(() => {
        window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
      }, 1000);
      return;
    }

    if (experience && experienceId && !clientSecret && !pwywReady) {
      // Check if the selected ticket is PWYW before auto-creating the PaymentIntent
      const ticketSkus: any[] = (experience as any).ticketSkus || [];
      const selectedTicket = ticketSkuId
        ? ticketSkus.find((t: any, i: number) => (t.id || t.sourceRoomId || `ticket-${i}`) === ticketSkuId)
        : null;

      if (selectedTicket?.pricingMode === 'pwyw') {
        const suggested = parseFloat(selectedTicket.suggestedPrice ?? selectedTicket.pricePerPerson ?? 0) || 0;
        const min = parseFloat(selectedTicket.minPrice ?? 0) || 0;
        setPwywMin(min);
        setPwywPrice(suggested);
        setPwywReady(true); // Show the price input UI — don't auto-create PI yet
      } else {
        createPaymentIntent(paymentMode);
      }
    }
  }, [experience, experienceId, isAuthenticated, authLoading, toast, pwywReady, pwywSubmitted]);

  // Once PWYW user has submitted their price, create the PaymentIntent with it
  useEffect(() => {
    if (pwywSubmitted && experience && experienceId && !clientSecret) {
      createPaymentIntent(paymentMode, pwywPrice);
    }
  }, [pwywSubmitted]);

  const handlePaymentModeChange = useCallback(async (newMode: 'deposit' | 'full') => {
    if (newMode === paymentMode) return;
    
    setPaymentMode(newMode);
    
    const url = new URL(window.location.href);
    url.searchParams.set('paymentMode', newMode);
    window.history.replaceState({}, '', url.toString());
    
    setClientSecret("");
    await createPaymentIntent(newMode);
  }, [paymentMode, createPaymentIntent]);

  const completeFreeRsvp = useCallback(async () => {
    if (!experience || !experienceId || freeRsvpSubmitting || freeRsvpStartedRef.current) return;

    freeRsvpStartedRef.current = true;
    setFreeRsvpSubmitting(true);
    setFreeRsvpError(null);
    try {
      const attribution = getAttribution();
      const response = await apiRequest("POST", "/api/bookings", {
        experienceId: experience.id,
        amount: 0,
        isEscrow: experience.requireMinimumParticipants,
        stripePaymentIntentId: null,
        promoterId: attribution.promoterId,
        referralCode: attribution.referralCode,
        shareToken: attribution.shareToken,
        ticketSkuId: freeRsvpInfo?.ticketSkuId,
        paymentType: 'full'
      });
      const data = await response.json();
      clearAttribution();

      queryClient.invalidateQueries({ queryKey: ["/api/experiences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id, "participants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id, "participants-with-skills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", experience.id, "booking-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creator/experiences"] });

      toast({
        title: "RSVP Confirmed!",
        description: data.message || "Your free RSVP is confirmed and community chat is unlocked.",
      });

      const bookingId = data.booking?.id || '';
      window.location.href = `/booking-success?experience=${experience.id}&booking=${bookingId}`;
    } catch (error: any) {
      setFreeRsvpError(error?.message || "Please try again.");
      toast({
        title: "RSVP failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setFreeRsvpSubmitting(false);
    }
  }, [experience, experienceId, freeRsvpInfo?.ticketSkuId, freeRsvpSubmitting, toast]);

  // Free RSVP: intentionally NOT auto-submitted so the user can see the bypass screen
  // and consciously click "Confirm RSVP" before we create the booking.

  if (authLoading || experienceLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-80 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!experience) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-gray-600">Experience not found.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (paymentInitError && !paymentIntentLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Card>
            <CardContent className="py-10 text-center">
              <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-600" />
              <h2 className="mb-2 text-xl font-semibold text-gray-900">Payment setup failed</h2>
              <p className="mb-6 text-sm text-gray-600">{paymentInitError}</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button onClick={() => createPaymentIntent(paymentMode)}>
                  Try Again
                </Button>
                <Button variant="outline" onClick={() => window.history.back()}>
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (freeRsvpInfo) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Card>
            <CardContent className="py-10 text-center">
              <CheckCircle className="mx-auto mb-4 h-10 w-10 text-green-600" />
              <h2 className="mb-2 text-xl font-semibold text-gray-900">Free Event — No Payment Required</h2>
              <p className="mb-6 text-sm text-gray-600">
                This ticket is €0.00, so Stripe checkout is bypassed entirely. Click below to confirm your RSVP and unlock the community chat.
              </p>
              {freeRsvpError && (
                <p className="mb-4 text-sm text-red-600">{freeRsvpError}</p>
              )}
              <Button
                disabled={freeRsvpSubmitting}
                onClick={() => {
                  freeRsvpStartedRef.current = false;
                  completeFreeRsvp();
                }}
              >
                {freeRsvpSubmitting ? "Confirming..." : freeRsvpError ? "Try Again" : "Confirm RSVP"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── PWYW price input screen ───────────────────────────────────────────
  if (pwywReady && !pwywSubmitted) {
    const currency = (experience as any).currency || 'EUR';
    const handlePwywSubmit = () => {
      if (pwywPrice < pwywMin) {
        toast({
          title: "Price too low",
          description: `Minimum contribution is ${formatCurrency(pwywMin, currency)}`,
          variant: "destructive",
        });
        return;
      }
      setPwywSubmitted(true);
    };
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-pink-500" />
                <CardTitle>Set Your Contribution</CardTitle>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {(experience as any).title} — pay what feels right to you.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="pwyw-price">Your price ({currency.toUpperCase()})</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium select-none">
                    {currency.toUpperCase() === 'EUR' ? '€' : currency.toUpperCase() === 'GBP' ? '£' : '$'}
                  </span>
                  <Input
                    id="pwyw-price"
                    type="number"
                    min={pwywMin}
                    step="0.50"
                    value={pwywPrice}
                    onChange={(e) => setPwywPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="pl-8 text-lg font-semibold"
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  />
                </div>
                {pwywMin > 0 && (
                  <p className="text-xs text-gray-500">
                    Minimum contribution: {formatCurrency(pwywMin, currency)}
                  </p>
                )}
                {pwywMin === 0 && (
                  <p className="text-xs text-gray-500">
                    You can enter €0 for free — any contribution helps the creator!
                  </p>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                {[0, pwywMin, ...(pwywMin > 0 ? [pwywMin * 2] : [3, 5, 10])].filter((v, i, a) => a.indexOf(v) === i).map(v => (
                  <Button
                    key={v}
                    variant={pwywPrice === v ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPwywPrice(v)}
                  >
                    {v === 0 ? 'Free' : formatCurrency(v, currency)}
                  </Button>
                ))}
              </div>

              <Button
                className="w-full"
                onClick={handlePwywSubmit}
                disabled={pwywPrice < pwywMin}
              >
                {pwywPrice === 0 && pwywMin === 0
                  ? 'Confirm Free RSVP'
                  : `Continue — Pay ${formatCurrency(pwywPrice, currency)}`}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!clientSecret || paymentIntentLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", { 
      weekday: "long",
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });
  };

  const depositAvailable = paymentInfo?.hasDeposit && paymentInfo.depositAmount > 0;
  const isDepositMode = paymentMode === 'deposit' && depositAvailable;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Complete Your Booking</h1>
          <p className="text-xl text-gray-600">You're almost there!</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Booking Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <img 
                  src={normalizeImageUrl(experience.coverImageUrl) || "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=200"} 
                  alt={experience.title}
                  className="w-full h-48 object-cover rounded-lg" 
                />
                
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {experience.title}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {experience.shortDescription}
                  </p>
                </div>

                <Separator />

                <div className="space-y-3 text-sm">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-3 text-gray-400" />
                    <span>{experience.location}</span>
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-3 text-gray-400" />
                    <span>{formatDate(experience.startDate)} - {formatDate(experience.endDate)}</span>
                  </div>
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-3 text-gray-400" />
                    <span>{(bookingStats?.currentBookings || experience.currentParticipants) + 1}/{experience.maxParticipants} participants</span>
                  </div>
                </div>

                <Separator />

                {experience.requireMinimumParticipants && (
                  <MVGProgressWidget 
                    experienceId={experience.id}
                    showTitle={true}
                    refreshInterval={30000}
                  />
                )}

                {experience.requireMinimumParticipants && <Separator />}

                <div className="space-y-3">
                  {paymentInfo?.ticketName && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Ticket</span>
                      <span className="font-medium text-gray-900">{paymentInfo.ticketName}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Full Price</span>
                    <span className="font-medium">{formatCurrency(paymentInfo?.fullPrice || experience.price, experience.currency)}</span>
                  </div>
                  
                  {depositAvailable && (
                    <>
                      <div className="flex justify-between items-center text-blue-700 dark:text-blue-300">
                        <span className="text-sm font-medium">Deposit Due Today</span>
                        <span className="font-bold">{formatCurrency(paymentInfo!.depositAmount, experience.currency)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Remaining Balance</span>
                        <span className="font-medium">{formatCurrency(paymentInfo!.balanceAmount, experience.currency)}</span>
                      </div>
                    </>
                  )}
                  
                  {experience.requireMinimumParticipants && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-900">Minimum Group Requirement</span>
                        <Badge variant="secondary" className="text-xs">
                          {experience.minimumParticipants || 6} people
                        </Badge>
                      </div>
                      <p className="text-xs text-blue-700">
                        Your payment will be held securely until the minimum group size is reached.
                      </p>
                    </div>
                  )}

                  {depositAvailable && (
                    <div className="space-y-2 pt-2">
                      <p className="text-sm font-medium text-gray-700">Payment Option</p>
                      <div className="grid grid-cols-1 gap-2">
                        <div
                          data-testid="payment-mode-deposit"
                          onClick={() => handlePaymentModeChange('deposit')}
                          className={`cursor-pointer rounded-lg p-3 border-2 transition-colors ${
                            paymentMode === 'deposit'
                              ? 'border-purple-600 bg-purple-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-sm">Pay Deposit</p>
                              <p className="text-xs text-gray-500">Remaining balance due later</p>
                            </div>
                            <span className="font-bold text-sm">{formatCurrency(paymentInfo!.depositAmount, experience.currency)}</span>
                          </div>
                        </div>
                        <div
                          data-testid="payment-mode-full"
                          onClick={() => handlePaymentModeChange('full')}
                          className={`cursor-pointer rounded-lg p-3 border-2 transition-colors ${
                            paymentMode === 'full'
                              ? 'border-purple-600 bg-purple-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-sm">Pay Full Amount</p>
                              <p className="text-xs text-gray-500">No balance remaining</p>
                            </div>
                            <span className="font-bold text-sm">{formatCurrency(paymentInfo!.fullPrice, experience.currency)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center text-lg font-semibold border-t pt-3">
                    <span>{isDepositMode ? 'Due Today' : 'Total'}</span>
                    <span>{formatCurrency(
                      isDepositMode ? paymentInfo!.depositAmount : (paymentInfo?.fullPrice || experience.pricePerPerson || experience.price),
                      experience.currency
                    )}</span>
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  {experience.requireMinimumParticipants && experience.escrowEnabled ? (
                    <>
                      <div className="flex items-center mb-2">
                        <Shield className="h-3 w-3 mr-1 text-green-600" />
                        <span className="text-green-700 font-medium">Escrow Protection Enabled</span>
                      </div>
                      <p>• Payment held safely until event confirms</p>
                      <p>• Automatic refund if minimum not reached</p>
                      <p>• Secure payment processing with Stripe</p>
                    </>
                  ) : (
                    <>
                      <p>• Free cancellation up to 24 hours before the experience</p>
                      <p>• Secure payment processing with Stripe</p>
                      <p>• Instant booking confirmation</p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Elements stripe={stripePromise} options={{ clientSecret }} key={clientSecret}>
                <CheckoutForm experience={experience} paymentInfo={paymentInfo} paymentMode={paymentMode} />
              </Elements>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
