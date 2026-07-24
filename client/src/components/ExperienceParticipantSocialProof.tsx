import { Plus, User } from "lucide-react";
import { RealParticipantAvatars, isAnonymousParticipant } from "@/components/RealParticipantAvatars";

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

  // RealParticipantAvatars hides anonymous/test accounts and renders nothing when it
  // filters them all out. Pre-filter with the same rule so we can fall back below
  // instead of rendering an empty avatar row.
  const namedParticipants = safeParticipants.filter((participant) => !isAnonymousParticipant(participant));

  // Preview data can be missing even when people HAVE joined — the server strips
  // test/qa/anonymous accounts and anyone without a profile row. In that case show one
  // avatar per joined member (capped) rather than a fixed pair of dashed "open spot"
  // circles, which wrongly reads as "nobody joined".
  const genericCount = Math.min(safeJoinedCount, maxDisplay);
  const genericRemaining = Math.max(0, safeJoinedCount - genericCount);

  return (
    <div
      className={`flex min-h-10 items-center gap-3 ${className}`}
      data-testid="experience-participant-social-proof"
    >
      {namedParticipants.length > 0 ? (
        <RealParticipantAvatars
          participants={namedParticipants}
          maxDisplay={maxDisplay}
          size="md"
          showBorder
        />
      ) : safeJoinedCount > 0 ? (
        <div className="flex -space-x-2" aria-label={`${safeJoinedCount} joined`}>
          {Array.from({ length: genericCount }).map((_, index) => (
            <div
              key={`member-${index}`}
              className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-lg dark:border-gray-800"
              aria-hidden="true"
              data-testid="member-avatar-placeholder"
            >
              <User className="h-4 w-4" />
            </div>
          ))}
          {genericRemaining > 0 && (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-gray-200 text-xs font-semibold text-gray-700 shadow-lg dark:border-gray-800 dark:bg-gray-700 dark:text-gray-300"
              aria-hidden="true"
              data-testid="member-avatar-overflow"
            >
              +{genericRemaining}
            </div>
          )}
        </div>
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
