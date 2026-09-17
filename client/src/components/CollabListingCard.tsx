import { ReactNode } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Sparkles, Handshake, Pencil, Trash2 } from "lucide-react";
import { getCoverImage } from "@/lib/utils";

/**
 * A Collab Opportunity, wearing the Experience Card's clothes.
 *
 * Deliberately not a new card type. Collab listings were rendered as text rows
 * — a badge, a bold line, a grey line, a button — while everything else on the
 * platform is a photo-forward card, so the one feed meant to be scanned quickly
 * was the one hardest to scan. This is the Explore card's shape: cover image,
 * tag over the image, title, location, group size, deal tag, one action.
 *
 * What is left out is as deliberate as what is kept. No price, no deposit, no
 * "from €X per person": a Collab Idea is not a bookable experience, and putting
 * a price on it would promise something it cannot deliver. No MVG progress and
 * no social proof either — there are no participants yet to show. The CTA is
 * whatever this listing's action is ("Offer to Host", "I'm interested"), never
 * "Book".
 */
export type CollabListing = {
  kind: string;
  id: string;
  tag: string;
  title: string;
  location?: string | null;
  detail?: string;
  imageUrl?: string | null;
  groupSize?: number | null;
  dealLabel?: string | null;
  /** Why this was suggested. Only ever set on organic matches. */
  reasons?: string[];
  href?: string;
  actionLabel: string;
};

export default function CollabListingCard({
  listing,
  /** A rough idea has no date and no counterparty; it is drawn as the sketch it is. */
  muted = false,
  onAction,
  actionDisabled = false,
  footer,
  /** Opens the detail view. Every card has one, including the poster's own. */
  onOpen,
  /** The poster's own controls, shown on the card as well as in the detail view. */
  onEdit,
  onDelete,
  testId,
}: {
  listing: CollabListing;
  muted?: boolean;
  onAction?: () => void;
  actionDisabled?: boolean;
  footer?: ReactNode;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  testId?: string;
}) {
  // No stock fallback. Every idea card used to render the same yoga photo,
  // which quietly told a visitor that a coffee rave was a wellness retreat. An
  // idea with no upload gets a neutral tile instead.
  const image = getCoverImage(listing.imageUrl || undefined, undefined);

  const action = (
    <Button
      variant={muted ? "outline" : "default"}
      className={muted ? "" : "btn-gradient"}
      disabled={actionDisabled}
      onClick={(event) => {
        // The card itself opens the detail view, so the button must not open it
        // too on its way to doing its own job.
        event.stopPropagation();
        onAction?.();
      }}
      data-testid={`button-collab-action-${listing.id}`}
    >
      {listing.actionLabel}
    </Button>
  );

  return (
    <Card
      className={`experience-card group overflow-hidden ${muted ? "border-dashed bg-gray-50/60" : ""} ${onOpen ? "cursor-pointer" : ""}`}
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      } : undefined}
      data-testid={testId}
    >
      <div className="relative">
        {image ? (
          <img
            src={image}
            alt=""
            className={`h-40 w-full object-cover transition-transform duration-500 group-hover:scale-105 ${muted ? "opacity-80" : ""}`}
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center bg-indigo-50 dark:bg-indigo-950/40">
            <Handshake className="h-9 w-9 text-indigo-300" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <Badge variant={muted ? "outline" : "secondary"} className="bg-white/90 text-gray-900">
            {listing.tag}
          </Badge>
        </div>
        {(onEdit || onDelete) && (
          <div className="absolute right-2 top-2 flex gap-1">
            {onEdit && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-7 w-7 bg-white/90"
                aria-label="Edit this posting"
                onClick={(event) => { event.stopPropagation(); onEdit(); }}
                data-testid={`button-collab-edit-${listing.id}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-7 w-7 bg-white/90 text-red-700"
                aria-label="Delete this posting"
                onClick={(event) => { event.stopPropagation(); onDelete(); }}
                data-testid={`button-collab-delete-${listing.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      <CardContent className="p-4">
        <h3 className="mb-1 truncate text-lg font-semibold text-gray-900" title={listing.title}>
          {listing.title}
        </h3>

        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          {listing.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span className="truncate">{listing.location}</span>
            </span>
          )}
          {!!listing.groupSize && (
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {listing.groupSize} people
            </span>
          )}
        </div>

        {listing.dealLabel && (
          <Badge variant="outline" className="mb-3 capitalize">
            {listing.dealLabel}
          </Badge>
        )}

        {/* Why this turned up, in words. A percentage would suggest a precision
            a filter over stated preferences does not have. */}
        {!!listing.reasons?.length && (
          <ul className="mb-3 space-y-1" data-testid={`collab-reasons-${listing.id}`}>
            {listing.reasons.map((reason) => (
              <li key={reason} className="flex items-center gap-1.5 text-xs text-indigo-700">
                <Sparkles className="h-3 w-3 shrink-0" />
                {reason}
              </li>
            ))}
          </ul>
        )}

        {listing.detail && !listing.reasons?.length && (
          <p className="mb-3 truncate text-sm text-gray-500">{listing.detail}</p>
        )}

        <div className="flex items-center justify-between gap-3">
          {footer ?? <span />}
          {listing.href && !onAction
            ? (
              <Link href={listing.href} onClick={(event) => event.stopPropagation()}>
                {action}
              </Link>
            )
            : action}
        </div>
      </CardContent>
    </Card>
  );
}
