import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { normalizeImageUrl } from "@/lib/utils";
import { 
  Timer, 
  Calendar, 
  MapPin, 
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  AlertTriangle,
  RotateCcw
} from "lucide-react";

interface Reservation {
  id: string;
  experienceId: string;
  status: 'active' | 'expired' | 'converted';
  createdAt: string;
  expiresAt: string;
  reservationNotes?: string;
  convertedBookingId?: string;
  experience: {
    id: string;
    title: string;
    price: string;
    location: string;
    startDate: string;
    endDate: string;
    coverImageUrl?: string;
    maxParticipants: number;
    currentParticipants: number;
  };
}

export default function ReservationsDashboard() {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();

  // Fetch user's reservations
  const { data: reservations = [], isLoading, refetch } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
    enabled: !!isAuthenticated,
  });

  // Convert reservation mutation
  const convertReservationMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      const response = await apiRequest('POST', `/api/reservations/${reservationId}/convert`);
      return await response.json();
    },
    onSuccess: (data: any, reservationId: string) => {
      const reservation = reservations.find((r) => r.id === reservationId);
      toast({
        title: "Conversion Successful!",
        description: `Your reservation for "${reservation?.experience.title}" has been converted to a booking.`,
      });
      // Redirect to payment page
      if (data.clientSecret && data.bookingId) {
        window.location.href = `/checkout/${reservation?.experience.id}?clientSecret=${data.clientSecret}&bookingId=${data.bookingId}`;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Conversion Failed",
        description: error.message || "Unable to convert reservation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Cancel reservation mutation
  const cancelReservationMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      const response = await apiRequest('DELETE', `/api/reservations/${reservationId}`);
      return await response.json();
    },
    onSuccess: (_, reservationId: string) => {
      const reservation = reservations.find((r) => r.id === reservationId);
      toast({
        title: "Reservation Cancelled",
        description: `Your reservation for "${reservation?.experience.title}" has been cancelled.`,
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation Failed",
        description: error.message || "Unable to cancel reservation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Countdown timer hook
  const useCountdown = (expiresAt: string) => {
    const [timeRemaining, setTimeRemaining] = useState<string>("");
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
      const updateCountdown = () => {
        const now = new Date().getTime();
        const expiry = new Date(expiresAt).getTime();
        const diff = expiry - now;

        if (diff <= 0) {
          setTimeRemaining("Expired");
          setIsExpired(true);
        } else {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          
          if (days > 0) {
            setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
          } else if (hours > 0) {
            setTimeRemaining(`${hours}h ${minutes}m`);
          } else {
            setTimeRemaining(`${minutes}m`);
          }
          setIsExpired(false);
        }
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 60000); // Update every minute

      return () => clearInterval(interval);
    }, [expiresAt]);

    return { timeRemaining, isExpired };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleConvertReservation = (reservationId: string) => {
    convertReservationMutation.mutate(reservationId);
  };

  const handleCancelReservation = (reservationId: string) => {
    cancelReservationMutation.mutate(reservationId);
  };

  // Filter reservations by status
  const activeReservations = reservations.filter((r) => r.status === 'active');
  const expiredReservations = reservations.filter((r) => r.status === 'expired');
  const convertedReservations = reservations.filter((r) => r.status === 'converted');

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Please Sign In</h1>
            <p className="text-gray-600 mb-6">You need to sign in to view your reservations.</p>
            <a href="/api/login">
              <Button className="btn-gradient">Sign In</Button>
            </a>
          </div>
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
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96 mb-8" />
            <div className="grid gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2" data-testid="text-page-title">
              My Reservations
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your temporarily reserved spots and convert them to bookings
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Timer className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Active</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-active-count">
                      {activeReservations.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Converted</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-converted-count">
                      {convertedReservations.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <XCircle className="h-8 w-8 text-red-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Expired</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-expired-count">
                      {expiredReservations.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <RotateCcw className="h-8 w-8 text-purple-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Total</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="text-total-count">
                      {reservations.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Reservations */}
          {activeReservations.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                Active Reservations ({activeReservations.length})
              </h2>
              <div className="grid gap-6">
                {activeReservations.map((reservation) => {
                  const { timeRemaining, isExpired } = useCountdown(reservation.expiresAt);
                  return (
                    <ReservationCard
                      key={reservation.id}
                      reservation={reservation}
                      timeRemaining={timeRemaining}
                      isExpired={isExpired}
                      onConvert={handleConvertReservation}
                      onCancel={handleCancelReservation}
                      convertLoading={convertReservationMutation.isPending}
                      cancelLoading={cancelReservationMutation.isPending}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Converted Reservations */}
          {convertedReservations.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                Successfully Converted ({convertedReservations.length})
              </h2>
              <div className="grid gap-6">
                {convertedReservations.map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    timeRemaining=""
                    isExpired={false}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Expired Reservations */}
          {expiredReservations.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                Expired Reservations ({expiredReservations.length})
              </h2>
              <div className="grid gap-6">
                {expiredReservations.map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                    timeRemaining="Expired"
                    isExpired={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {reservations.length === 0 && (
            <div className="text-center py-12">
              <Timer className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No Reservations Yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                You haven't made any spot reservations yet. Explore experiences and reserve your spots!
              </p>
              <Link href="/experiences">
                <Button className="btn-gradient">Browse Experiences</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Reservation Card Component
interface ReservationCardProps {
  reservation: Reservation;
  timeRemaining: string;
  isExpired: boolean;
  onConvert?: (id: string) => void;
  onCancel?: (id: string) => void;
  convertLoading?: boolean;
  cancelLoading?: boolean;
}

function ReservationCard({ 
  reservation, 
  timeRemaining, 
  isExpired, 
  onConvert, 
  onCancel, 
  convertLoading, 
  cancelLoading 
}: ReservationCardProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return isExpired ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800';
      case 'converted':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return isExpired ? <AlertTriangle className="h-4 w-4" /> : <Timer className="h-4 w-4" />;
      case 'converted':
        return <CheckCircle className="h-4 w-4" />;
      case 'expired':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Timer className="h-4 w-4" />;
    }
  };

  const spotsLeft = reservation.experience.maxParticipants - reservation.experience.currentParticipants;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row">
          {/* Experience Image */}
          <div className="w-full md:w-48 h-48 md:h-auto">
            <img
              src={normalizeImageUrl(reservation.experience.coverImageUrl) || "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300"}
              alt={reservation.experience.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Content */}
          <div className="flex-1 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {reservation.experience.title}
                  </h3>
                  <Badge className={getStatusColor(reservation.status)}>
                    {getStatusIcon(reservation.status)}
                    <span className="ml-1 capitalize">
                      {reservation.status === 'active' && isExpired ? 'Expired' : reservation.status}
                    </span>
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1" />
                    <span>{reservation.experience.location}</span>
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    <span>{formatDate(reservation.experience.startDate)}</span>
                  </div>
                  <div className="flex items-center">
                    <DollarSign className="h-4 w-4 mr-1" />
                    <span>{reservation.experience.price}</span>
                  </div>
                  <div className="flex items-center">
                    <span>{spotsLeft} spots left</span>
                  </div>
                </div>

                {reservation.status === 'active' && (
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {isExpired ? "Reservation expired" : `Expires in ${timeRemaining}`}
                    </span>
                  </div>
                )}

                {reservation.reservationNotes && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <strong>Notes:</strong> {reservation.reservationNotes}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              {reservation.status === 'active' && !isExpired && (
                <>
                  <Button
                    onClick={() => onConvert?.(reservation.id)}
                    disabled={convertLoading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    data-testid={`button-convert-${reservation.id}`}
                  >
                    {convertLoading ? "Converting..." : "Complete Booking"}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <Button
                    onClick={() => onCancel?.(reservation.id)}
                    disabled={cancelLoading}
                    variant="outline"
                    data-testid={`button-cancel-${reservation.id}`}
                  >
                    Cancel Reservation
                  </Button>
                </>
              )}
              
              {reservation.status === 'converted' && (
                <Link href={`/experience/${reservation.experience.id}`}>
                  <Button variant="outline" className="w-full sm:w-auto">
                    View Experience
                  </Button>
                </Link>
              )}

              {(reservation.status === 'expired' || (reservation.status === 'active' && isExpired)) && spotsLeft > 0 && (
                <Link href={`/experience/${reservation.experience.id}`}>
                  <Button variant="outline" className="w-full sm:w-auto">
                    Book Again
                  </Button>
                </Link>
              )}

              <Link href={`/experience/${reservation.experience.id}`}>
                <Button variant="ghost" className="w-full sm:w-auto">
                  View Details
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}