export interface BookingEmailDecisionInput {
  requireMinimumParticipants?: boolean | null;
  minimumParticipants?: number | null;
  currentParticipants?: number | null;
  mvgStatus?: string | null;
}

export interface BookingEmailDecision {
  kind: "pre_mvg" | "awaiting_confirmation" | "confirmed";
  remainingMvgSpots: number;
}

export function resolveBookingEmailDecision(input: BookingEmailDecisionInput): BookingEmailDecision {
  const currentParticipants = Math.max(0, input.currentParticipants || 0);
  const minimumParticipants = Math.max(0, input.minimumParticipants || 0);
  const remainingMvgSpots = Math.max(0, minimumParticipants - currentParticipants);
  const requiresMvg = Boolean(input.requireMinimumParticipants);
  const isMvgMet = input.mvgStatus === "met";

  let kind: BookingEmailDecision["kind"] = "confirmed";
  if (requiresMvg && !isMvgMet) {
    kind = remainingMvgSpots > 0 ? "pre_mvg" : "awaiting_confirmation";
  }

  return {
    kind,
    remainingMvgSpots,
  };
}
