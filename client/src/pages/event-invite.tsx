import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import Navigation from "@/components/navigation";
import MVGProgressWidget from "@/components/MVGProgressWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { normalizeImageUrl } from "@/lib/utils";
import { 
  Users, 
  Calendar, 
  MapPin, 
  Star,
  UserPlus,
  Share2
} from "lucide-react";

type Experience = {
  id: string;
  title: string;
  shortDescription?: string;
  description: string;
  price: number;
  startDate: string;
  endDate: string;
  location: string;
  maxParticipants: number;
  currentParticipants: number;
  coverImageUrl?: string;
  category: string;
  requireMinimumParticipants?: boolean;
  minimumParticipants?: number;
  mvgMin?: number;
  mvgDeadline?: string;
  currency?: string | null;
  ticketSkus?: Array<{ pricePerPerson?: number | string | null }>;
};

type User = {
  id: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  email?: string;
};

export default function EventInvite() {
  const [, params] = useRoute("/event/:id");
  const { isAuthenticated } = useAuth();
  const [referrerId, setReferrerId] = useState<string | null>(null);
  const experienceId = params?.id;

  useEffect(() => {
    // Get referrer ID from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    setReferrerId(ref);
  }, []);

  const { data: experience, isLoading: experienceLoading } = useQuery<Experience>({
    queryKey: ["/api/experiences", experienceId],
    enabled: !!experienceId,
  });

  const { data: referrer } = useQuery<User>({
    queryKey: ["/api/users", referrerId],
    enabled: !!referrerId,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (experienceLoading) {
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

  const spotsLeft = experience.maxParticipants - experience.currentParticipants;

  // The headline price lives on the ticket when the creator set one up, and
  // only falls back to the experience column for older single-price events.
  // Reading experience.price alone showed 0 for anything ticketed.
  const ticketSkus: any[] = Array.isArray((experience as any).ticketSkus)
    ? (experience as any).ticketSkus
    : [];
  const ticketPrices = ticketSkus
    .map((sku: any) => Number(sku?.pricePerPerson))
    .filter((price: number) => Number.isFinite(price) && price > 0);
  const displayPrice = ticketPrices.length
    ? Math.min(...ticketPrices)
    : Number((experience as any).price ?? 0);
  const isFree = displayPrice <= 0;
  const averageRating = 4.8; // Placeholder

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Referral Banner */}
      {referrer && (
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center space-x-3">
              <UserPlus className="h-5 w-5" />
              <span className="font-medium">
                {referrer.firstName || "Someone"} invited you to join this experience!
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Hero Image */}
      <div className="relative h-96 overflow-hidden">
        <img 
          src={normalizeImageUrl(experience.coverImageUrl) || "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&h=600"} 
          alt={experience.title}
          className="w-full h-full object-cover" 
        />
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="absolute top-4 right-4 flex space-x-2">
          <Button variant="secondary" size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <Badge className="bg-primary/10 text-primary">
                  {experience.category.replace("_", " & ")}
                </Badge>
                <div className="flex items-center space-x-1">
                  <Star className="h-4 w-4 text-yellow-400 fill-current" />
                  <span className="text-sm font-medium">{averageRating.toFixed(1)}</span>
                  <span className="text-sm text-gray-500">(24 reviews)</span>
                </div>
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                {experience.title}
              </h1>
              
              <div className="flex flex-wrap items-center gap-4 text-gray-600 mb-6">
                <div className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  <span>{experience.location}</span>
                </div>
                <div className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  <span>{formatDate(experience.startDate)}</span>
                  {experience.startDate !== experience.endDate && (
                    <span> - {formatDate(experience.endDate)}</span>
                  )}
                </div>
                <div className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  <span>{experience.currentParticipants}/{experience.maxParticipants} joined</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">About this Experience</h2>
              <p className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {experience.description || experience.shortDescription}
              </p>
            </div>
          </div>

          {/* Booking Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardContent className="p-6">
                <div className="text-center mb-6">
                  <div className="flex items-center justify-center mb-2">
                    <span className="text-3xl font-bold text-gray-900" data-testid="invite-price">
                      {formatMoney(displayPrice, experience.currency)}
                    </span>
                    <span className="text-gray-500 ml-1">/person</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {spotsLeft > 0 ? `${spotsLeft} spots remaining` : "Fully booked"}
                  </p>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Start Date:</span>
                    <span className="font-medium">{formatDate(experience.startDate)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">End Date:</span>
                    <span className="font-medium">{formatDate(experience.endDate)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Location:</span>
                    <span className="font-medium">{experience.location}</span>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* MVG Progress Widget */}
                {experience.requireMinimumParticipants && (
                  <div className="mb-6">
                    <MVGProgressWidget 
                      experienceId={experience.id}
                      showTitle={true}
                      refreshInterval={30000}
                      className="mb-4"
                    />
                  </div>
                )}

                <div className="space-y-3">
                  {spotsLeft <= 0 ? (
                    <Button className="w-full" size="lg" disabled>
                      Fully Booked
                    </Button>
                  ) : isAuthenticated ? (
                    <Link href={`/checkout/${experience.id}${referrerId ? `?ref=${referrerId}` : ''}`}>
                      <Button className="w-full btn-gradient" size="lg" data-testid="button-book-now">
                        {isFree
                          ? "Reserve your spot"
                          : `Join Experience - ${formatMoney(displayPrice, experience.currency)}`}
                      </Button>
                    </Link>
                  ) : (
                    <div className="space-y-3">
                      {/* A shared link is opened by someone signed out, which is
                          the whole point of sharing it. They used to get a bare
                          "Sign in to Join" with no price anywhere on the button,
                          so a paid event looked like it had no paid option. The
                          price goes on the button, and returnTo brings them back
                          to this event instead of dropping them on a dashboard. */}
                      <Link href={`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}>
                        <Button className="w-full btn-gradient" size="lg" data-testid="button-book-now">
                          {isFree
                            ? "Sign in to reserve your spot"
                            : `Join Experience - ${formatMoney(displayPrice, experience.currency)}`}
                        </Button>
                      </Link>
                      <p className="text-xs text-center text-gray-500">
                        You'll be brought straight back here after signing in.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}