import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { normalizeImageUrl } from "@/lib/utils";
import { CalendarDays, MapPin, Megaphone, Users } from "lucide-react";
import { formatDealRange, type FlashDeal } from "@/components/VenueFlashDeals";

type FeedDeal = FlashDeal & {
  venue: {
    id: string;
    name: string;
    slug: string | null;
    city: string | null;
    location: string | null;
    capacity: number | null;
    coverImageUrl: string | null;
  };
};

/** Days until the deal's window closes — the reason to look at it today. */
function daysUntil(dateString: string): number {
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * Venues advertising dates they want filled.
 *
 * "Claim Deal" is not a reservation. It opens a builder with the dates and
 * venue already filled in; the creator still builds their own budget and
 * sends a Target Deal through the normal handshake. Nothing is held until the
 * venue accepts.
 */
export function CreatorFlashDealFeed() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: deals = [], isLoading } = useQuery<FeedDeal[]>({
    queryKey: ["/api/venue-flash-deals"],
  });

  const claimMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const res = await apiRequest("POST", `/api/venue-flash-deals/${dealId}/claim`, {});
      return res.json();
    },
    onSuccess: (claim: { venueId: string; startDate: string; endDate: string; flashDealId: string }) => {
      // Dates as plain YYYY-MM-DD; the builder's date inputs read them directly.
      const params = new URLSearchParams({
        type: "multi-day",
        venueId: claim.venueId,
        startDate: claim.startDate.slice(0, 10),
        endDate: claim.endDate.slice(0, 10),
        flashDeal: claim.flashDealId,
      });
      setLocation(`/event-builder?${params.toString()}`);
    },
    onError: (error: any) => {
      toast({
        title: "Could not open that deal",
        description: error?.message || "It may have been withdrawn.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading flash deals…</p>;
  }

  if (deals.length === 0) {
    return (
      <Card data-testid="flash-deal-feed-empty">
        <CardContent className="py-10 text-center">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">No flash deals right now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When a venue has dates to fill, they'll show up here with the dates and terms they're after.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="flash-deal-feed">
      <p className="text-sm text-muted-foreground">
        Venues with gaps to fill. Claiming one opens a builder with the dates and venue ready — it doesn't book
        anything, and you still set your own budget and offer.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {deals.map((deal) => {
          const startsIn = daysUntil(deal.startDate);
          const cover = normalizeImageUrl(deal.venue.coverImageUrl || "");

          return (
            <Card key={deal.id} className="flex flex-col overflow-hidden" data-testid={`flash-deal-card-${deal.id}`}>
              {cover && (
                <div className="aspect-video w-full overflow-hidden">
                  <img src={cover} alt={deal.venue.name} className="h-full w-full object-cover" />
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{deal.headline}</CardTitle>
                  {startsIn >= 0 && startsIn <= 30 && (
                    <Badge variant="destructive" className="shrink-0">
                      {startsIn === 0 ? "Starts today" : `In ${startsIn}d`}
                    </Badge>
                  )}
                </div>
                <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDealRange(deal.startDate, deal.endDate)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {deal.venue.name}{deal.venue.city ? `, ${deal.venue.city}` : ""}
                  </span>
                  {deal.venue.capacity ? (
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Up to {deal.venue.capacity}
                    </span>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{deal.description}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => claimMutation.mutate(deal.id)}
                    disabled={claimMutation.isPending}
                    data-testid={`button-claim-flash-deal-${deal.id}`}
                  >
                    {claimMutation.isPending ? "Opening builder…" : "Claim Deal"}
                  </Button>
                  {deal.venue.slug && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.open(`/v/${deal.venue.slug}`, "_blank", "noopener")}
                      data-testid={`button-view-venue-${deal.id}`}
                    >
                      View venue
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
