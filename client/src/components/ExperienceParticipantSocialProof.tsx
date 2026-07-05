import { Plus } from "lucide-react";
import { RealParticipantAvatars } from "@/components/RealParticipantAvatars";

export interface ExperienceParticipantPreview {
  userId?: string;
  avatarUrl: string | null;
  firstName: string | null;
  displayName: string | null;
}

interface ExperienceParticipantSocialProofProps {
  participants?: ExperienceParticipantPreview[] | null;
  joinedCount?: number | null;
  maxDisplay?: number;
  className?: string;
}

export function ExperienceParticipantSocialProof({
  participants = [],
  joinedCount = 0,
  maxDisplay = 3,
  className = "",
}: ExperienceParticipantSocialProofProps) {
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const safeJoinedCount = Math.max(0, Number(joinedCount || 0));
  const hasVisibleParticipants = safeParticipants.length > 0;

  return (
    <div
      className={`flex min-h-10 items-center gap-3 ${className}`}
      data-testid="experience-participant-social-proof"
    >
      {hasVisibleParticipants ? (
        <RealParticipantAvatars
          participants={safeParticipants}
          maxDisplay={maxDisplay}
          size="md"
          showBorder
        />
      ) : (
        <div className="flex -space-x-2" aria-label="Open member spots">
          {[0, 1].map((slot) => (
            <div
              key={slot}
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800"
              aria-hidden="true"
              data-testid="open-avatar-placeholder"
            >
              <Plus className="h-4 w-4" />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
        {safeJoinedCount > 0
          ? `${safeJoinedCount} joined`
          : "Be the first to join · spots open"}
      </p>
    </div>
  );
}
