import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Post a Collab Idea.
 *
 * The stage that did not exist: everything else on the platform needs a
 * fully-built event before a counterparty can see anything, which leaves no
 * room for "a wellness retreat somewhere on the Costa Brava, twelve to sixteen
 * people, some time in October or November".
 *
 * The period matters more than it looks. A retreat is agreed months ahead and
 * on a range of weeks, not a date — asking for a fixed date first is what kept
 * those conversations off the platform, and accepting a range is what makes the
 * same mechanism work for them without a separate retreat-specific flow.
 */
export default function PostCollabIdeaModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    title: "",
    seekingPartnerType: "venue",
    audience: "",
    city: "",
    venueCategory: "",
    groupSizeMin: "",
    groupSizeMax: "",
    estimatedStart: "",
    estimatedEnd: "",
    dealPreference: "",
    description: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const post = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/collab/ideas", {
        ...form,
        groupSizeMin: form.groupSizeMin ? Number(form.groupSizeMin) : null,
        groupSizeMax: form.groupSizeMax ? Number(form.groupSizeMax) : null,
        estimatedStart: form.estimatedStart || null,
        estimatedEnd: form.estimatedEnd || null,
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      // Say how many were told: a post that reached nobody is worth knowing
      // about immediately, not after a week of silence.
      const notified = Number(result?.notified || 0);
      toast({
        title: "Idea posted",
        description: notified > 0
          ? `${notified} matching ${notified === 1 ? "venue has" : "venues have"} been notified.`
          : "It is now listed. Nobody matched the filters yet, so widen the area or size if it stays quiet.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/ideas/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collab/opportunities/summary"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Could not post that",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // The value of this feature is the matching, and the matching filters on
  // location, capacity and category. A posting with none of those matches
  // nobody by construction, and then tells the poster to "widen the area" they
  // never entered. So the fields the filter needs are required.
  const missing = [
    form.title.trim() === "" ? "a title" : null,
    form.seekingPartnerType === "" ? "who you are looking for" : null,
    form.city.trim() === "" ? "an area" : null,
    !form.groupSizeMin && !form.groupSizeMax ? "a group size" : null,
    !form.estimatedStart && !form.estimatedEnd ? "an estimated period" : null,
  ].filter(Boolean) as string[];
  const canSubmit = missing.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Post a Collab Idea</DialogTitle>
          <DialogDescription>
            A rough idea, not an event. Anyone who fits gets notified, and nothing
            is booked until you both agree terms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="collab-title">What are you thinking of?</Label>
            <Input
              id="collab-title"
              placeholder="4-day wellness retreat, looking for a villa"
              value={form.title}
              onChange={(e) => set("title")(e.target.value)}
              data-testid="input-collab-title"
            />
          </div>

          <div>
            <Label htmlFor="collab-partner">Looking for</Label>
            <Select value={form.seekingPartnerType} onValueChange={set("seekingPartnerType")}>
              <SelectTrigger id="collab-partner" data-testid="select-collab-partner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="venue">A venue or space</SelectItem>
                <SelectItem value="organizer">An organiser</SelectItem>
                <SelectItem value="promoter">A promoter</SelectItem>
                <SelectItem value="service_provider">A service provider</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="collab-city">Area</Label>
              <Input
                id="collab-city"
                placeholder="Costa Brava"
                value={form.city}
                onChange={(e) => set("city")(e.target.value)}
                data-testid="input-collab-city"
              />
            </div>
            <div>
              <Label htmlFor="collab-category">Kind of space</Label>
              <Input
                id="collab-category"
                placeholder="Villa / finca"
                value={form.venueCategory}
                onChange={(e) => set("venueCategory")(e.target.value)}
                data-testid="input-collab-category"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="collab-audience">Audience</Label>
            <Input
              id="collab-audience"
              placeholder="Yoga & breathwork groups"
              value={form.audience}
              onChange={(e) => set("audience")(e.target.value)}
              data-testid="input-collab-audience"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="collab-min">Group size from</Label>
              <Input
                id="collab-min"
                type="number"
                min={1}
                placeholder="12"
                value={form.groupSizeMin}
                onChange={(e) => set("groupSizeMin")(e.target.value)}
                data-testid="input-collab-min"
              />
            </div>
            <div>
              <Label htmlFor="collab-max">to</Label>
              <Input
                id="collab-max"
                type="number"
                min={1}
                placeholder="16"
                value={form.groupSizeMax}
                onChange={(e) => set("groupSizeMax")(e.target.value)}
                data-testid="input-collab-max"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="collab-start">Estimated period from</Label>
              <Input
                id="collab-start"
                type="date"
                value={form.estimatedStart}
                onChange={(e) => set("estimatedStart")(e.target.value)}
                data-testid="input-collab-start"
              />
            </div>
            <div>
              <Label htmlFor="collab-end">to</Label>
              <Input
                id="collab-end"
                type="date"
                value={form.estimatedEnd}
                onChange={(e) => set("estimatedEnd")(e.target.value)}
                data-testid="input-collab-end"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            A rough window is fine — "October to November" is enough to start a
            conversation about a retreat.
          </p>

          <div>
            <Label htmlFor="collab-deal">Deal preference</Label>
            <Input
              id="collab-deal"
              placeholder="Revenue split, open to discuss"
              value={form.dealPreference}
              onChange={(e) => set("dealPreference")(e.target.value)}
              data-testid="input-collab-deal"
            />
          </div>

          <div>
            <Label htmlFor="collab-notes">Anything else</Label>
            <Textarea
              id="collab-notes"
              rows={3}
              placeholder="What you have in mind, and what you are flexible on."
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              data-testid="input-collab-notes"
            />
          </div>

          {missing.length > 0 && (
            <p className="text-xs text-amber-700" data-testid="text-collab-missing">
              Still needed so the right people hear about it: {missing.join(", ")}.
            </p>
          )}

          <Button
            className="w-full"
            disabled={!canSubmit || post.isPending}
            onClick={() => post.mutate()}
            data-testid="button-submit-collab-idea"
          >
            {post.isPending ? "Posting…" : "Post idea"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
