export type MvgAvailabilityInput = {
  requireMinimumParticipants?: boolean | null;
  lifecycleStatus?: string | null;
  mvgStatus?: string | null;
  mvgMet?: boolean | null;
  currentParticipants?: number | null;
  minimumParticipants?: number | null;
  mvgMin?: number | null;
};

export function isMvgStillForming(experience: MvgAvailabilityInput): boolean {
  if (!experience.requireMinimumParticipants) return false;
  if (experience.lifecycleStatus === "cancelled") return false;
  if (experience.lifecycleStatus === "confirmed" || experience.mvgStatus === "met" || experience.mvgMet) {
    return false;
  }

  const target = Number(experience.minimumParticipants ?? experience.mvgMin ?? 0);
  const current = Number(experience.currentParticipants ?? 0);
  if (target > 0 && current >= target) return false;
  return experience.lifecycleStatus === "forming" || experience.mvgStatus === "pending" || target > 0;
}
