import { Badge } from "@/components/ui/badge";
import { getParticipantReferralSummary } from "@/lib/promotionDeals";
import { CheckCircle2, Gift, Sparkles } from "lucide-react";

export type ParticipantReferralPerkOffer = {
  participantReferralDealType?: string | null;
  participantReferralCommissionPct?: string | number | null;
  participantReferralMilestoneAttendeeTarget?: string | number | null;
  participantReferralMilestoneRewardDescription?: string | null;
};

type ParticipantReferralPerkCardProps = {
  experience?: ParticipantReferralPerkOffer | null;
  context?: "public" | "post_checkout";
  className?: string;
};

export function hasActiveParticipantReferralPerk(experience?: ParticipantReferralPerkOffer | null): boolean {
  if (experience?.participantReferralDealType === "commission_per_ticket") {
    return Number(experience.participantReferralCommissionPct || 0) > 0;
  }

  if (experience?.participantReferralDealType === "milestone_barter") {
    return Number(experience.participantReferralMilestoneAttendeeTarget || 0) > 0
      && Boolean(experience.participantReferralMilestoneRewardDescription?.trim());
  }

  return false;
}

export default function ParticipantReferralPerkCard({
  experience,
  context = "public",
  className = "",
}: ParticipantReferralPerkCardProps) {
  if (!hasActiveParticipantReferralPerk(experience)) return null;

  const summary = getParticipantReferralSummary(experience!);
  const isMilestone = summary.dealType === "milestone_barter";
  const supportingCopy = context === "post_checkout"
    ? "Share your personal referral link below. Every qualifying friend booking is tracked automatically toward this reward."
    : "Book this experience to receive your personal referral link, then share it with friends. Qualifying bookings are tracked automatically.";

  return (
    <section
      className={`rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-fuchsia-50 p-5 text-left shadow-sm dark:border-amber-700 dark:from-amber-950/50 dark:via-gray-950 dark:to-fuchsia-950/40 ${className}`}
      data-testid={`participant-referral-perk-${context}`}
      aria-label="Participant Referral Perk"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-200">
          <Gift className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className="border-0 bg-amber-500 text-white hover:bg-amber-500">
              <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Participant Referral Perk
            </Badge>
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              {summary.label}
            </span>
          </div>

          <h3 className="text-lg font-bold leading-snug text-gray-950 dark:text-white">
            {summary.headline}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {supportingCopy}
          </p>

          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {isMilestone ? "Unlocks when the friend-booking target is reached" : "Cashback applies to every qualifying friend booking"}
          </div>
        </div>
      </div>
    </section>
  );
}
