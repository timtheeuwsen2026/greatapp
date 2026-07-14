export type PayoutEligibilityInput = {
  requireMinimumParticipants?: boolean | null;
  mvgEnabled?: boolean | null;
  mvgStatus?: string | null;
};

export function isExperiencePayoutEligible(experience: PayoutEligibilityInput): boolean {
  const requiresMvg = !!(experience.requireMinimumParticipants || experience.mvgEnabled);
  return !requiresMvg || experience.mvgStatus === "met";
}

export function resolvePayoutGrossCents(
  bookingGrossCents: number,
  presetGrossCents: number,
  additionalGrossCents: number,
): number {
  return Math.max(0, bookingGrossCents > 0 ? bookingGrossCents : presetGrossCents)
    + Math.max(0, additionalGrossCents);
}
