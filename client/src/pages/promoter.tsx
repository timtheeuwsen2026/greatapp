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
import { Progress } from "@/components/ui/progress";
import Navigation from "@/components/navigation";
import { ShareKitModal } from "@/components/ShareKitModal";
import { getParticipantReferralSummary, getPromotionOfferSummary, formatPromotionDealTerms, type PromotionDealTerms } from "@/lib/promotionDeals";

interface EarningsSummary {
  byCurrency: Array<{
    currency: string;
    estimated: number;
    locked: number;
    paid: number;
    voided: number;
    totalBookings: number;
  }>;
}

interface PromotedExperience {
  promoterExperienceId: string | null;
  shareToken: string | null;
  referralLink: string;
  referralAudience: 'participant' | 'official_partner';
  dealOffer?: any;
  experience: {
    id: string;
    title: string;
    slug: string;
    mvgStatus: string | null;
    status: string;
    requireMinimumParticipants?: boolean | null;
    minimumParticipants?: number | null;
    mvgMin?: number | null;
    currentParticipants?: number | null;
    maxParticipants?: number | null;
    mvgMet?: boolean | null;
    startDate: string | null;
    endDate: string | null;
    location: string | null;
    lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
    participantReferralDealType?: string | null;
    participantReferralCommissionPct?: string | null;
    participantReferralMilestoneAttendeeTarget?: number | null;
    participantReferralMilestoneRewardDescription?: string | null;
    influencerPromotionEnabled?: boolean | null;
    influencerCommissionPct?: string | null;
    promotionDealType?: string | null;
    promotionMilestoneAttendeeTarget?: number | null;
    promotionMilestoneRewardTickets?: number | null;
    promotionBrandPitch?: string | null;
    promotionSponsorshipAmount?: string | null;
    currency?: string | null;
  };
  clicks: number;
  uniqueVisitors: number;
  conversions: number;
  conversionRate: number;
  spotsBooked: number;
  estimatedCommission: number;
  lockedCommission: number;
  paidCommission: number;
  currency: string;
}

interface PromoterBooking {
  id: string;
  experienceId: string;
  experienceName: string;
  experienceSlug: string;
  ticketTypes: string | null;
  totalAmount?: string | null;
  totalPrice?: string | null;
  amount?: string | null;
  bookingValue?: string | null;
  commissionAmount: string | null;
  commissionCurrency: string | null;
  currency?: string | null;
  commissionStatus: string | null;
  bookingDate: string;
  status: string;
}

