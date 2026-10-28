import { UNTITLED_VENUE_NAME, venueSubmitProblems } from "@shared/venueSubmitReadiness";

/**
 * One row of the admin Drafts tab: an event draft or a venue still in draft,
 * who it belongs to, and what is still missing before it can go out.
 *
 * Unfinished listings are invisible everywhere else until their owner submits
 * them, so this is the one place an admin can see who got stuck, and where.
 */
export interface AdminDraftItem {
  kind: "event" | "venue";
  id: string;
  title: string;
  ownerId: string | null;
  ownerName: string;
  ownerEmail: string | null;
  updatedAt: string | null;
  /** Started in the idea phase and not yet built out. */
  isIdea: boolean;
  /** Nothing typed yet beyond the bare record; hidden by default. */
  isEmpty: boolean;
  missing: string[];
  ready: boolean;
  /** Where an admin opens it to finish it. */
  openUrl: string;
}

type OwnerColumns = { ownerFirstName?: string | null; ownerLastName?: string | null; ownerEmail?: string | null };

function ownerName(row: OwnerColumns): string {
  const name = [row.ownerFirstName, row.ownerLastName].map((part) => (part || "").trim()).filter(Boolean).join(" ");
  return name || row.ownerEmail || "Unknown";
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function adminDraftItems(
  rows: { events: Array<{ draft: any } & OwnerColumns>; venues: Array<{ venue: any } & OwnerColumns> },
  publicationProblems: (draft: any) => string[],
): AdminDraftItem[] {
  const events = rows.events.map(({ draft, ...owner }): AdminDraftItem => {
    const title = (draft.title || "").trim();
    const missing = publicationProblems(draft);
    return {
      kind: "event",
      id: draft.id,
      title: title || "Untitled event",
      ownerId: draft.creatorId ?? null,
      ownerName: ownerName(owner),
      ownerEmail: owner.ownerEmail ?? null,
      updatedAt: iso(draft.updatedAt ?? draft.createdAt),
      isIdea: !!draft.concept,
      isEmpty: !title && !draft.description && !draft.startDate,
      missing,
      ready: missing.length === 0,
      openUrl: `/event-builder/${draft.id}`,
    };
  });

  const venues = rows.venues.map(({ venue, ...owner }): AdminDraftItem => {
    const name = (venue.name || "").trim();
    const missing = venueSubmitProblems(venue);
    return {
      kind: "venue",
      id: venue.id,
      title: name && name !== UNTITLED_VENUE_NAME ? name : "Untitled venue",
      ownerId: venue.createdBy ?? null,
      ownerName: ownerName(owner),
      ownerEmail: owner.ownerEmail ?? null,
      updatedAt: iso(venue.updatedAt ?? venue.createdAt),
      isIdea: false,
      isEmpty: (!name || name === UNTITLED_VENUE_NAME) && !(venue.description || "").trim() && !(venue.city || "").trim(),
      missing,
      ready: missing.length === 0,
      openUrl: `/venue/setup?edit=${venue.id}`,
    };
  });

  // Most recently touched first, across both kinds: that is who is working now.
  return [...events, ...venues].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}
