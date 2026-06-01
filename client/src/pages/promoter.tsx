import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket, AlertTriangle, DollarSign, TrendingUp, Users, Copy, Check, ExternalLink, Clock, CheckCircle, XCircle, Sparkles, Calendar, MapPin, RefreshCw, Send, Trophy } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Navigation from "@/components/navigation";
import { ShareKitModal } from "@/components/ShareKitModal";

interface EarningsSummary {
  byCurrency: Array<{
    currency: string;
    estimated: number;
    locked: number;
    voided: number;
    totalBookings: number;
  }>;
}

interface PromotedExperience {
  experience: {
    id: string;
    title: string;
    slug: string;
    mvgStatus: string | null;
    status: string;
    startDate: string | null;
    endDate: string | null;
    location: string | null;
    lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
  };
  spotsBooked: number;
  estimatedCommission: number;
  lockedCommission: number;
  currency: string;
}

interface PromoterBooking {
  id: string;
  experienceId: string;
  experienceName: string;
  experienceSlug: string;
  ticketTypes: string | null;
  totalAmount: string;
  commissionAmount: string | null;
  commissionCurrency: string | null;
  commissionStatus: string | null;
  bookingDate: string;
  status: string;
}

interface PromoterInfo {
  promoterCode: string | null;
  firstName: string | null;
  lastName: string | null;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'TBD';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Single source of truth badge - reads lifecycleStatus directly from backend
function getMVGStatusBadge(mvgStatus: string | null, lifecycleStatus?: string) {
  const status = lifecycleStatus ?? 'confirmed';
  switch (status) {
    case 'confirmed':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Confirmed</Badge>;
    case 'cancelled':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Cancelled</Badge>;
    case 'forming':
    default:
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">Forming</Badge>;
  }
}

function getCommissionStatusBadge(status: string | null) {
  switch (status) {
    case 'locked':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"><CheckCircle className="h-3 w-3 mr-1" />Locked</Badge>;
    case 'voided':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100"><XCircle className="h-3 w-3 mr-1" />Voided</Badge>;
    case 'estimated':
    default:
      return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"><Clock className="h-3 w-3 mr-1" />Estimated</Badge>;
  }
}

function EarningsSummaryCard({ data, isLoading }: { data: EarningsSummary | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data || data.byCurrency.length === 0) {
    return (
      <Card className="mb-8">
        <CardContent className="p-6 text-center text-muted-foreground">
          <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No trip credit yet. Share your referral link to start earning!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mb-8">
      {data.byCurrency.map((currencyData) => (
        <div key={currencyData.currency}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">Estimated</span>
                </div>
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {formatCurrency(currencyData.estimated, currencyData.currency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Pending MVG outcome</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Locked</span>
                </div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(currencyData.locked, currencyData.currency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">MVG met - confirmed</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm">Voided</span>
                </div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(currencyData.voided, currencyData.currency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">MVG failed - refunded</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">Total Bookings</span>
                </div>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {currencyData.totalBookings}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Referred bookings ({currencyData.currency})</p>
              </CardContent>
            </Card>
          </div>
        </div>
      ))}
    </div>
  );
}

function PromoterInfoCard({ data, isLoading }: { data: PromoterInfo | undefined; isLoading: boolean }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          My Referral Code
        </CardTitle>
        <CardDescription>Share your referral link to earn trip credit when friends join</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">My Referral Code</label>
          <div className="flex items-center gap-2 mt-1">
            <code className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono">
              {data?.promoterCode || '—'}
            </code>
            {data?.promoterCode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(data.promoterCode!)}
                className="min-w-[80px]"
              >
                {copied ? <><Check className="h-4 w-4 mr-1" />Copied!</> : <><Copy className="h-4 w-4 mr-1" />Copy</>}
              </Button>
            )}
          </div>
        </div>
        {data?.promoterCode && (
          <p className="text-sm text-muted-foreground">
            Your referral links are generated per trip in the <strong>My Trips</strong> section below.
            Copy the link for any trip and share it — anyone who books earns you trip credit.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PromotedExperiencesCard({ data, isLoading }: { data: PromotedExperience[] | undefined; isLoading: boolean }) {
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-indigo-500" />
            My Promoted Trips
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <TrendingUp className="h-10 w-10 mx-auto mb-3 text-indigo-300" />
          <h3 className="font-medium text-lg mb-2">You haven't added any trips to promote yet</h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto">
            Browse the Experience Pool, click "Promote This Trip" to add a trip here, then share your unique referral link.
          </p>
          <Button asChild className="bg-pink-600 hover:bg-pink-700">
            <Link href="/promoter/experience-pool">
              <Sparkles className="h-4 w-4 mr-2" />
              Browse Experience Pool
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const baseUrl = import.meta.env.VITE_APP_BASE_URL || 'https://greatapp.ai';

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              My Promoted Trips
            </CardTitle>
            <CardDescription>Trips you're promoting with earnings and referral links</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/promoter/experience-pool">
              <Sparkles className="h-4 w-4 mr-2" />
              Add More Trips
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.map((item) => (
            <PromotedExperienceItem 
              key={item.experience.id} 
              item={item} 
              baseUrl={baseUrl}
              onNavigate={() => navigate(`/experience/${item.experience.slug || item.experience.id}`)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PromotedExperienceItem({ 
  item, 
  baseUrl,
  onNavigate 
}: { 
  item: PromotedExperience; 
  baseUrl: string;
  onNavigate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { data: promoterInfo } = useQuery<PromoterInfo>({
    queryKey: ['/api/promoter/info'],
  });
  
  // Use slug if available, otherwise fall back to experience ID
  const experienceSlug = item.experience.slug || item.experience.id;
  const referralLink = promoterInfo?.promoterCode && experienceSlug
    ? `${baseUrl}/experience/${experienceSlug}?ref=${promoterInfo.promoterCode}`
    : '';

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Header: Title + MVG Status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-base truncate">{item.experience.title}</h4>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              {item.experience.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {item.experience.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(item.experience.startDate)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getMVGStatusBadge(item.experience.mvgStatus, item.experience.lifecycleStatus)}
            <Button variant="ghost" size="sm" onClick={onNavigate} className="h-8 w-8 p-0">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Earnings Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Your Referrals</p>
            <p className="font-bold text-lg text-purple-600 dark:text-purple-400">{item.spotsBooked}</p>
            <p className="text-xs text-muted-foreground">spots</p>
          </div>
          <div className="text-center border-l border-r border-muted-foreground/20">
            <p className="text-xs text-muted-foreground mb-1">Estimated</p>
            <p className="font-bold text-lg text-gray-600 dark:text-gray-400">
              {formatCurrency(item.estimatedCommission, item.currency)}
            </p>
            <p className="text-xs text-muted-foreground">pending</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Locked</p>
            <p className="font-bold text-lg text-green-600 dark:text-green-400">
              {formatCurrency(item.lockedCommission, item.currency)}
            </p>
            <p className="text-xs text-muted-foreground">confirmed</p>
          </div>
        </div>
        
        {/* Referral Link */}
        {referralLink && (
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs truncate">
              {referralLink}
            </code>
            <Button
              variant={copied ? "default" : "outline"}
              size="sm"
              onClick={() => handleCopy(referralLink)}
              className={`min-w-[90px] ${copied ? 'bg-green-600 hover:bg-green-700' : ''}`}
            >
              {copied ? <><Check className="h-3 w-3 mr-1" />Copied!</> : <><Copy className="h-3 w-3 mr-1" />Copy Link</>}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BookingsTableCard({ data, isLoading }: { data: PromoterBooking[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Referred Bookings
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-8">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No bookings yet. When someone uses your referral link, their bookings will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-500" />
          Referred Bookings
        </CardTitle>
        <CardDescription>Detailed view of all bookings from your referrals</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Experience</TableHead>
                <TableHead>Booking ID</TableHead>
                <TableHead>Booking Value</TableHead>
                <TableHead>Trip Credit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell className="font-medium">{booking.experienceName}</TableCell>
                  <TableCell className="font-mono text-sm">{booking.id.slice(0, 8)}...</TableCell>
                  <TableCell>
                    {/* DATA CONTRACT: Use booking.commissionCurrency only - no fallback */}
                    {booking.commissionCurrency
                      ? formatCurrency(parseFloat(booking.totalAmount || '0'), booking.commissionCurrency)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {/* DATA CONTRACT: Commission from stored values only - no fallback */}
                    {booking.commissionAmount && booking.commissionCurrency
                      ? formatCurrency(parseFloat(booking.commissionAmount), booking.commissionCurrency)
                      : '—'}
                  </TableCell>
                  <TableCell>{getCommissionStatusBadge(booking.commissionStatus)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(booking.bookingDate).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface ImpactStats {
  referralCode: string | null;
  friendsJoined: number;
  peopleInvited: number;
  tripCreditsEarned: number;
  shareExperience: {
    id: string;
    title: string;
    location?: string;
    coverImageUrl?: string;
    lifecycleStatus?: string;
    currency?: string;
  } | null;
}

function getMotivationalMessage(friendsJoined: number): string {
  if (friendsJoined === 0) return "You haven't invited anyone yet. Share your link and help your trip confirm faster!";
  if (friendsJoined <= 2) return "Great start! Every person you bring gets the trip one step closer to confirming.";
  if (friendsJoined <= 5) return "You're on fire! Your squad is helping make this trip happen.";
  return "🏆 Trip Co-Founder! You are the reason this trip is happening.";
}

function RecruitmentStatsSection({
  stats,
  isLoading,
  onRefresh,
  isRefreshing,
  onInviteClick,
}: {
  stats: ImpactStats | undefined;
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  onInviteClick: () => void;
}) {
  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="text-center">
              <CardContent className="pt-6 pb-5">
                <Skeleton className="h-10 w-16 mx-auto mb-2" />
                <Skeleton className="h-4 w-24 mx-auto mb-1" />
                <Skeleton className="h-3 w-32 mx-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-14 w-full rounded-lg mb-4" />
        <Skeleton className="h-11 w-48 rounded-lg" />
      </div>
    );
  }

  const friendsJoined = stats?.friendsJoined ?? 0;
  const peopleInvited = stats?.peopleInvited ?? 0;
  const tripCreditsEarned = stats?.tripCreditsEarned ?? 0;
  const message = getMotivationalMessage(friendsJoined);
  const isTrophyTier = friendsJoined >= 6;

  return (
    <div className="mb-8" data-testid="recruitment-stats-section">
      {/* Three stat cards */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Your Recruitment Stats</h2>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          data-testid="refresh-stats-btn"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {/* Card 1 — People Invited */}
        <Card className="border-primary/10 dark:border-primary/20 bg-gradient-to-br from-primary/5 to-white dark:from-primary/10 dark:to-gray-900 text-center" data-testid="stat-people-invited">
          <CardContent className="pt-6 pb-5">
            <div className="text-3xl mb-1">📨</div>
            <p className="text-4xl font-black text-primary mb-1">{peopleInvited}</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">People Invited</p>
            <p className="text-xs text-muted-foreground mt-0.5">Travelers who clicked your link</p>
          </CardContent>
        </Card>

        {/* Card 2 — Friends Joined */}
        <Card className="border-primary/10 dark:border-primary/20 bg-gradient-to-br from-primary/5 to-white dark:from-primary/10 dark:to-gray-900 text-center" data-testid="stat-friends-joined">
          <CardContent className="pt-6 pb-5">
            <div className="text-3xl mb-1">👥</div>
            <p className="text-4xl font-black text-primary mb-1">{friendsJoined}</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Friends Joined</p>
            <p className="text-xs text-muted-foreground mt-0.5">Travelers who joined through you</p>
          </CardContent>
        </Card>

        {/* Card 3 — Trip Credits Earned */}
        <Card className="border-green-100 dark:border-green-900/40 bg-gradient-to-br from-green-50 to-white dark:from-green-950/30 dark:to-gray-900 text-center" data-testid="stat-trip-credits">
          <CardContent className="pt-6 pb-5">
            <div className="text-3xl mb-1">💰</div>
            <p className="text-4xl font-black text-green-600 dark:text-green-400 mb-1">
              €{tripCreditsEarned.toFixed(0)}
            </p>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Trip Credits Earned</p>
            <p className="text-xs text-muted-foreground mt-0.5">Applied to your next trip</p>
          </CardContent>
        </Card>
      </div>

      {/* Motivational message */}
      <div
        className={`rounded-xl px-5 py-4 mb-5 flex items-start gap-3 ${
          isTrophyTier
            ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 border border-yellow-200 dark:border-yellow-800'
            : 'bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30'
        }`}
        data-testid="motivational-message"
      >
        {isTrophyTier ? (
          <Trophy className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
        ) : (
          <Rocket className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        )}
        <p className={`text-sm font-medium ${isTrophyTier ? 'text-yellow-800 dark:text-yellow-300' : 'text-primary dark:text-primary/80'}`}>
          {message}
        </p>
      </div>

      {/* Invite the Squad CTA */}
      <Button
        onClick={onInviteClick}
        className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-5 h-auto text-base shadow-lg w-full sm:w-auto"
        data-testid="invite-squad-btn"
      >
        <Send className="h-5 w-5 mr-2" />
        Invite the Squad
      </Button>
    </div>
  );
}

export default function PromoterDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [showShareModal, setShowShareModal] = useState(false);

  const { data: impactStats, isLoading: statsLoading, isFetching: statsFetching, refetch: refetchStats } = useQuery<ImpactStats>({
    queryKey: ['/api/me/impact-stats'],
    enabled: !!user,
  });

  const { data: earnings, isLoading: earningsLoading } = useQuery<EarningsSummary>({
    queryKey: ['/api/promoter/earnings'],
    enabled: !!user,
  });

  const { data: experiences, isLoading: experiencesLoading } = useQuery<PromotedExperience[]>({
    queryKey: ['/api/promoter/experiences'],
    enabled: !!user,
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery<PromoterBooking[]>({
    queryKey: ['/api/promoter/bookings'],
    enabled: !!user,
  });

  const { data: promoterInfo, isLoading: infoLoading, refetch: refetchInfo } = useQuery<PromoterInfo>({
    queryKey: ['/api/promoter/info'],
    enabled: !!user,
  });

  // Auto-generate referral code for any logged-in user who doesn't have one yet
  const ensureCodeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/ensure-referral-code", {}),
    onSuccess: () => { refetchInfo(); refetchStats(); },
  });

  useEffect(() => {
    if (user && !authLoading) {
      ensureCodeMutation.mutate();
    }
  }, [user?.id, authLoading]);

  // Share experience: use most recent from impact stats, fallback to first promoted experience
  const shareExperience = impactStats?.shareExperience ?? (experiences?.[0]?.experience
    ? {
        id: experiences[0].experience.id,
        title: experiences[0].experience.title,
        location: experiences[0].experience.location ?? undefined,
        lifecycleStatus: experiences[0].experience.lifecycleStatus,
      }
    : null);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Sign In Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Please sign in to view your referrals and impact.
            </p>
            <Button onClick={() => window.location.href = '/api/login'}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white dark:from-gray-900 dark:to-gray-950">
      <Navigation />
      <div className="max-w-6xl mx-auto py-12 px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <div className="p-2 bg-primary/10 dark:bg-primary/20 rounded-lg">
              <Rocket className="h-6 w-6 text-primary dark:text-primary/80" />
            </div>
            My Impact
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Every person you invite brings your trip one step closer to confirming.
          </p>
        </div>

        {/* ── RECRUITMENT STATS SCOREBOARD ─────────────────────────── */}
        <RecruitmentStatsSection
          stats={impactStats}
          isLoading={statsLoading}
          onRefresh={() => refetchStats()}
          isRefreshing={statsFetching}
          onInviteClick={() => setShowShareModal(true)}
        />

        {/* Impact explainer banner */}
        <Card className="mb-8 border-primary/20 dark:border-primary/30 bg-gradient-to-r from-primary/5 to-white dark:from-primary/10 dark:to-gray-900">
          <CardContent className="py-5">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Rocket className="h-8 w-8 text-primary shrink-0" />
              <div className="text-center sm:text-left">
                <p className="font-semibold text-gray-900 dark:text-white">
                  Share your referral link and earn trip credit when friends join.
                </p>
                <p className="text-muted-foreground text-sm mt-0.5">
                  The more you share, the sooner your trip confirms. Trip credit is applied to your booking.
                </p>
              </div>
              <Button asChild size="sm" className="ml-auto bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white shrink-0">
                <Link href="/promoter/experience-pool">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Browse Trips to Share
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Referral Code */}
        <PromoterInfoCard data={promoterInfo} isLoading={infoLoading} />

        {/* Trip Credit Summary */}
        <EarningsSummaryCard data={earnings} isLoading={earningsLoading} />

        {/* How Trip Credit Works */}
        <Card className="mb-8 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold mb-3 text-blue-800 dark:text-blue-300">
              How Trip Credit Works
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 p-1 rounded bg-gray-100 dark:bg-gray-800">
                  <Clock className="h-3 w-3 text-gray-500" />
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Estimated</span>
                  <p className="text-muted-foreground text-xs">Friend booked — trip credit pending group confirmation.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 p-1 rounded bg-green-100 dark:bg-green-900">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                </div>
                <div>
                  <span className="font-medium text-green-700 dark:text-green-300">Locked</span>
                  <p className="text-muted-foreground text-xs">Trip confirmed — your trip credit is secured.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 p-1 rounded bg-red-100 dark:bg-red-900">
                  <XCircle className="h-3 w-3 text-red-500" />
                </div>
                <div>
                  <span className="font-medium text-red-700 dark:text-red-300">Voided</span>
                  <p className="text-muted-foreground text-xs">Trip didn't confirm or booking was refunded.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Trips */}
        <PromotedExperiencesCard data={experiences} isLoading={experiencesLoading} />

        {/* Referred Bookings */}
        <BookingsTableCard data={bookings} isLoading={bookingsLoading} />
      </div>

      {/* Share Kit Modal */}
      {shareExperience && (
        <ShareKitModal
          open={showShareModal}
          onClose={() => setShowShareModal(false)}
          experience={shareExperience}
        />
      )}
      {!shareExperience && showShareModal && (
        <ShareKitModal
          open={showShareModal}
          onClose={() => setShowShareModal(false)}
          experience={{
            id: "homepage",
            title: "Great. — Travel With Your Tribe",
            lifecycleStatus: "forming",
          }}
        />
      )}
    </div>
  );
}
