type PublicExperienceCandidate = {
  status?: string | null;
  price?: unknown;
};

/**
 * Public discovery is controlled by publication status. Price is deliberately
 * not part of this decision because a zero-priced Free RSVP is still a valid
 * marketplace experience.
 */
export function isPublicExperienceListable(experience: PublicExperienceCandidate): boolean {
  return experience.status === "approved" || experience.status === "published";
}
