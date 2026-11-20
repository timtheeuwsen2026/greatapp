type PublicExperienceCandidate = {
  status?: string | null;
  price?: unknown;
  /** Admin's "Hide from public" for internal tests (66.20e). */
  hiddenFromPublic?: boolean | null;
};

/**
 * Public discovery is controlled by publication status. Price is deliberately
 * not part of this decision because a zero-priced Free RSVP is still a valid
 * marketplace experience.
 */
export function isPublicExperienceListable(experience: PublicExperienceCandidate): boolean {
  if (experience.hiddenFromPublic === true) return false;
  return experience.status === "approved" || experience.status === "published";
}