interface PromoterInfo {
  promoterCode: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface PromoterProfile {
  id: string;
  displayName: string;
  profilePhoto: string | null;
  bio: string;
  completed: boolean;
  stripeAccountId?: string | null;
  stripeVerificationStatus?: string | null;
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
    case 'paid':
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"><DollarSign className="h-3 w-3 mr-1" />Paid</Badge>;
    case 'estimated':
    default:
      return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"><Clock className="h-3 w-3 mr-1" />Estimated</Badge>;
  }
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBookingValue(booking: PromoterBooking): number {
  return numberOrZero(
    booking.bookingValue
      ?? booking.totalAmount
      ?? booking.totalPrice
      ?? booking.amount
      ?? 0,
  );
}

function MVGProgressBar({ experience }: { experience: PromotedExperience["experience"] }) {
  const target = numberOrZero(experience.mvgMin ?? experience.minimumParticipants);
  if (!experience.requireMinimumParticipants || target <= 0) return null;

  const current = numberOrZero(experience.currentParticipants);
  const isConfirmed = !!experience.mvgMet
    || experience.mvgStatus === "met"
    || experience.lifecycleStatus === "confirmed"
    || current >= target;
  const progress = Math.min(100, Math.round((current / target) * 100));
  const remaining = Math.max(0, target - current);

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-amber-900 dark:text-amber-100">
          {isConfirmed
            ? `${current}/${target} bookings - confirmed!`
            : `${current}/${target} bookings to confirm!`}
        </span>
        {!isConfirmed && (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-200">
            {remaining} more needed
          </span>
        )}
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

function EarningsSummaryCard({ data, isLoading, official }: { data: EarningsSummary | undefined; isLoading: boolean; official: boolean }) {
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
          <p>No {official ? "commission earnings" : "cashback"} yet. Share your referral link to start earning!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mb-8">
      {data.byCurrency.map((currencyData) => (
        <div key={currencyData.currency}>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                  <DollarSign className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Paid</span>
                </div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(currencyData.paid || 0, currencyData.currency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Transferred via Stripe</p>
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

function PromoterInfoCard({ data, isLoading, official }: { data: PromoterInfo | undefined; isLoading: boolean; official: boolean }) {
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
        <CardDescription>
          Share your referral link to earn {official ? "commission" : "cashback"} when people book
        </CardDescription>
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
            Your referral links are generated per experience in the <strong>My Experiences</strong> section below.
            Copy the link for any experience and share it — anyone who books earns you cashback.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PromoterProfileStatusCard({ profile, isLoading }: { profile: PromoterProfile | undefined; isLoading: boolean }) {
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

  if (!profile?.completed) {
    return (
      <Card className="mb-8 border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle>Promoter Profile</CardTitle>
          <CardDescription>Add the public trust details shown from your referral links.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/promoter/profile-setup">Complete Profile</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Promoter Profile</CardTitle>
            <CardDescription>This is visible to buyers who open your referral links.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/promoter/profile-setup">Edit</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          {profile.profilePhoto ? (
            <img
              src={profile.profilePhoto}
              alt={profile.displayName}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
              {profile.displayName?.[0]?.toUpperCase() || "P"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">{profile.displayName}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{profile.bio}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PromotedExperiencesCard({
  data,
  isLoading,
  showPartnerPool,
}: {
  data: PromotedExperience[] | undefined;
  isLoading: boolean;
  showPartnerPool: boolean;
}) {
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
            My Promoted Experiences
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <TrendingUp className="h-10 w-10 mx-auto mb-3 text-indigo-300" />
          <h3 className="font-medium text-lg mb-2">You haven't added any experiences to promote yet</h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto">
            Your attendee referral links will appear here after you share or book experiences.
          </p>
          {showPartnerPool && (
            <Button asChild className="bg-pink-600 hover:bg-pink-700">
              <Link href="/promoter/experience-pool">
                <Sparkles className="h-4 w-4 mr-2" />
                Browse Experience Pool
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              My Promoted Experiences
            </CardTitle>
            <CardDescription>Experiences you're promoting with earnings and referral links</CardDescription>
          </div>
          {showPartnerPool && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/promoter/experience-pool">
                <Sparkles className="h-4 w-4 mr-2" />
                Add More Experiences
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.map((item) => (
            <PromotedExperienceItem 
              key={item.promoterExperienceId || item.experience.id} 
              item={item} 
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
  onNavigate 
}: { 
  item: PromotedExperience; 
  onNavigate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const referralLink = item.referralLink || "";
  const promotionOffer = item.referralAudience === 'official_partner'
    ? getPromotionOfferSummary(item.dealOffer || item.experience, { referredBookings: item.spotsBooked })
    : getParticipantReferralSummary(item.experience, { referredBookings: item.spotsBooked });

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
        
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-white p-2 shadow-sm">
              <Sparkles className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                {promotionOffer.label}
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {promotionOffer.headline}
              </p>
              <p className="text-xs leading-5 text-slate-600">
                {promotionOffer.body}
              </p>
              {promotionOffer.detail && (
                <p className="text-xs text-slate-500">
                  {promotionOffer.detail}
                </p>
              )}
            </div>
          </div>
        </div>

        <MVGProgressBar experience={item.experience} />

        <div className="grid grid-cols-2 gap-3 mb-4 md:grid-cols-4">
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Link Clicks</p>
            <p className="font-bold text-lg text-primary">{item.clicks}</p>
            <p className="text-xs text-muted-foreground">all visits</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Unique Visitors</p>
            <p className="font-bold text-lg text-blue-600 dark:text-blue-400">{item.uniqueVisitors}</p>
            <p className="text-xs text-muted-foreground">deduplicated</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Bookings</p>
            <p className="font-bold text-lg text-purple-600 dark:text-purple-400">{item.spotsBooked}</p>
            <p className="text-xs text-muted-foreground">from your link</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Conversion Rate</p>
            <p className="font-bold text-lg text-green-600 dark:text-green-400">{item.conversionRate}%</p>
            <p className="text-xs text-muted-foreground">{item.conversions} converted click{item.conversions === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-slate-50/70 p-3">
            <p className="text-xs text-muted-foreground mb-1">
              Estimated {item.referralAudience === "official_partner" ? "Commission" : "Cashback"}
            </p>
            <p className="font-bold text-lg text-slate-700 dark:text-slate-200">
              {formatCurrency(item.estimatedCommission, item.currency)}
            </p>
            <p className="text-xs text-muted-foreground">Pending experience confirmation</p>
          </div>
          <div className="rounded-xl border bg-green-50/70 p-3">
            <p className="text-xs text-muted-foreground mb-1">
              Locked {item.referralAudience === "official_partner" ? "Commission" : "Cashback"}
            </p>
            <p className="font-bold text-lg text-green-600 dark:text-green-400">
              {formatCurrency(item.lockedCommission, item.currency)}
            </p>
            <p className="text-xs text-muted-foreground">Confirmed and secured</p>
          </div>
          <div className="rounded-xl border bg-blue-50/70 p-3">
            <p className="text-xs text-muted-foreground mb-1">
              Paid {item.referralAudience === "official_partner" ? "Commission" : "Cashback"}
            </p>
            <p className="font-bold text-lg text-blue-600 dark:text-blue-400">
              {formatCurrency(item.paidCommission, item.currency)}
            </p>
            <p className="text-xs text-muted-foreground">Transferred via Stripe</p>
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

function BookingsTableCard({ data, isLoading, official }: { data: PromoterBooking[] | undefined; isLoading: boolean; official: boolean }) {
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
                <TableHead>{official ? "Commission" : "Cashback"}</TableHead>
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
                    {formatCurrency(
                      getBookingValue(booking),
                      booking.commissionCurrency || booking.currency || 'EUR',
                    )}
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
  peopleInvited: number;   // total link clicks
  uniqueVisitors: number;
  conversionRate: number;
  tripCreditsEarned: number;
  tripCreditsCurrency?: string;
  tripCreditsByCurrency?: Record<string, number>;
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
  if (friendsJoined === 0) return "You haven't invited anyone yet. Share your link and help your experience confirm faster!";
  if (friendsJoined <= 2) return "Great start! Every person you bring gets the experience one step closer to confirming.";
  if (friendsJoined <= 5) return "You're on fire! Your squad is helping make this experience happen.";
  return "Top promoter momentum. Your sharing is helping this experience happen.";
}

function RecruitmentStatsSection({
  stats,
  isLoading,
  onRefresh,
  isRefreshing,
  onInviteClick,
  official,
}: {
  stats: ImpactStats | undefined;
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  onInviteClick: () => void;
  official: boolean;
}) {
  if (isLoading) {
    return (
      <div className="mb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[1, 2, 3, 4].map((i) => (
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

  const bookingsFromLinks = stats?.friendsJoined ?? 0;
  const linkClicks = stats?.peopleInvited ?? 0;
  const uniqueVisitors = stats?.uniqueVisitors ?? 0;
  const conversionRate = stats?.conversionRate ?? 0;
  const tripCreditsEarned = stats?.tripCreditsEarned ?? 0;
  const tripCreditsCurrency = stats?.tripCreditsCurrency || 'EUR';
  const creditEntries = Object.entries(stats?.tripCreditsByCurrency || {});
  const message = getMotivationalMessage(bookingsFromLinks);
  const isTrophyTier = bookingsFromLinks >= 6;

  return (
    <div className="mb-8" data-testid="recruitment-stats-section">
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <Card className="border-primary/10 dark:border-primary/20 bg-gradient-to-br from-primary/5 to-white dark:from-primary/10 dark:to-gray-900 text-center" data-testid="stat-people-invited">
          <CardContent className="pt-5 pb-4">
            <div className="text-2xl mb-1">Link</div>
            <p className="text-3xl font-black text-primary mb-1">{linkClicks}</p>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Link Clicks</p>
            <p className="text-xs text-muted-foreground mt-0.5">Every tracked visit to your shared links</p>
          </CardContent>
        </Card>

        <Card className="border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-gray-900 text-center" data-testid="stat-unique-visitors">
          <CardContent className="pt-5 pb-4">
            <div className="text-2xl mb-1">Visits</div>
            <p className="text-3xl font-black text-blue-600 mb-1">{uniqueVisitors}</p>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Unique Visitors</p>
            <p className="text-xs text-muted-foreground mt-0.5">Deduplicated people who opened your links</p>
          </CardContent>
        </Card>

        <Card className="border-primary/10 dark:border-primary/20 bg-gradient-to-br from-primary/5 to-white dark:from-primary/10 dark:to-gray-900 text-center" data-testid="stat-friends-joined">
          <CardContent className="pt-5 pb-4">
            <div className="text-2xl mb-1">Booked</div>
            <p className="text-3xl font-black text-primary mb-1">{bookingsFromLinks}</p>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Bookings</p>
            <p className="text-xs text-muted-foreground mt-0.5">{conversionRate}% click-to-book conversion</p>
          </CardContent>
        </Card>

        <Card className="border-green-100 dark:border-green-900/40 bg-gradient-to-br from-green-50 to-white dark:from-green-950/30 dark:to-gray-900 text-center" data-testid="stat-trip-credits">
          <CardContent className="pt-5 pb-4">
            <div className="text-2xl mb-1">Earned</div>
            <p className="text-3xl font-black text-green-600 dark:text-green-400 mb-1">
              {creditEntries.length > 0
                ? creditEntries.map(([currency, amount]) => formatCurrency(amount, currency)).join(' / ')
                : formatCurrency(tripCreditsEarned, tripCreditsCurrency)}
            </p>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              {official ? "Commission" : "Cashback"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Paid out to your Stripe account</p>
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

interface DirectOffer {
  id: string;
  experienceId: string;
  experienceTitle: string;
  experienceSlug: string;
  experienceLocation: string | null;
  dealType: string;
  terms: PromotionDealTerms;
  status: 'pending' | 'pending_payment' | 'accepted' | 'declined';
  paymentStatus?: 'unpaid' | 'paid' | 'failed' | null;
}

// Direct offers (Options A & B): the Brand/Promoter can only Accept or Decline — no counter.
function PromoterOffersCard({
  data,
  isLoading,
  onAccept,
  onPay,
  onDecline,
  respondingId,
}: {
  data?: DirectOffer[];
  isLoading: boolean;
  onAccept: (id: string) => void;
  onPay: (id: string) => void;
  onDecline: (id: string) => void;
  respondingId: string | null;
}) {
  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Incoming Offers</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const offers = data ?? [];
  if (offers.length === 0) return null;

  const pending = offers.filter((o) => o.status === 'pending');
  const awaitingPayment = offers.filter((o) => o.status === 'pending_payment');
  const resolved = offers.filter((o) => o.status === 'accepted' || o.status === 'declined');

  return (
    <Card className="mb-8" data-testid="card-promoter-offers">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Incoming Offers
        </CardTitle>
        <CardDescription>
          Direct deals creators have sent you. Accept or decline — no negotiation needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending offers right now.</p>
        )}
        {pending.map((offer) => (
          <div
            key={offer.id}
            className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-4"
            data-testid={`offer-card-${offer.id}`}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{offer.experienceTitle}</span>
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                    <Clock className="h-3 w-3 mr-1" />Pending
                  </Badge>
                  <a
                    href={`/experience/${offer.experienceSlug || offer.experienceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    data-testid="link-view-event-details"
                  >
                    View Event Details →
                  </a>
                </div>
                {offer.experienceLocation && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{offer.experienceLocation}
                  </p>
                )}
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {formatPromotionDealTerms(offer.dealType, offer.terms)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => onAccept(offer.id)}
                  disabled={respondingId === offer.id}
                  data-testid={`button-accept-offer-${offer.id}`}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => onDecline(offer.id)}
                  disabled={respondingId === offer.id}
                  data-testid={`button-decline-offer-${offer.id}`}
                >
                  <XCircle className="h-4 w-4 mr-1" />Decline
                </Button>
              </div>
            </div>
          </div>
        ))}

        {awaitingPayment.map((offer) => (
          <div key={offer.id} className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{offer.experienceTitle}</p>
                <p className="text-sm text-muted-foreground">{formatPromotionDealTerms(offer.dealType, offer.terms)}</p>
                <Badge className="mt-2 bg-blue-100 text-blue-800 border-blue-300">
                  <Clock className="h-3 w-3 mr-1" />Pending Payment
                </Badge>
              </div>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => onPay(offer.id)}
                disabled={respondingId === offer.id}
                data-testid={`button-pay-direct-sponsorship-${offer.id}`}
              >
                <DollarSign className="h-4 w-4 mr-1" />Pay Sponsorship
              </Button>
            </div>
          </div>
        ))}

        {resolved.length > 0 && (
          <div className="pt-2 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resolved</p>
            {resolved.map((offer) => (
              <div key={offer.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b last:border-0">
                <span className="truncate">{offer.experienceTitle}</span>
                <Badge
                  className={offer.status === 'accepted'
                    ? "bg-green-100 text-green-800 border-green-300"
                    : "bg-red-100 text-red-800 border-red-300"}
                >
                  {offer.status === 'accepted'
                    ? <><CheckCircle className="h-3 w-3 mr-1" />Accepted</>
                    : <><XCircle className="h-3 w-3 mr-1" />Declined</>}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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

  const { data: promoterProfile, isLoading: profileLoading } = useQuery<PromoterProfile>({
    queryKey: ['/api/promoter-profile'],
    enabled: !!user,
    retry: false,
  });

  const { data: directOffers, isLoading: offersLoading } = useQuery<DirectOffer[]>({
    queryKey: ['/api/promoter/offers'],
    enabled: !!user,
  });
  const showPartnerPool = !!promoterProfile?.completed;
  const showOfficialPartnerDeals = showPartnerPool || !!directOffers?.length;
  const isOfficialDashboard = showPartnerPool
    || !!experiences?.some((item) => item.referralAudience === "official_partner");

  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);

  const respondToOfferMutation = useMutation({
    mutationFn: async ({ dealId, action }: { dealId: string; action: 'accept' | 'decline' }) => {
      const response = await apiRequest('POST', `/api/promoter/offers/${dealId}/${action}`);
      return response.json() as Promise<{ requiresPayment?: boolean; checkoutUrl?: string | null }>;
    },
    onMutate: ({ dealId }) => setRespondingOfferId(dealId),
    onSuccess: (data, { action }) => {
      if (action === 'accept' && data.requiresPayment && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      qc.invalidateQueries({ queryKey: ['/api/promoter/offers'] });
      qc.invalidateQueries({ queryKey: ['/api/promoter/experiences'] });
      if (action === 'accept') {
        qc.invalidateQueries({ queryKey: ['/api/promoter/experience-pool'] });
      }
    },
    onSettled: () => setRespondingOfferId(null),
  });

  const paySponsorshipMutation = useMutation({
    mutationFn: async (dealId: string) => {
      setRespondingOfferId(dealId);
      const response = await apiRequest('POST', `/api/promoter/promotion-deals/${dealId}/sponsorship-checkout`);
      return response.json() as Promise<{ requiresPayment: boolean; checkoutUrl?: string | null }>;
    },
    onSuccess: (data) => {
      if (data.requiresPayment && data.checkoutUrl) window.location.assign(data.checkoutUrl);
    },
    onSettled: () => setRespondingOfferId(null),
  });

  const stripeConnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/promoter/stripe-connect');
      return response.json() as Promise<{ url: string }>;
    },
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });

  // click stats are now embedded inside impactStats (via /api/me/impact-stats)

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
            Every person you invite brings your experience one step closer to confirming.
          </p>
        </div>

        {/* ── RECRUITMENT STATS SCOREBOARD ─────────────────────────── */}
        <RecruitmentStatsSection
          stats={impactStats}
          isLoading={statsLoading}
          onRefresh={() => refetchStats()}
          isRefreshing={statsFetching}
          onInviteClick={() => setShowShareModal(true)}
          official={isOfficialDashboard}
        />

        {/* Impact explainer banner */}
        <Card className="mb-8 border-primary/20 dark:border-primary/30 bg-gradient-to-r from-primary/5 to-white dark:from-primary/10 dark:to-gray-900">
          <CardContent className="py-5">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Rocket className="h-8 w-8 text-primary shrink-0" />
              <div className="text-center sm:text-left">
                <p className="font-semibold text-gray-900 dark:text-white">
                  Share your referral link and earn {isOfficialDashboard ? "commission" : "cashback"} when people book.
                </p>
                <p className="text-muted-foreground text-sm mt-0.5">
                  The more you share, the sooner your experience confirms. {isOfficialDashboard ? "Commission" : "Cashback"} is paid out to your Stripe account.
                </p>
              </div>
              {showPartnerPool && (
                <Button asChild size="sm" className="ml-auto bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white shrink-0">
                  <Link href="/promoter/experience-pool">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Browse Experiences to Share
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <PromoterProfileStatusCard profile={promoterProfile} isLoading={profileLoading} />

        {/* Referral Code */}
        <PromoterInfoCard data={promoterInfo} isLoading={infoLoading} official={isOfficialDashboard} />

        {/* Cashback / Earnings Summary */}
        <EarningsSummaryCard data={earnings} isLoading={earningsLoading} official={isOfficialDashboard} />

        {/* How Cashback / Earnings Work */}
        <Card className="mb-8 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold mb-3 text-blue-800 dark:text-blue-300">
              How {isOfficialDashboard ? "Commission" : "Cashback"} Works
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 p-1 rounded bg-gray-100 dark:bg-gray-800">
                  <Clock className="h-3 w-3 text-gray-500" />
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Estimated</span>
                  <p className="text-muted-foreground text-xs">Booking received - {isOfficialDashboard ? "commission" : "cashback"} pending group confirmation.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 p-1 rounded bg-green-100 dark:bg-green-900">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                </div>
                <div>
                  <span className="font-medium text-green-700 dark:text-green-300">Locked</span>
                  <p className="text-muted-foreground text-xs">Experience confirmed - your {isOfficialDashboard ? "commission" : "cashback"} is secured.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 p-1 rounded bg-red-100 dark:bg-red-900">
                  <XCircle className="h-3 w-3 text-red-500" />
                </div>
                <div>
                  <span className="font-medium text-red-700 dark:text-red-300">Voided</span>
                  <p className="text-muted-foreground text-xs">Experience didn't confirm or booking was refunded.</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Locked earnings are routed to your connected Stripe account on the next scheduled payout.
            </p>
            {promoterProfile?.stripeVerificationStatus !== 'verified' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={stripeConnectMutation.isPending}
                onClick={() => stripeConnectMutation.mutate()}
              >
                <DollarSign className="mr-2 h-4 w-4" />
                {stripeConnectMutation.isPending ? 'Opening Stripe...' : 'Connect Stripe for Payouts'}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Incoming Offers (Digital Handshake — Options A & B direct offers) */}
        {showOfficialPartnerDeals && (
          <PromoterOffersCard
            data={directOffers}
            isLoading={offersLoading}
            onAccept={(dealId) => respondToOfferMutation.mutate({ dealId, action: 'accept' })}
            onPay={(dealId) => paySponsorshipMutation.mutate(dealId)}
            onDecline={(dealId) => respondToOfferMutation.mutate({ dealId, action: 'decline' })}
            respondingId={respondingOfferId}
          />
        )}

        {/* My Experiences */}
        <PromotedExperiencesCard
          data={experiences}
          isLoading={experiencesLoading}
          showPartnerPool={showPartnerPool}
        />

        {/* Referred Bookings */}
        <BookingsTableCard data={bookings} isLoading={bookingsLoading} official={isOfficialDashboard} />
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
