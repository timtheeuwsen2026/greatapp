import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SocialProofGallery } from "@/components/SocialProofGallery";
import { Heart, MapPin, Calendar, Users, Shield, CheckCircle, AlertCircle, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getCoverImage } from "@/lib/utils";

interface TicketSku {
  id: string;
  ticketName: string;
  ticketCapacity: number;
  pricePerPerson: number;
  depositPerPerson: number;
  sourceRoomId?: string;
  soldCount: number;
}

interface ExperienceCardProps {
  experience: {
    id: string;
    title: string;
    shortDescription: string;
    category: string;
    greatPillars?: string[];
    coverImageUrl?: string;
    gallery?: string[];
    location: string;
    startDate: string;
    endDate: string;
    price: string;
    pricePerPerson?: string;
    ticketSkus?: TicketSku[];
    currency?: string;
    maxParticipants: number;
    currentParticipants: number;
    requireMinimumParticipants?: boolean;
    lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
    status?: string;
    bookings?: Array<{
      user: {
        firstName?: string;
        lastName?: string;
        profileImageUrl?: string;
      };
    }>;
  };
}

// Helper to format currency with proper symbol
// DATA CONTRACT: Currency must come from experience.currency - never default to USD
function formatCurrency(amount: number | string, currency?: string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(numAmount)) return 'Price TBA';
  if (numAmount === 0) return 'Free';
  if (numAmount < 0) return 'Price TBA';
  if (!currency) {
    console.warn('[DataContract] Currency missing - using experience.currency is required');
  }
  const currencyCode = (currency || 'EUR').toUpperCase();
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
  };
  const symbol = symbols[currencyCode] || currencyCode + ' ';
  return `${symbol}${numAmount.toFixed(0)}`;
}

// Helper to get display price from ticket SKUs or legacy price
function getDisplayPrice(experience: ExperienceCardProps['experience']): { price: number; hasRange: boolean } {
  const ticketSkus = experience.ticketSkus || [];
  
  if (ticketSkus.length > 0) {
    const prices = ticketSkus.map(s => Number(s.pricePerPerson)).filter(p => !Number.isNaN(p) && p >= 0);
    if (prices.length > 0) {
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      return { price: minPrice, hasRange: minPrice !== maxPrice };
    }
  }
  
  // Fall back to legacy pricePerPerson or price field
  const legacyPrice = parseFloat(experience.pricePerPerson || experience.price || '0');
  return { price: legacyPrice, hasRange: false };
}

const pillarLabels: Record<string, { label: string; color: string }> = {
  health: { label: "Health", color: "bg-emerald-100 text-emerald-700" },
  sports: { label: "Sports", color: "bg-orange-100 text-orange-700" },
  wellness: { label: "Wellness", color: "bg-purple-100 text-purple-700" },
  food: { label: "Food", color: "bg-amber-100 text-amber-700" },
};

const categoryLabels: Record<string, { label: string; color: string }> = {
  sports_wellness: { label: "Sports & Wellness", color: "bg-primary/10 text-primary" },
  retreats: { label: "Retreat", color: "bg-secondary/10 text-secondary" },
  community_social: { label: "Community", color: "bg-accent/10 text-accent" },
  adventure_trips: { label: "Adventure", color: "bg-primary/10 text-primary" },
  workations: { label: "Workation", color: "bg-blue-100 text-blue-600" },
  festivals_events: { label: "Festival", color: "bg-pink-100 text-pink-600" },
};

