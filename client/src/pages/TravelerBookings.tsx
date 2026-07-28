import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, MapPin, CreditCard, Clock, Image as ImageIcon } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/navigation";

interface EnrichedBooking {
  id: string;
  experienceId: string;
  userId: string;
  status: string;
  amount: string | null;
  isDepositOnly: boolean | null;
  balancePaid: boolean | null;
  depositAmount: string | null;
  balanceAmount: string | null;
  balanceDueDate: string | null;
  totalPrice: string | null;
  ticketName: string | null;
  ticketQuantity: number | null;
  createdAt: string;
  bookingDate?: string;
  experience: {
    id: string;
    title: string;
    coverImageUrl: string | null;
    startDate: string | null;
    endDate: string | null;
    location: string | null;
    venue: string | null;
    price: string | null;
    currency: string | null;
    requireMinimumParticipants?: boolean | null;
    minimumParticipants: number;
    currentParticipants: number;
    mvgMet: boolean;
    lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
  } | null;
}

const formatCurrency = (amount: number | string | undefined | null, currency?: string | null) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  const currencyCode = (currency || 'EUR').toUpperCase();
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF ',
  };
  const symbol = symbols[currencyCode] || currencyCode + ' ';
  return `${symbol}${(Number.isFinite(numAmount) ? numAmount : 0).toFixed(2)}`;
};

type StatusInfo = { label: string; description: string; variant: "default" | "secondary" | "destructive" | "outline" };

const statusConfig: Record<string, StatusInfo> = {
  pending: { label: "Pending", description: "Awaiting confirmation", variant: "secondary" },
  deposit_authorized: { label: "Deposit Held", description: "Deposit held - awaiting trip confirmation", variant: "default" },
  deposit_paid: { label: "Deposit Paid", description: "Spot secured - balance due before the trip", variant: "default" },
  confirmed: { label: "Confirmed", description: "Trip confirmed!", variant: "default" },
  fully_paid: { label: "Paid", description: "Paid in full - your spot is confirmed", variant: "default" },
  cancelled: { label: "Cancelled", description: "Group not formed - deposit released", variant: "destructive" },
  refunded: { label: "Refunded", description: "Deposit refunded", variant: "outline" },
  failed: { label: "Failed", description: "Payment failed", variant: "destructive" },
};

// A "pending" booking on a minimum-group event is not awaiting payment — the
// money is already held and released only if the group never forms.
function resolveStatusInfo(booking: EnrichedBooking): StatusInfo {
  if (booking.status === 'pending' && booking.experience?.requireMinimumParticipants) {
    return {
      label: "Payment Held",
      description: "Paid and held until the minimum group size is reached",
      variant: "secondary",
    };
  }
  return statusConfig[booking.status] || { label: booking.status, description: "", variant: "secondary" as const };
}

