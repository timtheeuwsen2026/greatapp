import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, readableError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Megaphone, Plus, Users, X } from "lucide-react";

export type FlashDeal = {
  id: string;
  venueId: string;
  venueName?: string | null;
  startDate: string;
  endDate: string;
  headline: string;
  description: string;
  status: string;
  claimCount: number;
  createdAt: string;
};

export function formatDealRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = start.toLocaleDateString(undefined, sameYear ? opts : { ...opts, year: "numeric" });
  const endText = end.toLocaleDateString(undefined, { ...opts, year: "numeric" });
  return start.getTime() === end.getTime() ? endText : `${startText} – ${endText}`;
}

type VenueOption = { id: string; name: string };

/**
 * The venue's own flash deals: post dates you want filled, in your own words.
 *
 * There is deliberately no amount, percentage or discount field. A flash deal
 * is a broadcast that starts a conversation — the venue writes what it would
 * accept, and a creator who bites builds their own budget and sends a Target
 * Deal through the normal handshake.
 */
export function VenueFlashDeals({ venues }: { venues: VenueOption[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    venueId: venues[0]?.id || "",
    startDate: "",
    endDate: "",
    headline: "",
    description: "",
  });

  const { data: deals = [], isLoading } = useQuery<FlashDeal[]>({
    queryKey: ["/api/venue-flash-deals/mine"],
  });

  const resetForm = () => {
    setForm({ venueId: venues[0]?.id || "", startDate: "", endDate: "", headline: "", description: "" });
    setConflictMessage(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/venue-flash-deals", form);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/venue-flash-deals/mine"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/venue-flash-deals"] });
      toast({ title: "Flash deal posted", description: "Creators will see it in their feed." });
      setIsOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      const message = readableError(error, "Could not post that deal");
      // A date clash is the venue's to fix, so keep it in the form rather than
      // flashing it past in a toast.
      if (/blocked on your calendar/i.test(message)) setConflictMessage(message);
      else toast({ title: "Could not post that deal", description: message, variant: "destructive" });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/venue-flash-deals/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/venue-flash-deals/mine"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/venue-flash-deals"] });
      toast({ title: "Flash deal withdrawn" });
    },
    onError: () => toast({ title: "Could not withdraw that deal", variant: "destructive" }),
  });

  const canSubmit =
    !!form.venueId &&
    !!form.startDate &&
    !!form.endDate &&
    form.headline.trim().length >= 10 &&
    form.description.trim().length >= 20;

  return (
    <div className="space-y-4" data-testid="venue-flash-deals">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Flash Deals</h3>
          <p className="text-sm text-muted-foreground">
            Got a gap in the calendar? Broadcast it. Creators see your dates and come to you with an offer.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => { resetForm(); setIsOpen(true); }}
          disabled={venues.length === 0}
          data-testid="button-post-flash-deal"
        >
          <Megaphone className="mr-2 h-4 w-4" />
          Post a Flash Deal
        </Button>
      </div>

      {venues.length === 0 && (
        <Alert>
          <AlertDescription>Add a venue before posting a flash deal.</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your deals…</p>
      ) : deals.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Megaphone className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No flash deals yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Post one when you have dates to fill — a late cancellation, a quiet week, an empty shoulder season.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deals.map((deal) => (
            <Card key={deal.id} data-testid={`flash-deal-${deal.id}`}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{deal.headline}</CardTitle>
                    <CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDealRange(deal.startDate, deal.endDate)}
                      </span>
                      {deal.venueName && <span>{deal.venueName}</span>}
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {deal.claimCount} creator{deal.claimCount === 1 ? "" : "s"} started a plan
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={deal.status === "active" ? "default" : "secondary"}>
                      {deal.status === "active" ? "Live" : "Withdrawn"}
                    </Badge>
                    {deal.status === "active" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => withdrawMutation.mutate(deal.id)}
                        disabled={withdrawMutation.isPending}
                        data-testid={`button-withdraw-flash-deal-${deal.id}`}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{deal.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Post a Flash Deal</DialogTitle>
            <DialogDescription>
              Say what you're offering in plain words. No percentages to work out — a creator will come back with
              their own offer, and you can accept or counter it as usual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {venues.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="flash-deal-venue">Venue</Label>
                <Select value={form.venueId} onValueChange={(venueId) => setForm({ ...form, venueId })}>
                  <SelectTrigger id="flash-deal-venue" data-testid="select-flash-deal-venue">
                    <SelectValue placeholder="Choose a venue" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="flash-deal-start">From</Label>
                <Input
                  id="flash-deal-start"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                  data-testid="input-flash-deal-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="flash-deal-end">To</Label>
                <Input
                  id="flash-deal-end"
                  type="date"
                  min={form.startDate || undefined}
                  value={form.endDate}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                  data-testid="input-flash-deal-end"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="flash-deal-headline">Headline</Label>
              <Input
                id="flash-deal-headline"
                maxLength={160}
                value={form.headline}
                onChange={(event) => setForm({ ...form, headline: event.target.value })}
                placeholder="Late cancellation — whole villa free Aug 12–16"
                data-testid="input-flash-deal-headline"
              />
              <p className="text-xs text-muted-foreground">{form.headline.length}/160</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="flash-deal-description">What you're offering</Label>
              <Textarea
                id="flash-deal-description"
                rows={5}
                maxLength={2000}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="We had a group drop out. Ten rooms, full board, pool and yoga shala. We'd take a flat fee of €6,000 for the week instead of our usual €10k — bring us a retreat and it's yours."
                data-testid="input-flash-deal-description"
              />
              <p className="text-xs text-muted-foreground">
                Write it however you'd say it out loud. Numbers are fine here — they're a starting point, not a
                booking.
              </p>
            </div>

            {conflictMessage && (
              <Alert variant="destructive" data-testid="flash-deal-conflict">
                <AlertDescription>{conflictMessage}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={!canSubmit || createMutation.isPending}
                data-testid="button-submit-flash-deal"
              >
                <Plus className="mr-2 h-4 w-4" />
                {createMutation.isPending ? "Posting…" : "Post deal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