// Lifecycle badge config - single source of truth for FORMING/CONFIRMED/CANCELLED display
function getLifecycleBadge(lifecycleStatus?: string) {
  switch (lifecycleStatus) {
    case 'confirmed':
      return { label: 'Confirmed', className: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-red-100 text-red-800 border-red-200', icon: AlertCircle };
    case 'forming':
      return { label: 'Forming', className: 'bg-amber-100 text-amber-800 border-amber-200', icon: Shield };
    default:
      return null;
  }
}

export default function ExperienceCard({ experience }: ExperienceCardProps) {
  const categoryInfo = categoryLabels[experience.category] || { label: "Experience", color: "bg-gray-100 text-gray-600" };
  const pillars = Array.isArray(experience.greatPillars) ? experience.greatPillars.filter(Boolean) : [];
  const spotsLeft = experience.maxParticipants - experience.currentParticipants;

  // Fetch MVG progress for the progress bar numbers only (not for lifecycle determination)
  const { data: mvgProgress } = useQuery({
    queryKey: ["/api/experiences", experience.id, "mvg-progress"],
    enabled: !!experience.requireMinimumParticipants,
    refetchInterval: 30000,
  }) as { data: { currentBookings: number; mvgMin: number; percentage: number; mvgStatus: string } | undefined };
  
  // Use backend-provided lifecycleStatus as single source of truth
  const lifecycleStatus = experience.lifecycleStatus ?? 'confirmed';

  // Forming overlay percentage — pulled from live MVG progress query
  const formingPct = mvgProgress
    ? Math.min(Math.round(mvgProgress.percentage), 99)
    : 0;
  const spotsNeeded = mvgProgress
    ? Math.max(0, mvgProgress.mvgMin - mvgProgress.currentBookings)
    : 0;

  const lifecycleBadge = getLifecycleBadge(lifecycleStatus);
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatDateRange = () => {
    if (experience.startDate === experience.endDate) {
      return formatDate(experience.startDate);
    }
    return `${formatDate(experience.startDate)}-${formatDate(experience.endDate)}`;
  };

  return (
    <Card className="experience-card overflow-hidden group">
      <div className="relative">
        <img 
          src={getCoverImage(experience.coverImageUrl, experience.gallery) || "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=300"} 
          alt={experience.title}
          className={`w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500 ${lifecycleStatus === 'cancelled' ? 'grayscale opacity-60' : ''}`}
        />

        {/* FORMING overlay — "HELP US MAKE IT HAPPEN" energy sticker */}
        {lifecycleStatus === 'forming' && experience.requireMinimumParticipants && (
          <div
            className="absolute inset-0 flex flex-col justify-end"
            style={{ background: 'linear-gradient(to top, rgba(88,28,135,0.88) 0%, rgba(126,34,206,0.55) 55%, transparent 100%)' }}
            data-testid="forming-overlay"
          >
            <div className="px-3 pb-3 space-y-1">
              <p className="text-[10px] font-black tracking-[0.2em] uppercase text-violet-200 flex items-center gap-1">
                <span className="inline-block animate-pulse">🔥</span>
                HELP US MAKE IT HAPPEN
              </p>
              <p className="text-sm font-bold text-white leading-tight">
                {spotsNeeded === 1
                  ? '🔥 Just 1 more traveler to make this real!'
                  : spotsNeeded <= 3
                  ? `🔥 Just ${spotsNeeded} more travelers to make this real!`
                  : spotsNeeded <= 6
                  ? `⚡ ${spotsNeeded} more travelers needed to confirm this trip!`
                  : `👥 ${spotsNeeded} more travelers needed to make this happen!`}
              </p>
              <div className="h-1.5 rounded-full bg-white/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-400 transition-all duration-700"
                  style={{ width: `${formingPct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* CONFIRMED overlay — clean green tick banner */}
        {lifecycleStatus === 'confirmed' && experience.requireMinimumParticipants && (
          <div
            className="absolute bottom-0 inset-x-0 flex items-center gap-2 px-3 py-2"
            style={{ background: 'linear-gradient(to top, rgba(6,78,59,0.85), transparent)' }}
            data-testid="confirmed-overlay"
          >
            <CheckCircle className="h-4 w-4 text-emerald-300 shrink-0" />
            <span className="text-sm font-bold text-white">Group confirmed — booking secured!</span>
          </div>
        )}

        {/* CANCELLED overlay — muted greyed-out treatment */}
        {lifecycleStatus === 'cancelled' && (
          <div className="absolute inset-0 flex items-center justify-center" data-testid="cancelled-overlay">
            <div className="bg-gray-900/70 backdrop-blur-sm text-white rounded-lg px-4 py-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-gray-300" />
              <span className="text-sm font-medium text-gray-200">Trip Cancelled</span>
            </div>
          </div>
        )}

        <div className="absolute top-4 right-4">
          <Button variant="ghost" size="sm" className="bg-white/80 hover:bg-white text-red-500">
            <Heart className="h-4 w-4" />
          </Button>
        </div>
        {/* Lifecycle badge — only when no overlay present (non-MVG experiences) */}
        {lifecycleBadge && experience.requireMinimumParticipants && lifecycleStatus === 'forming' && (
          <div className="absolute top-4 left-4">
            <Badge className={`text-xs font-medium border ${lifecycleBadge.className}`} data-testid="lifecycle-status-badge">
              <lifecycleBadge.icon className="h-3 w-3 mr-1" />
              {lifecycleBadge.label}
            </Badge>
          </div>
        )}
      </div>
      
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={categoryInfo.color}>
              {categoryInfo.label}
            </Badge>
            {pillars.map((pillar) => {
              const pillarInfo = pillarLabels[pillar] || { label: pillar, color: "bg-gray-100 text-gray-600" };
              return (
                <Badge key={pillar} variant="outline" className={pillarInfo.color} data-testid={`card-pillar-${experience.id}-${pillar}`}>
                  {pillarInfo.label}
                </Badge>
              );
            })}
          </div>
          <span className="text-gray-500 text-sm">
            <Heart className="h-4 w-4 inline text-red-500 mr-1" />
            {Math.floor(Math.random() * 50) + 10}
          </span>
        </div>
        
        <h3 className="text-xl font-semibold text-gray-900 mb-2">{experience.title}</h3>
        <p className="text-gray-600 mb-4 line-clamp-2">{experience.shortDescription}</p>
        
        <div className="flex items-center justify-between mb-4 text-sm text-gray-500">
          <div className="flex items-center">
            <MapPin className="h-4 w-4 mr-1" />
            <span>{experience.location}</span>
          </div>
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-1" />
            <span>{formatDateRange()}</span>
          </div>
        </div>
        
        {/* Who's Joining Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">
              Who's Joining ({experience.currentParticipants}/{experience.maxParticipants})
            </h4>
            <span className="text-sm text-gray-500">
              {spotsLeft} spots left
            </span>
          </div>
          <SocialProofGallery experienceId={experience.id} compact />

          {/* MVG Progress Indicator - uses mvgStatus from server as single source of truth */}
          {experience.requireMinimumParticipants && mvgProgress && lifecycleStatus !== 'cancelled' && (
            <div
              className={`border rounded-lg p-3 space-y-2 mt-3 ${
                lifecycleStatus === 'confirmed'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
              data-testid="mvg-progress-card"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Shield className={`h-4 w-4 ${lifecycleStatus === 'confirmed' ? 'text-green-600' : 'text-amber-600'}`} />
                  <span className={`text-sm font-medium ${lifecycleStatus === 'confirmed' ? 'text-green-900' : 'text-amber-900'}`}>
                    {lifecycleStatus === 'confirmed' ? "Group Confirmed!" : "Building Group"}
                  </span>
                </div>
                {lifecycleStatus === 'confirmed' && (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                )}
              </div>
              <div className={`flex justify-between items-center text-xs ${lifecycleStatus === 'confirmed' ? 'text-green-800' : 'text-amber-800'}`}>
                <span>{mvgProgress.currentBookings} of {mvgProgress.mvgMin} joined</span>
              </div>
              <Progress 
                value={Math.min(mvgProgress.percentage, 100)}
                className="h-2"
              />
              {/* "X more needed" — emotional nudge, only shown when FORMING */}
              {lifecycleStatus !== 'confirmed' && lifecycleStatus !== 'cancelled' && (mvgProgress.mvgMin - mvgProgress.currentBookings) > 0 ? (
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1" data-testid="mvg-more-needed-card">
                  <Zap className="h-3 w-3 flex-shrink-0" />
                  {(mvgProgress.mvgMin - mvgProgress.currentBookings) === 1
                    ? "Just 1 more person — you could be the one!"
                    : `${mvgProgress.mvgMin - mvgProgress.currentBookings} more people needed to confirm this trip`}
                </p>
              ) : (
                <p className={`text-xs ${lifecycleStatus === 'confirmed' ? 'text-green-700' : 'text-amber-700'}`}>
                  {lifecycleStatus === 'confirmed'
                    ? "Your booking is secured!"
                    : "Payment held until minimum reached"}
                </p>
              )}
            </div>
          )}
          
          {/* Cancelled state indicator */}
          {experience.requireMinimumParticipants && lifecycleStatus === 'cancelled' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3" data-testid="mvg-cancelled-card">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-900">Trip Cancelled</span>
              </div>
              <p className="text-xs text-red-700 mt-1">Minimum group size was not reached</p>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            {(() => {
              const { price, hasRange } = getDisplayPrice(experience);
              return (
                <>
                  {hasRange && <span className="text-gray-500 text-sm">From </span>}
                  <span className="text-2xl font-bold text-gray-900" data-testid="text-price">{formatCurrency(price, experience.currency)}</span>
                  <span className="text-gray-500 text-sm">/person</span>
                </>
              );
            })()}
          </div>
          <Link href={`/experience/${experience.id}`}>
            <Button className="btn-gradient" data-testid="button-view-details">
              View Details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
