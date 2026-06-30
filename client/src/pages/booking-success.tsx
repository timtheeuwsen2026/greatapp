import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import Navigation from "@/components/navigation";
import MVGProgressWidget from "@/components/MVGProgressWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Calendar, MapPin, Users, ArrowLeft, CreditCard, Clock, Ticket, Loader2, XCircle, Share2 } from "lucide-react";
import { normalizeImageUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

type Experience = {
  id: string;
  title: string;
  shortDescription?: string;
  price: number;
  startDate: string;
  endDate: string;
  location: string;
  maxParticipants: number;
  currentParticipants: number;
  coverImageUrl?: string;
  requireMinimumParticipants?: boolean;
  minimumParticipants?: number;
  mvgMin?: number;
  mvgDeadline?: string;
  currency?: string;
  status?: string;
  lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
};

type Booking = {
  id: string;
  experienceId: string;
  userId: string;
  amount: string;
  totalPrice: string;
  isDepositOnly: boolean;
  depositAmount: string;
  balanceAmount: string;
  balanceDueDate: string | null;
  balancePaid: boolean;
  status: string;
  stripePaymentIntentId: string;
  ticketSkuId: string | null;
  ticketName: string | null;
  createdAt: string;
};

const formatCurrency = (amount: number | string | undefined | null, currency?: string | null) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  const currencyCode = (currency || 'EUR').toUpperCase();
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
  };
  const symbol = symbols[currencyCode] || currencyCode + ' ';
  return `${symbol}${numAmount.toFixed(2)}`;
};

