export type PayoutEligibilityInput = {
  requireMinimumParticipants?: boolean | null;
  mvgEnabled?: boolean | null;
  mvgStatus?: string | null;
};

export function isExperiencePayoutEligible(experience: PayoutEligibilityInput): boolean {
  const requiresMvg = !!(experience.requireMinimumParticipants || experience.mvgEnabled);
  return !requiresMvg || experience.mvgStatus === "met";
}
