import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, AlertTriangle, MapPin, Calendar, Users, Copy, Check, ArrowLeft, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ExperiencePoolItem {
  id: string;
  title: string;
  slug: string;
  location: string;
  startDate: string;
  endDate: string;
  price: string;
  currency: string;
  mvgStatus: string | null;
  lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
  status: string;
  commissionMode: string | null;
  commissionValue: string | null;
  commissionBasis: string | null;
  ticketSkus: Array<{
    id: string;
    ticketName: string;
    pricePerPerson: number;
  }> | null;
  isPromoting: boolean;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getLifecycleBadge(lifecycleStatus?: string) {
  switch (lifecycleStatus) {
    case 'confirmed':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Confirmed</Badge>;
    case 'cancelled':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Cancelled</Badge>;
    case 'forming':
    default:
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">Forming</Badge>;
  }
}

function getCommissionDescription(mode: string | null, value: string | null, basis: string | null): string {
  if (!mode || !value) {
    return "10% per spot (platform default)";
  }
  
  const amount = mode === 'percent' ? `${parseFloat(value)}%` : formatCurrency(parseFloat(value), 'EUR');
  const basisLabel = basis === 'per_booking' ? 'per booking' : 'per spot';
  
  return `${amount} ${basisLabel}`;
}

function getLowestPrice(experience: ExperiencePoolItem): { price: number; currency: string } {
  const ticketSkus = experience.ticketSkus;
  if (ticketSkus && ticketSkus.length > 0) {
    const lowest = ticketSkus.reduce((min, sku) => 
      sku.pricePerPerson < min.pricePerPerson ? sku : min
    );
    return { price: lowest.pricePerPerson, currency: experience.currency || 'EUR' };
  }
  return { price: parseFloat(experience.price || '0'), currency: experience.currency || 'EUR' };
}

function ExperiencePoolCard({ 
  experience, 
  promoterCode,
  onPromote,
  isPromoting,
}: { 
  experience: ExperiencePoolItem;
  promoterCode: string | null;
  onPromote: (experienceId: string) => void;
  isPromoting: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const lowestPrice = getLowestPrice(experience);
  const baseUrl = import.meta.env.VITE_APP_BASE_URL || 'https://greatapp.ai';
  const experienceSlug = experience.slug || experience.id; // Use ID as fallback if slug is null
  const referralLink = promoterCode && experienceSlug ? `${baseUrl}/experience/${experienceSlug}?ref=${promoterCode}` : '';
  
  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{experience.title}</CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {experience.location}
            </CardDescription>
          </div>
          {getLifecycleBadge(experience.lifecycleStatus)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Dates</span>
            <div className="flex items-center gap-1 font-medium">
              <Calendar className="h-3 w-3" />
              {formatDate(experience.startDate)}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">From</span>
            <div className="font-medium text-lg">
              {formatCurrency(lowestPrice.price, lowestPrice.currency)}
              <span className="text-xs text-muted-foreground font-normal"> /person</span>
            </div>
          </div>
        </div>
        
        <div className="border-t pt-3">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-pink-500" />
            <span className="text-muted-foreground">Commission:</span>
            <span className="font-medium">
              {getCommissionDescription(
                experience.commissionMode,
                experience.commissionValue,
                experience.commissionBasis
              )}
            </span>
          </div>
        </div>
        
        {/* Promote This Trip action */}
        {experience.isPromoting ? (
          <div className="space-y-2">
            <Badge className="w-full justify-center bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 mb-2">
              <Check className="h-3 w-3 mr-1" /> Added to My Trips
            </Badge>
            {referralLink && (
              <div className="flex items-center gap-2">
                <code className="flex-1 px-2 py-1 bg-muted rounded text-xs truncate">
                  {referralLink}
                </code>
                <Button
                  variant={copied ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleCopy(referralLink)}
                  className={`min-w-[100px] ${copied ? 'bg-green-600 hover:bg-green-700' : ''}`}
                >
                  {copied ? <><Check className="h-3 w-3 mr-1" />Copied!</> : <><Copy className="h-3 w-3 mr-1" />Copy Link</>}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Button 
            className="w-full bg-pink-600 hover:bg-pink-700"
            onClick={() => onPromote(experience.id)}
            disabled={isPromoting}
          >
            {isPromoting ? (
              <>Adding...</>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Promote This Trip
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function PromoterExperiencePool() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const hasPromoterRole = user?.role === 'promoter' || (user?.userRoles || []).includes('promoter');

  const { data: experiences, isLoading: experiencesLoading, refetch } = useQuery<ExperiencePoolItem[]>({
    queryKey: ['/api/promoter/experience-pool'],
    enabled: isAuthenticated && hasPromoterRole,
  });

  const { data: promoterInfo } = useQuery<{ promoterCode: string | null }>({
    queryKey: ['/api/promoter/info'],
    enabled: isAuthenticated && hasPromoterRole,
  });

  const promoteMutation = useMutation({
    mutationFn: async (experienceId: string) => {
      const response = await apiRequest('POST', `/api/promoter/promote/${experienceId}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Experience Promoted!",
        description: "You can now share your referral link to earn commissions.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/promoter/experience-pool'] });
      queryClient.invalidateQueries({ queryKey: ['/api/promoter/experiences'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to promote",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Login Required</h2>
            <p className="text-muted-foreground">Please log in to access the Experience Pool.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasPromoterRole) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">You need a promoter role to access this page.</p>
            <Button variant="outline" onClick={() => navigate('/promoter')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/promoter">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
      
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-3 rounded-full bg-pink-100 dark:bg-pink-900">
            <Sparkles className="h-6 w-6 text-pink-600 dark:text-pink-400" />
          </div>
          <h1 className="text-2xl font-bold">Experience Pool</h1>
        </div>
        <Card className="bg-gradient-to-r from-pink-50 to-white dark:from-pink-950/20 dark:to-gray-900 border-pink-200 dark:border-pink-800">
          <CardContent className="py-4">
            <p className="text-muted-foreground">
              These are experiences you can promote. Click <strong>"Promote This Trip"</strong> to add it to your dashboard, 
              then share your unique referral link with your audience. When someone books through your link, you earn commission.
            </p>
          </CardContent>
        </Card>
      </div>

      {experiencesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : !experiences || experiences.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Experiences Available</h3>
            <p className="text-muted-foreground">
              There are currently no experiences available for promotion.
              Check back later for new opportunities.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {experiences.map((experience) => (
            <ExperiencePoolCard
              key={experience.id}
              experience={experience}
              promoterCode={promoterInfo?.promoterCode || null}
              onPromote={(id) => promoteMutation.mutate(id)}
              isPromoting={promoteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
