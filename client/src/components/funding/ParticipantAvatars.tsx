import { Users } from "lucide-react";

interface ParticipantAvatarsProps {
  currentParticipants: number;
  minimumParticipants: number;
  maxDisplay?: number;
  size?: "sm" | "md" | "lg" | "xl";
  showCount?: boolean;
  className?: string;
}

export function ParticipantAvatars({
  currentParticipants,
  minimumParticipants,
  maxDisplay = 5,
  size = "md",
  showCount = true,
  className = ""
}: ParticipantAvatarsProps) {
  const sizeClasses = {
    sm: "h-6 w-6 text-xs",
    md: "h-8 w-8 text-sm",
    lg: "h-10 w-10 text-base",
    xl: "h-16 w-16 text-lg"
  };

  const displayCount = Math.min(currentParticipants, maxDisplay);
  const remaining = Math.max(0, currentParticipants - maxDisplay);
  const emptySlots = Math.max(0, Math.min(minimumParticipants - currentParticipants, maxDisplay - displayCount));

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex -space-x-2" aria-label={`${currentParticipants} participants joined`}>
        {/* Filled avatar slots */}
        {Array.from({ length: displayCount }).map((_, i) => (
          <div
            key={`filled-${i}`}
            className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-semibold border-2 border-background shadow-sm`}
            aria-hidden="true"
          >
            <Users className="h-3 w-3" />
          </div>
        ))}

        {/* Show remaining count if more than maxDisplay */}
        {remaining > 0 && (
          <div
            className={`${sizeClasses[size]} rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-semibold border-2 border-background shadow-sm`}
            aria-hidden="true"
          >
            +{remaining}
          </div>
        )}

        {/* Empty avatar slots (unfilled minimum) */}
        {emptySlots > 0 && Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className={`${sizeClasses[size]} rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center`}
            aria-hidden="true"
          >
            <Users className="h-3 w-3 text-gray-400 dark:text-gray-500" />
          </div>
        ))}
      </div>

      {showCount && (
        <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
          {currentParticipants} / {minimumParticipants}
        </span>
      )}
    </div>
  );
}
