import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, readableError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { normalizeImageUrl } from "@/lib/utils";

type Reviewable = {
  experienceId: string;
  title: string;
  coverImageUrl: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
};

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
          onMouseEnter={() => setHovered(rating)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(rating)}
          className="rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid={`review-star-${rating}`}
        >
          <Star
            className={`h-7 w-7 transition-colors ${
              rating <= shown ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * "How was it?" for an event somebody actually went to.
 *
 * The rating on an event page had nothing behind it: the table, the endpoint
 * and the stars all existed, but no screen ever asked anyone for a review, so
 * every event sat at 0.0. This is the ask, shown once the event has finished
 * to the people who were there.
 */
export function ReviewPrompt({ className = "" }: { className?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const { data } = useQuery<{ pending: Reviewable[] }>({
    queryKey: ["/api/me/reviewable"],
    retry: false,
  });

  // One at a time. A stack of review forms is a wall, not a request.
  //
  // The "Rate this" button in the post-event email carries the event it is
  // asking about, so somebody arriving from it lands on that one rather than
  // on whatever happens to be at the top of their list.
  const pending = data?.pending ?? [];
  const requested = new URLSearchParams(window.location.search).get("review");
  const event = (requested && pending.find((item) => item.experienceId === requested)) || pending[0];

  const submit = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/reviews", {
        experienceId: event?.experienceId,
        rating,
        comment: comment.trim() || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      setRating(0);
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/me/reviewable"] });
      if (event) {
        queryClient.invalidateQueries({ queryKey: [`/api/experiences/${event.experienceId}`] });
      }
      toast({
        title: "Thanks for the review",
        description: "It's now on the event page.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't save that review",
        description: readableError(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  if (!event) return null;

  const when = event.startDate ? new Date(event.startDate).toLocaleDateString() : null;

  return (
    <Card className={`border-primary/30 bg-primary/5 ${className}`} data-testid="review-prompt">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {event.coverImageUrl && (
            <img
              src={normalizeImageUrl(event.coverImageUrl) ?? undefined}
              alt={event.title}
              className="hidden h-16 w-16 shrink-0 rounded-lg object-cover sm:block"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">How was it?</p>
            <h3 className="truncate font-semibold" data-testid="review-prompt-title">
              {event.title}
            </h3>
            {when && <p className="text-xs text-muted-foreground">{when}</p>}

            <div className="mt-3">
              <StarPicker value={rating} onChange={setRating} />
            </div>

            {rating > 0 && (
              <div className="mt-3 space-y-3">
                <Textarea
                  value={comment}
                  onChange={(changed) => setComment(changed.target.value)}
                  placeholder="Anything you'd tell someone thinking of going? (optional)"
                  className="min-h-20 bg-white dark:bg-gray-900"
                  maxLength={2000}
                  data-testid="review-comment"
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => submit.mutate()}
                    disabled={submit.isPending}
                    data-testid="review-submit"
                  >
                    {submit.isPending ? "Sending..." : "Post review"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRating(0);
                      setComment("");
                    }}
                    disabled={submit.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {pending.length > 1 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {pending.length - 1} more event
                {pending.length - 1 === 1 ? "" : "s"} to review after this one.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ReviewPrompt;