function BalancePaymentForm({ bookingId, amount, currency, onSuccess }: { 
  bookingId: string; 
  amount: number; 
  currency: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const confirmMutation = useMutation({
    mutationFn: async (paymentIntentId: string) => {
      const res = await apiRequest("POST", `/api/bookings/${bookingId}/pay-balance/confirm`, {
        paymentIntentId,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/my-bookings"] });
      toast({
        title: "Balance Paid!",
        description: "Your booking is now fully paid.",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to confirm balance payment",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message || "Payment could not be processed",
          variant: "destructive",
        });
      } else if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "requires_capture")) {
        confirmMutation.mutate(paymentIntent.id);
      }
    } catch (err: any) {
      toast({
        title: "Payment Error",
        description: err.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button
        type="submit"
        className="w-full bg-amber-600 hover:bg-amber-700 text-white"
        disabled={!stripe || isProcessing || confirmMutation.isPending}
        data-testid="pay-balance-submit"
      >
        {isProcessing || confirmMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4 mr-2" />
            Pay Remaining Balance {formatCurrency(amount, currency)}
          </>
        )}
      </Button>
    </form>
  );
}

export default function BookingSuccess() {
  const [, setLocation] = useLocation();
  const [experienceId, setExperienceId] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [balanceJustPaid, setBalanceJustPaid] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('experience');
    const bId = urlParams.get('booking');
    setExperienceId(id);
    setBookingId(bId || null);
  }, []);

  const { data: experience, isLoading } = useQuery<Experience>({
    queryKey: ["/api/experiences", experienceId],
    enabled: !!experienceId,
  });

  const { data: bookingDirect } = useQuery<Booking>({
    queryKey: ["/api/bookings", bookingId],
    enabled: !!bookingId,
  });

  const { data: myBookings } = useQuery<Array<Booking & { experience?: any }>>({
    queryKey: ["/api/bookings/my-bookings"],
    enabled: !!experienceId && !bookingId,
  });

  const { data: participantProfileStatus, isLoading: participantProfileLoading } = useQuery<{ hasProfile: boolean }>({
    queryKey: ["/api/participant-profile/status"],
    retry: false,
  });

  const booking: Booking | undefined = bookingDirect || (
    myBookings && experienceId
      ? myBookings
          .filter((b: any) => b.experienceId === experienceId)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      : undefined
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handlePayBalance = async () => {
    if (!booking) return;
    
    try {
      const res = await apiRequest("POST", `/api/bookings/${booking.id}/pay-balance/create-intent`);
      const data = await res.json();
      setClientSecret(data.clientSecret);
      setShowPaymentForm(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not initiate balance payment",
        variant: "destructive",
      });
    }
  };

  const handleBalancePaymentSuccess = () => {
    setShowPaymentForm(false);
    setClientSecret(null);
    setBalanceJustPaid(true);
    queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
    queryClient.invalidateQueries({ queryKey: ["/api/bookings/my-bookings"] });
  };

  const isCancelled =
    booking?.status === 'cancelled' ||
    experience?.status === 'cancelled' ||
    experience?.lifecycleStatus === 'cancelled';

  const participantProfileMissing = participantProfileStatus?.hasProfile === false;

  useEffect(() => {
    if (
      !isLoading &&
      experience &&
      !participantProfileLoading &&
      participantProfileMissing &&
      !isCancelled &&
      !balanceJustPaid
    ) {
      sessionStorage.setItem("postParticipantOnboardingRedirect", "/community-hub");
      const params = new URLSearchParams();
      params.set("afterCheckout", "true");
      if (experienceId) params.set("experience", experienceId);
      if (booking?.id) params.set("booking", booking.id);
      setLocation(`/participant-profile-setup?${params.toString()}`);
    }
  }, [
    isLoading,
    experience,
    participantProfileLoading,
    participantProfileMissing,
    isCancelled,
    balanceJustPaid,
    experienceId,
    booking?.id,
    setLocation,
  ]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!experience) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <p className="text-red-600 text-lg">Experience not found.</p>
          <Link href="/">
            <Button className="mt-4">Back to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isDeposit = booking?.isDepositOnly === true && !balanceJustPaid;
  const isFullyPaid = booking?.balancePaid === true || booking?.status === "fully_paid" || balanceJustPaid;
  const hasOutstandingBalance = isDeposit && !isFullyPaid && parseFloat(booking?.balanceAmount || "0") > 0;
  const currency = experience.currency || 'EUR';

  if (isCancelled) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
              <XCircle className="w-9 h-9 text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2" data-testid="cancelled-heading">
                This experience was cancelled
              </h1>
              <p className="text-gray-600 max-w-lg mx-auto" data-testid="cancelled-message">
                The minimum group size for <strong>{experience.title}</strong> was not reached by the deadline, so the experience has been cancelled and your payment has been released automatically.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-left space-y-2" data-testid="refund-info">
              <p className="font-semibold text-blue-900">What happens with your money?</p>
              <p className="text-sm text-blue-800">
                Your held payment has been released back to your original payment method. Depending on your bank, this typically appears within <strong>3–5 business days</strong>. You were not charged anything.
              </p>
            </div>
            <div className="space-y-3 pt-2">
              <Link href="/experiences">
                <Button className="w-full bg-gray-900 hover:bg-gray-800 text-white">
                  Browse other experiences
                </Button>
              </Link>
              <Link href="/bookings">
                <Button variant="outline" className="w-full">
                  View all my bookings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="confirmation-heading">
            {balanceJustPaid 
              ? "Fully Paid!" 
              : isDeposit 
                ? "Deposit Paid Successfully!" 
                : "Booking Confirmed!"}
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto" data-testid="confirmation-message">
            {balanceJustPaid
              ? "Your booking is now fully paid. No remaining balance."
              : experience.requireMinimumParticipants 
                ? "Your payment is held securely until the minimum group size is reached."
                : isDeposit
                  ? "You have secured your spot by paying the deposit. The remaining balance is due before the deadline."
                  : "Your booking is fully paid. No remaining balance."
            }
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Experience Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <img 
                    src={normalizeImageUrl(experience.coverImageUrl) || "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=200"} 
                    alt={experience.title}
                    className="w-full h-48 object-cover rounded-lg" 
                  />
                  
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2" data-testid="experience-title">
                      {experience.title}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      {experience.shortDescription}
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center" data-testid="location-info">
                      <MapPin className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                      <span>{experience.location}</span>
                    </div>
                    <div className="flex items-center" data-testid="date-info">
                      <Calendar className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                      <span>{formatDate(experience.startDate)} - {formatDate(experience.endDate)}</span>
                    </div>
                    <div className="flex items-center" data-testid="participants-info">
                      <Users className="h-4 w-4 mr-3 text-gray-400 flex-shrink-0" />
                      <span>{experience.currentParticipants + 1}/{experience.maxParticipants} participants</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader><CardTitle className="flex items-center gap-2"><Share2 className="h-5 w-5 text-primary"/>Help your squad reach the minimum</CardTitle></CardHeader>
              <CardContent><p className="mb-4 text-sm text-gray-600">Invite friends with your personal referral link and get the group confirmed faster.</p><Link href={`/recruit?experience=${experience.id}${bookingId ? `&booking=${bookingId}` : ""}`}><Button className="w-full">Invite the Squad</Button></Link></CardContent>
            </Card>
            <Card data-testid="payment-summary" className="border-green-200 bg-green-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="h-5 w-5 text-green-600" />
                  Payment Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {booking?.ticketName && (
                  <div className="flex items-center gap-2 pb-2" data-testid="ticket-name">
                    <Ticket className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Ticket:</span>
                    <span className="font-medium text-gray-900">{booking.ticketName}</span>
                  </div>
                )}

                {booking && hasOutstandingBalance ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center" data-testid="full-price">
                      <span className="text-sm text-gray-600">Full Price</span>
                      <span className="font-medium text-gray-900">{formatCurrency(booking.totalPrice, currency)}</span>
                    </div>

                    <Separator />

                    <div className="flex justify-between items-center" data-testid="deposit-paid">
                      <span className="text-sm font-medium text-green-700">Deposit paid</span>
                      <span className="font-bold text-green-700 text-lg">{formatCurrency(booking.depositAmount, currency)}</span>
                    </div>

                    <div className="flex justify-between items-center" data-testid="remaining-balance">
                      <span className="text-sm font-medium text-amber-700">Remaining balance due</span>
                      <span className="font-bold text-amber-700 text-lg">{formatCurrency(booking.balanceAmount, currency)}</span>
                    </div>

                    {booking.balanceDueDate && (
                      <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3" data-testid="balance-due-date">
                        <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        <span className="text-amber-800">
                          Balance of {formatCurrency(booking.balanceAmount, currency)} due by {formatDate(booking.balanceDueDate)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : booking ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center" data-testid="amount-paid">
                      <span className="text-sm font-medium text-green-700">Full price paid</span>
                      <span className="font-bold text-green-700 text-lg">{formatCurrency(booking.totalPrice, currency)}</span>
                    </div>
                    <div className="bg-green-100 border border-green-200 rounded-lg p-3" data-testid="no-balance">
                      <p className="text-sm text-green-800 font-medium">Your booking is fully paid. No remaining balance.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center" data-testid="amount-paid">
                    <span className="text-sm font-medium text-green-700">Amount Paid</span>
                    <span className="font-bold text-green-700">{formatCurrency(experience.price, currency)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {hasOutstandingBalance && booking && (
              <Card data-testid="balance-payment-section" className="border-amber-200 bg-amber-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="h-5 w-5 text-amber-600" />
                    Pay Remaining Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {showPaymentForm && clientSecret ? (
                    <Elements stripe={stripePromise} options={{ clientSecret }} key={clientSecret}>
                      <BalancePaymentForm
                        bookingId={booking.id}
                        amount={parseFloat(booking.balanceAmount)}
                        currency={currency}
                        onSuccess={handleBalancePaymentSuccess}
                      />
                    </Elements>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-700">
                        You can pay your remaining balance of{" "}
                        <span className="font-bold text-amber-700">{formatCurrency(booking.balanceAmount, currency)}</span>{" "}
                        now to complete your booking.
                      </p>
                      <Button
                        onClick={handlePayBalance}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                        data-testid="pay-balance-button"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Pay Remaining Balance {formatCurrency(booking.balanceAmount, currency)}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {experience.requireMinimumParticipants ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Group Progress</span>
                    <Badge variant="secondary">
                      MVG Required
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MVGProgressWidget 
                    experienceId={experience.id}
                    showTitle={false}
                    refreshInterval={30000}
                    className="mb-4"
                  />
                  <div className="text-sm text-gray-600 space-y-2">
                    <p>Your payment is held securely until the minimum group is reached</p>
                    <p>Full refund if minimum not met by deadline</p>
                    <p>You'll be charged only when the event confirms</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>What Happens Next</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm text-gray-700">
                    {hasOutstandingBalance ? (
                      <>
                        <p>Your spot is secured with the deposit.</p>
                        <p>You will receive a confirmation email with your booking details.</p>
                        <p>The remaining balance must be paid before the due date.</p>
                        <p>You can pay the balance now using the button above, or we'll send you a reminder before it's due.</p>
                      </>
                    ) : (
                      <>
                        <p>Your booking is confirmed and fully paid.</p>
                        <p>You will receive a confirmation email with your booking details.</p>
                        <p>We'll send you updates as the event approaches.</p>
                        <p>Connect with other participants in the community hub.</p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              <Link href={`/experience/${experience.id}`}>
                <Button className="w-full" variant="outline">
                  View Experience Details
                </Button>
              </Link>
              <Link href="/bookings">
                <Button className="w-full" variant="outline">
                  View My Bookings
                </Button>
              </Link>
              <Link href="/">
                <Button className="w-full" variant="ghost">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
