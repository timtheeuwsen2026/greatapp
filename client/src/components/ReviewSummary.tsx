import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, readableError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MIN_PUBLIC_REVIEWS, type ReviewScore } from "@shared/reviewScore";

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string | null;
  reply: string | null;
  repliedAt: string | null;
  experienceId: string;
  experienceTitle: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorId?: string | null;
};

type ReviewFeed = { score: ReviewScore; reviews: PublicReview[] };

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
}

/**
 * The score, or "New".
 *
 * Below the threshold there is deliberately no number: two five-star reviews
 * would otherwise read as better than fifty averaging 4.8, and this is the
 * figure an organiser pitches venues with.
 */
export function ReviewScoreBadge({
  score,
  className = "",
}: {
  score?: ReviewScore | null;
  className?: string;
}) {
  if (!score || score.count === 0) {
    return (
      <Badge variant="outline" className={className} data-testid="review-score-new">
        New
      </Badge>
    );
  }

  if (!score.isPublic) {
    return (
      <Badge variant="outline" className={className} data-testid="review-score-new">
        New · {score.count} review{score.count === 1 ? "" : "s"}
      </Badge>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} data-testid="review-score">
      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
      <span className="font-semibold">{score.average?.toFixed(1)}</span>
      <span className="text-sm text-muted-foreground">({score.count})</span>
    </span>
  );
}

/**
 * Reviews for a venue or an organiser, with the single reply each one allows.
 *
 * Both read the same reviews participants already leave on events, so there is
 * no second review flow to fill in and nothing extra to ask anybody for.
 */
export function ReviewSummary({
  endpoint,
  title = "Reviews",
  canReply = false,
  emptyText = "No reviews yet.",
  className = "",
}: {
  /** `/api/venues/:id/reviews` or `/api/users/:id/reviews`. */
  endpoint: string;
  title?: string;
  /** Whether the viewer is the organiser or venue being reviewed. */
  canReply?: boolean;
  emptyText?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const { data } = useQuery<ReviewFeed>({ queryKey: [endpoint], retry: false });

  const reply = useMutation({
    mutationFn: async (reviewId: string) => {
      const response = await apiRequest("POST", `/api/reviews/${reviewId}/reply`, { reply: draft.trim() });
      return response.json();
    },
    onSuccess: () => {
      setReplyingTo(null);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      toast({ title: "Reply posted" });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't post that reply",
        description: readableError(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const score = data?.score;
  const reviews = data?.reviews ?? [];

  return (
    <Card className={className} data-testid="review-summary">
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h2>
          <ReviewScoreBadge score={score} />
        </div>

        {score && score.count > 0 && !score.isPublic && (
          <p className="mb-4 text-sm text-muted-foreground" data-testid="review-threshold-note">
            A public rating appears after {MIN_PUBLIC_REVIEWS} reviews.
            {" "}
            {score.remaining} more to go.
          </p>
        )}

        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-5">
            {reviews.map((review) => (
              <li key={review.id} className="border-b pb-5 last:border-0 last:pb-0" data-testid={`review-${review.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {review.authorId ? (
                    <a
                      href={`/community/profile/${review.authorId}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {review.authorName}
                    </a>
                  ) : (
                    <span className="font-medium">{review.authorName}</span>
                  )}
                  <Stars rating={review.rating} />
                  {review.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {review.experienceTitle && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{review.experienceTitle}</p>
                )}
                {review.comment && (
                  <p className="mt-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300">{review.comment}</p>
                )}

                {review.reply ? (
                  <div className="mt-3 rounded-lg border-l-2 border-primary/40 bg-gray-50 p-3 dark:bg-gray-800/50">
                    <p className="text-xs font-semibold text-muted-foreground">Response</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{review.reply}</p>
                  </div>
                ) : canReply && (
                  replyingTo === review.id ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        value={draft}
                        onChange={(changed) => setDraft(changed.target.value)}
                        placeholder="Reply once. This shows publicly under the review."
                        maxLength={1000}
                        className="min-h-20"
                        data-testid="review-reply-input"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => reply.mutate(review.id)}
                          disabled={!draft.trim() || reply.isPending}
                          data-testid="review-reply-submit"
                        >
                          {reply.isPending ? "Posting..." : "Post reply"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setReplyingTo(null); setDraft(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => { setReplyingTo(review.id); setDraft(""); }}
                      data-testid={`review-reply-${review.id}`}
                    >
                      Reply
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default ReviewSummary;
