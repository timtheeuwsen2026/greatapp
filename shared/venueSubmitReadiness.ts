/**
 * What a venue still needs before it can be submitted for review.
 *
 * A draft saves whatever has been typed so far, so nobody loses work halfway
 * through the listing form. Completeness is checked once, here, when the venue
 * is sent for review, and each problem is a sentence the owner can act on.
 */

export interface VenueSubmitFields {
  name?: string | null;
  city?: string | null;
  description?: string | null;
  capacity?: number | string | null;
  location?: string | null;
}

/** The name the server gives a draft saved before the venue had one. */
export const UNTITLED_VENUE_NAME = "Untitled venue";

const MIN_DESCRIPTION = 50;
const MIN_ADDRESS = 5;

export function venueSubmitProblems(venue: VenueSubmitFields): string[] {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const problems: string[] = [];

  const name = text(venue.name);
  if (!name || name === UNTITLED_VENUE_NAME) problems.push("Add your venue's name.");
  if (!text(venue.city)) problems.push("Add the city.");
  if (text(venue.description).length < MIN_DESCRIPTION) {
    problems.push(`Write a description of at least ${MIN_DESCRIPTION} characters.`);
  }
  const capacity = Number(venue.capacity);
  if (!Number.isFinite(capacity) || capacity < 1) problems.push("Add how many people fit.");
  if (text(venue.location).length < MIN_ADDRESS) problems.push("Add the full address.");

  return problems;
}
