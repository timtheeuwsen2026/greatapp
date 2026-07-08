import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, AlertTriangle, MapPin, Calendar, Copy, Check, ArrowLeft, Sparkles, ExternalLink, Clock, XCircle } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getPromotionOfferSummary } from "@/lib/promotionDeals";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  ticketSkus: Array<{
    id: string;
    ticketName: string;
    pricePerPerson: number;
  }> | null;
  isPromoting: boolean;
  referralLink?: string | null;
  shareToken?: string | null;
  influencerPromotionEnabled: boolean | null;
  influencerCommissionPct: string | null;
  promotionDealType: string | null;
  promotionMilestoneAttendeeTarget: number | null;
  promotionMilestoneRewardTickets: number | null;
  promotionBrandPitch: string | null;
  promotionSponsorshipAmount: string | null;
  marketplaceDeal?: {
    id: string;
    status: "pending" | "countered" | "accepted" | "declined";
    pendingActionBy: string | null;
    terms: {
      brandPitch?: string;
      sponsorshipAmount?: number;
      currency?: string;
    } | null;
    counterMessage: string | null;
  } | null;
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

function CounterOfferDialog({
  open,
  onOpenChange,
  experience,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experience: ExperiencePoolItem;
  onSubmit: (terms: { brandPitch?: string; sponsorshipAmount?: number; currency?: string }, message: string) => void;
  isSubmitting: boolean;
}) {
  const [pitch, setPitch] = useState(experience.promotionBrandPitch || "");
  const [amount, setAmount] = useState(experience.promotionSponsorshipAmount || "");
  const [message, setMessage] = useState("");

  const isSponsorship = experience.promotionDealType === "financial_sponsorship";

  const handleSubmit = () => {
    const terms = isSponsorship
      ? { sponsorshipAmount: parseFloat(amount) || 0, currency: experience.currency || "EUR" }
      : { brandPitch: pitch };
    onSubmit(terms, message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Counter Offer — {experience.title}</DialogTitle>
          <DialogDescription>
            Adjust the terms below and send them back to the creator to Accept or Decline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isSponsorship ? (
            <div>
              <Label htmlFor="counter-sponsorship-amount">
                Your Sponsorship Offer ({(experience.currency || "EUR").toUpperCase()})
              </Label>
              <Input
                id="counter-sponsorship-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 150.00"
                data-testid="input-counter-sponsorship-amount"
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="counter-brand-pitch">What you can offer</Label>
              <Textarea
                id="counter-brand-pitch"
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                placeholder="Describe the products/services you'd provide in exchange for exposure"
                rows={4}
                data-testid="textarea-counter-brand-pitch"
              />
            </div>
          )}
          <div>
            <Label htmlFor="counter-message">Note to creator (optional)</Label>
            <Textarea
              id="counter-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Any context for the creator"
              rows={2}
              data-testid="textarea-counter-message"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="button-submit-counter-offer">
            {isSubmitting ? "Sending..." : "Send Counter Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExperiencePoolCard({
  experience,
  onPromote,
  isPromoting,
  overrideLink,
  onAcceptDeal,
  isAcceptingDeal,
  onCounterDeal,
  isCounteringDeal,
}: {
  experience: ExperiencePoolItem;
  onPromote: (experienceId: string) => void;
  isPromoting: boolean;
  overrideLink?: string; // server-returned absolute link takes priority
  onAcceptDeal: (experienceId: string) => void;
  isAcceptingDeal: boolean;
  onCounterDeal: (experienceId: string, terms: any, message: string) => void;
  isCounteringDeal: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [counterDialogOpen, setCounterDialogOpen] = useState(false);
  const lowestPrice = getLowestPrice(experience);
  const promotionOffer = getPromotionOfferSummary(experience);
  const referralLink = overrideLink || experience.referralLink || '';
  const eventUrl = `/experience/${experience.slug || experience.id}`;
  const marketplaceDeal = experience.marketplaceDeal;

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

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-white p-2 shadow-sm">
              <Sparkles className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0 space-y-1 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  {promotionOffer.label}
                </p>
                <a
                  href={eventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline shrink-0 dark:text-blue-400"
                  data-testid="link-view-event-details"
                >
                  View Event Details <ExternalLink className="h-3 w-3" />
                </a>
              </div>
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

        {promotionOffer.actionType === 'negotiate' ? (
          // Marketplace bid (Option C): Accept as-is, or Counter Offer.
          <div className="space-y-2">
            {!marketplaceDeal && (
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => onAcceptDeal(experience.id)}
                  disabled={isAcceptingDeal}
                >
                  <Check className="h-4 w-4 mr-2" />
                  {isAcceptingDeal ? "Accepting..." : "Accept Deal"}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCounterDialogOpen(true)}
                >
                  Counter Offer
                </Button>
              </div>
            )}

            {marketplaceDeal?.status === 'countered' && (
              <Badge className="w-full justify-center bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                <Clock className="h-3 w-3 mr-1" /> Counter sent — waiting on creator
              </Badge>
            )}

            {marketplaceDeal?.status === 'declined' && (
              <Badge className="w-full justify-center bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                <XCircle className="h-3 w-3 mr-1" /> Declined by creator
              </Badge>
            )}

            {marketplaceDeal?.status === 'accepted' && (
              <div className="space-y-2">
                <Badge className="w-full justify-center bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                  <Check className="h-3 w-3 mr-1" /> Deal Accepted
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
            )}

            <CounterOfferDialog
              open={counterDialogOpen}
              onOpenChange={setCounterDialogOpen}
              experience={experience}
              isSubmitting={isCounteringDeal}
              onSubmit={(terms, message) => {
                onCounterDeal(experience.id, terms, message);
                setCounterDialogOpen(false);
              }}
            />
          </div>
        ) : experience.isPromoting ? (
          <div className="space-y-2">
            <Badge className="w-full justify-center bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 mb-2">
              <Check className="h-3 w-3 mr-1" /> Added to My Experiences
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
                Promote This Experience
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function PromoterExperiencePool() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const { data: experiences, isLoading: experiencesLoading } = useQuery<ExperiencePoolItem[]>({
    queryKey: ['/api/promoter/experience-pool'],
    enabled: isAuthenticated,
  });

  const [activeLink, setActiveLink] = useState<{ experienceId: string; link: string } | null>(null);

  const promoteMutation = useMutation({
    mutationFn: async (experienceId: string) => {
      const response = await apiRequest('POST', `/api/promoter/promote/${experienceId}`);
      return response.json() as Promise<{
        referralLink: string;
        promoterCode: string;
        shareToken: string | null;
        promoterExperienceId: string;
        experienceId: string;
      }>;
    },
    onSuccess: (data, experienceId) => {
      // 1. Optimistically mark this experience as promoting so the link shows immediately
      queryClient.setQueryData<ExperiencePoolItem[]>(
        ['/api/promoter/experience-pool'],
        (old) => old?.map(exp => exp.id === experienceId ? { ...exp, isPromoting: true } : exp) ?? old
      );

      // 2. Store the link returned by the server (absolute URL, correct for dev + prod)
      setActiveLink({ experienceId, link: data.referralLink });

      // 3. Auto-copy to clipboard
      navigator.clipboard.writeText(data.referralLink).catch(() => {});

      toast({
        title: "Promotion added and link copied",
        description: data.referralLink,
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

  const acceptDealMutation = useMutation({
    mutationFn: async (experienceId: string) => {
      const response = await apiRequest('POST', `/api/promoter/experience-pool/${experienceId}/accept-deal`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Deal accepted", description: "You now have a tracking link for this experience." });
      queryClient.invalidateQueries({ queryKey: ['/api/promoter/experience-pool'] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to accept deal", description: error.message, variant: "destructive" });
    },
  });

  const counterDealMutation = useMutation({
    mutationFn: async ({ experienceId, terms, message }: { experienceId: string; terms: any; message: string }) => {
      const response = await apiRequest('POST', `/api/promoter/experience-pool/${experienceId}/counter-deal`, { terms, message });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Counter offer sent", description: "The creator will review your terms." });
      queryClient.invalidateQueries({ queryKey: ['/api/promoter/experience-pool'] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send counter offer", description: error.message, variant: "destructive" });
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

  if (false) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
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
              These are experiences you can promote. Click <strong>"Promote This Experience"</strong> to add it to your dashboard,
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
              onPromote={(id) => promoteMutation.mutate(id)}
              isPromoting={promoteMutation.isPending && promoteMutation.variables === experience.id}
              overrideLink={activeLink?.experienceId === experience.id ? activeLink.link : undefined}
              onAcceptDeal={(id) => acceptDealMutation.mutate(id)}
              isAcceptingDeal={acceptDealMutation.isPending && acceptDealMutation.variables === experience.id}
              onCounterDeal={(id, terms, message) => counterDealMutation.mutate({ experienceId: id, terms, message })}
              isCounteringDeal={counterDealMutation.isPending && counterDealMutation.variables?.experienceId === experience.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