function BookingDetailView({ booking, open, onClose }: { booking: EnrichedBooking | null; open: boolean; onClose: () => void }) {
  if (!booking) return null;

  const statusInfo = resolveStatusInfo(booking);
  const currency = booking.experience?.currency;
  const depositAmount = parseFloat(booking.depositAmount || "0");
  const totalPrice = parseFloat(booking.totalPrice || booking.experience?.price || "0");
  // Only a deposit booking has an outstanding balance. Deriving one from
  // total - deposit made fully paid bookings look like they still owed the
  // whole ticket price.
  const balanceAmount = parseFloat(booking.balanceAmount || "0");
  const isDepositBooking = booking.isDepositOnly === true && depositAmount > 0;
  const hasOutstandingBalance = isDepositBooking && !booking.balancePaid && balanceAmount > 0;
  const amountPaid = parseFloat(
    booking.amount || (isDepositBooking ? booking.depositAmount : booking.totalPrice) || "0",
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="dialog-booking-detail">
        <DialogHeader>
          <DialogTitle data-testid="text-detail-title">Booking Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {booking.experience?.coverImageUrl ? (
            <img 
              src={booking.experience.coverImageUrl} 
              alt={booking.experience.title || "Experience"} 
              className="w-full h-48 object-cover rounded-lg"
              data-testid="img-detail-cover"
            />
          ) : (
            <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
              <ImageIcon className="h-12 w-12 text-gray-400" />
            </div>
          )}

          <div>
            <h3 className="text-xl font-semibold" data-testid="text-detail-experience-title">
              {booking.experience?.title || "Experience"}
            </h3>
            
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={statusInfo.variant} data-testid="badge-detail-status">
                {statusInfo.label}
              </Badge>
              <span className="text-sm text-gray-600" data-testid="text-detail-status-description">
                {statusInfo.description}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {booking.experience?.startDate && (
              <div className="flex items-center gap-2" data-testid="text-detail-dates">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span>
                  {new Date(booking.experience.startDate).toLocaleDateString()}
                  {booking.experience.endDate && ` - ${new Date(booking.experience.endDate).toLocaleDateString()}`}
                </span>
              </div>
            )}
            
            {(booking.experience?.location || booking.experience?.venue) && (
              <div className="flex items-center gap-2" data-testid="text-detail-location">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span>{booking.experience.venue || booking.experience.location}</span>
              </div>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <h4 className="font-medium">Payment Summary</h4>

            {booking.ticketName && (
              <div className="flex justify-between text-sm" data-testid="text-detail-ticket">
                <span className="text-gray-600">Ticket</span>
                <span className="font-medium">
                  {booking.ticketName}
                  {booking.ticketQuantity && booking.ticketQuantity > 1 ? ` × ${booking.ticketQuantity}` : ''}
                </span>
              </div>
            )}

            {isDepositBooking ? (
              <>
                <div className="flex justify-between text-sm" data-testid="text-detail-deposit">
                  <span className="text-gray-600">Deposit Paid</span>
                  <span className="font-medium text-green-700">{formatCurrency(depositAmount, currency)}</span>
                </div>

                <div className="flex justify-between text-sm" data-testid="text-detail-balance">
                  <span className="text-gray-600">{booking.balancePaid ? 'Balance Paid' : 'Remaining Balance'}</span>
                  <span className={`font-medium ${booking.balancePaid ? 'text-green-700' : 'text-amber-700'}`}>
                    {formatCurrency(balanceAmount, currency)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-sm" data-testid="text-detail-deposit">
                <span className="text-gray-600">Amount Paid</span>
                <span className="font-medium text-green-700">{formatCurrency(amountPaid, currency)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm border-t pt-2" data-testid="text-detail-total">
              <span className="font-medium">Total Price</span>
              <span className="font-semibold">{formatCurrency(totalPrice, currency)}</span>
            </div>

            {!isDepositBooking && (
              <p className="text-sm text-green-700" data-testid="text-detail-no-balance">
                Paid in full — no remaining balance.
              </p>
            )}

            {hasOutstandingBalance && booking.balanceDueDate && (
              <div className="flex items-center gap-2 text-sm text-orange-600 mt-2" data-testid="text-detail-due-date">
                <Clock className="h-4 w-4" />
                <span>Balance due by {new Date(booking.balanceDueDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {booking.experience?.minimumParticipants && booking.experience.minimumParticipants > 0 && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium">Group Progress</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm" data-testid="mvg-progress-text">
                  <span className="text-gray-600">Participants Joined</span>
                  <span className="font-medium">
                    {booking.experience.currentParticipants || 0} / {booking.experience.minimumParticipants}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2" data-testid="mvg-progress-bar">
                  <div 
                    className={booking.experience.lifecycleStatus === 'confirmed' || booking.experience.mvgMet
                      ? "bg-green-600 h-2 rounded-full" 
                      : "bg-blue-600 h-2 rounded-full"}
                    style={{ 
                      width: `${Math.min(100, ((booking.experience.currentParticipants || 0) / booking.experience.minimumParticipants) * 100)}%` 
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm" data-testid="mvg-status-indicator">
                  {booking.experience.lifecycleStatus === 'confirmed' || booking.experience.mvgMet ? (
                    <span className="text-green-600">✅ Group confirmed — this trip is happening!</span>
                  ) : booking.experience.lifecycleStatus === 'cancelled' ? (
                    <span className="text-red-600">❌ Trip cancelled — deposit has been released.</span>
                  ) : (
                    <span className="text-gray-600">
                      Forming — trip confirms once {booking.experience.minimumParticipants} people join.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="text-xs text-gray-500" data-testid="text-detail-booking-date">
            Booked on {new Date(booking.bookingDate || booking.createdAt).toLocaleDateString()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TravelerBookings() {
  const [selectedBooking, setSelectedBooking] = useState<EnrichedBooking | null>(null);

  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const { data: bookings, isLoading } = useQuery<EnrichedBooking[]>({
    queryKey: ["/api/bookings/my-bookings"],
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">Please sign in</h2>
              <p className="text-gray-600 mb-4">You need to be signed in to view your bookings.</p>
              <Button asChild data-testid="link-login">
                <a href="/api/login">Sign In</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/4"></div>
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900" data-testid="text-page-title">My Bookings</h1>
              <p className="text-gray-600">View your trip bookings and payment status</p>
            </div>
            <Button asChild data-testid="button-browse-experiences">
              <Link href="/experiences">Browse Experiences</Link>
            </Button>
          </div>

          {!bookings || bookings.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-semibold mb-2" data-testid="text-no-bookings">No bookings yet</h3>
                <p className="text-gray-600 mb-6">Ready to embark on your first adventure? Discover amazing experiences waiting for you.</p>
                <Button asChild size="lg" data-testid="button-discover-experiences">
                  <Link href="/experiences">Discover Experiences</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {bookings.map((booking) => {
                const statusInfo = resolveStatusInfo(booking);
                const isDepositBooking = booking.isDepositOnly === true && parseFloat(booking.depositAmount || "0") > 0;
                const paidLabel = isDepositBooking ? 'Deposit' : 'Paid';
                const paidAmount = parseFloat(
                  booking.amount || (isDepositBooking ? booking.depositAmount : booking.totalPrice) || "0",
                );

                return (
                  <Card 
                    key={booking.id} 
                    className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedBooking(booking)}
                    data-testid={`card-booking-${booking.id}`}
                  >
                    <CardContent className="p-0">
                      <div className="flex">
                        {booking.experience?.coverImageUrl ? (
                          <img 
                            src={booking.experience.coverImageUrl} 
                            alt={booking.experience.title || "Experience"} 
                            className="w-32 h-32 object-cover flex-shrink-0"
                            data-testid={`img-booking-cover-${booking.id}`}
                          />
                        ) : (
                          <div className="w-32 h-32 bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="h-8 w-8 text-gray-400" />
                          </div>
                        )}
                        
                        <div className="flex-1 p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold text-lg" data-testid={`text-booking-title-${booking.id}`}>
                                {booking.experience?.title || "Experience"}
                              </h3>
                              <Badge 
                                variant={statusInfo.variant} 
                                className="mt-1"
                                data-testid={`badge-booking-status-${booking.id}`}
                              >
                                {statusInfo.label}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-1 text-sm text-gray-600" data-testid={`text-booking-deposit-${booking.id}`}>
                                <CreditCard className="h-4 w-4" />
                                <span>{paidLabel}: {formatCurrency(paidAmount, booking.experience?.currency)}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                            {booking.experience?.startDate && (
                              <div className="flex items-center gap-1" data-testid={`text-booking-date-${booking.id}`}>
                                <Calendar className="h-4 w-4" />
                                <span>{new Date(booking.experience.startDate).toLocaleDateString()}</span>
                              </div>
                            )}
                            {(booking.experience?.location || booking.experience?.venue) && (
                              <div className="flex items-center gap-1" data-testid={`text-booking-location-${booking.id}`}>
                                <MapPin className="h-4 w-4" />
                                <span>{booking.experience.venue || booking.experience.location}</span>
                              </div>
                            )}
                          </div>
                          
                          <p className="mt-2 text-xs text-gray-500" data-testid={`text-booking-created-${booking.id}`}>
                            Booked on {new Date(booking.bookingDate || booking.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      <BookingDetailView 
        booking={selectedBooking} 
        open={!!selectedBooking} 
        onClose={() => setSelectedBooking(null)} 
      />
    </div>
  );
}