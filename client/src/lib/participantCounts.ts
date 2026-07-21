function toParticipantCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function formatMvgParticipantCount(
  currentParticipants: number,
  minimumParticipants: number,
  mvgMet: boolean,
): string {
  const current = toParticipantCount(currentParticipants);
  const minimum = toParticipantCount(minimumParticipants);

  if (mvgMet) {
    return minimum > 0
      ? `Minimum of ${minimum} reached · ${current} total joined`
      : `${current} total joined`;
  }

  if (minimum === 0) {
    return `${current} joined`;
  }

  return `${Math.min(current, minimum)} of ${minimum} joined`;
}

export function formatCapacityParticipantCount(
  currentParticipants: number,
  maxParticipants: number | null | undefined,
): string {
  const current = toParticipantCount(currentParticipants);
  const capacity = toParticipantCount(maxParticipants ?? 0);

  return capacity > 0
    ? `${current} / ${capacity} participants`
    : `${current} participants`;
}

export function calculateMvgPercentage(
  currentParticipants: number,
  minimumParticipants: number,
): number {
  const current = toParticipantCount(currentParticipants);
  const minimum = toParticipantCount(minimumParticipants);

  if (minimum === 0) return 0;
  return Math.min(100, Math.round((current / minimum) * 100));
}
