import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users, Clock, CreditCard } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/navigation";

function formatCurrency(amount: string | number | null, currency: string = 'EUR'): string {
  if (amount === null || amount === undefined) return '-';
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numAmount)) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 0,
  }).format(numAmount);
}

export default function Bookings() {
  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const { data: bookings, isLoading } = useQuery<any[]>({
    queryKey: ["/api/user/bookings"],
    enabled: !!user
  });

  const { data: reservations, isLoading: reservationsLoading } = useQuery<any[]>({
    queryKey: ["/api/user/reservations"],
    enabled: !!user
  });

  console.log("Bookings page loaded for user:", user?.email);
  console.log("User bookings data:", bookings);
  console.log("User reservations data:", reservations);

  if (!user) {
    console.log("User not authenticated, redirecting to login");
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">Please sign in</h2>
              <p className="text-gray-600 mb-4">You need to be signed in to view your bookings.</p>
              <Button asChild>
                <a href="/api/login" data-testid="link-login">Sign In</a>
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
              <p className="text-gray-600">Manage your upcoming and past experiences</p>
            </div>
            <Button asChild data-testid="button-browse-experiences">
              <Link href="/experiences">
                <Users className="h-4 w-4 mr-2" />
                Browse Experiences
              </Link>
            </Button>
          </div>

          {/* Active Reservations Section */}
          {reservations && reservations.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4" data-testid="text-reservations-title">
                Active Reservations
              </h2>
              <div className="space-y-4">
                {reservations.map((reservation: any) => {
                  const now = new Date();
                  const expiresAt = new Date(reservation.expiresAtISO || reservation.expiresAt);
                  const hoursRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
                  const minutesRemaining = Math.max(0, Math.floor(((expiresAt.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60)));

                  return (
                    <Card key={reservation.id} className="overflow-hidden border-l-4 border-l-purple-500">
                      <CardContent className="p-6">
                        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-xl font-semibold text-gray-900" data-testid={`text-reservation-title-${reservation.id}`}>
                                {reservation.experienceTitle || "Experience Reservation"}
                              </h3>
                              <Badge variant="secondary" className="bg-purple-100 text-purple-700" data-testid={`badge-reservation-status-${reservation.id}`}>
                                {reservation.status === "active" ? `Reserved (${hoursRemaining}h ${minutesRemaining}m remaining)` :
                                 reservation.status === "converted" ? "Converted to Booking" :
                                 reservation.status === "expired" ? "Expired" :
                                 "Cancelled"}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span data-testid={`text-reservation-date-${reservation.id}`}>
                                  {reservation.experienceStartDate ? 
                                    new Date(reservation.experienceStartDate).toLocaleDateString() : 
                                    "Date TBD"
                                  }
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                <span data-testid={`text-reservation-location-${reservation.id}`}>
                                  {reservation.experienceLocation || "Location TBD"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span className="font-medium text-purple-600" data-testid={`text-reservation-expires-${reservation.id}`}>
                                  Expires: {expiresAt.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4" />
                                <span className="font-medium" data-testid={`text-reservation-price-${reservation.id}`}>
                                  {formatCurrency(reservation.experiencePrice, reservation.experienceCurrency || 'EUR')}
                                </span>
                              </div>
                            </div>

                            {reservation.status === "active" && hoursRemaining < 12 && (
                              <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                <p className="text-sm text-orange-700 font-medium">
                                  ⚠️ Hurry! Your reservation expires in {hoursRemaining}h {minutesRemaining}m. Complete your booking to secure your spot.
                                </p>
                              </div>
                            )}
                            
                            {reservation.experienceShortDescription && (
                              <p className="mt-3 text-gray-600" data-testid={`text-reservation-description-${reservation.id}`}>
                                {reservation.experienceShortDescription}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex flex-col gap-2 lg:min-w-[140px]">
                            {reservation.status === "active" && (
                              <Button asChild size="sm" className="bg-purple-600 hover:bg-purple-700" data-testid={`button-complete-booking-${reservation.id}`}>
                                <Link href={`/experience/${reservation.experienceId}`}>
                                  Complete Booking
                                </Link>
                              </Button>
                            )}
                            <Button asChild variant="outline" size="sm" data-testid={`button-view-reservation-experience-${reservation.id}`}>
                              <Link href={`/experience/${reservation.experienceId}`}>
                                View Experience
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {!bookings || bookings.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-semibold mb-2" data-testid="text-no-bookings">No bookings yet</h3>
                <p className="text-gray-600 mb-6">Ready to embark on your first adventure? Discover amazing experiences waiting for you.</p>
                <div className="space-y-3">
                  <Button asChild size="lg" data-testid="button-discover-experiences">
                    <Link href="/experiences">
                      <Users className="h-4 w-4 mr-2" />
                      Discover Experiences
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" data-testid="button-join-community">
                    <Link href="/community">
                      Join Our Community
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {bookings.map((booking: any) => (
                <Card key={booking.id} className="overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900" data-testid={`text-booking-title-${booking.id}`}>
                            {booking.experienceTitle || "Experience Booking"}
                          </h3>
                          <Badge 
                            variant={
                              booking.status === "confirmed" && booking.balancePaid ? "default" :
                              booking.status === "confirmed" && !booking.balancePaid && parseFloat(booking.depositAmount || "0") > 0 ? "secondary" :
                              booking.status === "confirmed" ? "default" :
                              booking.status === "pending" ? "secondary" : 
                              booking.status === "refunded" ? "outline" :
                              "destructive"
                            }
                            data-testid={`badge-status-${booking.id}`}
                          >
                            {booking.status === "refunded" ? "Refunded" :
                             booking.status === "failed" ? "Failed" :
                             booking.status === "cancelled" ? "Cancelled" :
                             booking.status === "confirmed" && booking.balancePaid ? "Balance Paid" :
                             booking.status === "confirmed" && !booking.balancePaid && parseFloat(booking.depositAmount || "0") > 0 ? "Deposit Paid" :
                             booking.status === "confirmed" ? "Confirmed" :
                             "Pending"}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span data-testid={`text-booking-date-${booking.id}`}>
                              {booking.experienceStartDate ? 
                                new Date(booking.experienceStartDate).toLocaleDateString() : 
                                "Date TBD"
                              }
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span data-testid={`text-booking-location-${booking.id}`}>
                              {booking.experienceLocation || "Location TBD"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span data-testid={`text-booking-time-${booking.id}`}>
                              Booked {new Date(booking.bookingDate).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            <span className="font-medium" data-testid={`text-booking-amount-${booking.id}`}>
                              {formatCurrency(booking.amount, booking.currency || booking.experienceCurrency || 'EUR')}
                            </span>
                          </div>
                        </div>
                        
                        {/* Payment Details for Deposit Bookings */}
                        {parseFloat(booking.depositAmount || "0") > 0 && (
                          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Total Price:</span>
                                <span className="font-medium" data-testid={`text-total-price-${booking.id}`}>{formatCurrency(booking.totalPrice, booking.currency || booking.experienceCurrency || 'EUR')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Deposit Paid:</span>
                                <span className="font-medium text-green-700" data-testid={`text-deposit-paid-${booking.id}`}>{formatCurrency(booking.depositAmount, booking.currency || booking.experienceCurrency || 'EUR')}</span>
                              </div>
                              {!booking.balancePaid && parseFloat(booking.balanceAmount || "0") > 0 && (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Balance Due:</span>
                                    <span className="font-semibold text-orange-700" data-testid={`text-balance-due-${booking.id}`}>{formatCurrency(booking.balanceAmount, booking.currency || booking.experienceCurrency || 'EUR')}</span>
                                  </div>
                                  {booking.balanceDueDate && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Due By:</span>
                                      <span className="font-medium" data-testid={`text-balance-due-date-${booking.id}`}>
                                        {new Date(booking.balanceDueDate).toLocaleDateString()}
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                              {booking.balancePaid && (
                                <div className="flex justify-between col-span-2">
                                  <span className="text-gray-600">Balance Paid:</span>
                                  <span className="font-medium text-green-700" data-testid={`text-balance-paid-${booking.id}`}>{formatCurrency(booking.balanceAmount, booking.currency || booking.experienceCurrency || 'EUR')}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {booking.experienceShortDescription && (
                          <p className="mt-3 text-gray-600" data-testid={`text-booking-description-${booking.id}`}>
                            {booking.experienceShortDescription}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2 lg:min-w-[140px]">
                        <Button asChild size="sm" data-testid={`button-view-experience-${booking.id}`}>
                          <Link href={`/experience/${booking.experienceId}`}>
                            View Experience
                          </Link>
                        </Button>
                        {booking.status === "confirmed" && (
                          <Button asChild variant="outline" size="sm" data-testid={`button-join-community-${booking.id}`}>
                            <Link href="/community-hub">
                              Join Community
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2" data-testid="button-explore-more">
                  <Link href="/experiences">
                    <Users className="h-8 w-8" />
                    <span>Explore More Experiences</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2" data-testid="button-create-experience">
                  <Link href="/journey-builder">
                    <Calendar className="h-8 w-8" />
                    <span>Create Experience</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto p-4 flex flex-col items-center gap-2" data-testid="button-visit-community">
                  <Link href="/community">
                    <Users className="h-8 w-8" />
                    <span>Visit Community</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}