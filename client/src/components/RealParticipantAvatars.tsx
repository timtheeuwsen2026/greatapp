import { Link } from "wouter";
import { Plane } from "lucide-react";

interface ParticipantData {
  userId?: string;
  avatarUrl: string | null;
  firstName: string | null;
  displayName: string | null;
}

interface RealParticipantAvatarsProps {
  participants: ParticipantData[];
  maxDisplay?: number;
  size?: "md" | "lg" | "xl";
  showBorder?: boolean;
  showChattingLabel?: boolean;
  className?: string;
}

function isAnonymousParticipant(p: ParticipantData): boolean {
  const combined = `${p.firstName || ''} ${p.displayName || ''}`.toLowerCase().trim();
  if (!combined || combined.replace(/\s/g, '') === '') return !p.avatarUrl;
  if (combined.includes('anonymous')) return true;
  if (combined.includes('???')) return true;
  if (combined.includes('test')) return true;
  if (combined.startsWith('qa') || combined.includes(' qa')) return true;
  return false;
}

function getInitials(name: string | null): string {
  if (!name) return "";
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getDisplayName(participant: ParticipantData): string {
  return participant.firstName || participant.displayName || "Member";
}

export function RealParticipantAvatars({
  participants,
  maxDisplay = 3,
  size = "xl",
  showBorder = true,
  showChattingLabel = false,
  className = ""
}: RealParticipantAvatarsProps) {

  const sizeClasses = {
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-[4.5rem] w-[4.5rem] text-lg"
  };

  const iconSizeClasses = {
    md: "h-4 w-4",
    lg: "h-5 w-5",
    xl: "h-6 w-6"
  };

  const realParticipants = participants.filter(p => !isAnonymousParticipant(p));
  const displayParticipants = realParticipants.slice(0, maxDisplay);
  const remaining = Math.max(0, realParticipants.length - maxDisplay);

  if (realParticipants.length === 0) {
    return null;
  }

  const avatarInner = (participant: ParticipantData) => {
    const displayName = getDisplayName(participant);
    const initials = getInitials(participant.displayName || participant.firstName);
    const isPlaceholder = !participant.firstName && !participant.displayName;

    if (isPlaceholder) {
      return (
        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
          <Plane className={`text-white ${iconSizeClasses[size]}`} />
        </div>
      );
    }
    if (participant.avatarUrl) {
      return (
        <img src={participant.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
      );
    }
    if (initials) {
      return (
        <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-semibold">
          {initials}
        </div>
      );
    }
    return (
      <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
        <Plane className={`text-white ${iconSizeClasses[size]}`} />
      </div>
    );
  };

  const avatarClass = `${sizeClasses[size]} rounded-full ${
    showBorder ? 'border-[3px] border-white dark:border-gray-800' : ''
  } shadow-lg overflow-hidden flex-shrink-0 transition-transform hover:scale-110 hover:z-10`;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex -space-x-3">
        {displayParticipants.map((participant, index) => {
          const displayName = getDisplayName(participant);
          const isClickable = !!participant.userId;
          const isPlaceholder = !participant.firstName && !participant.displayName;
          const tooltipText = isPlaceholder ? "Member" : `${displayName}${isClickable && !isPlaceholder ? " · View profile" : ""}`;

          if (isClickable) {
            return (
              <Link
                key={index}
                href={`/community/profile/${participant.userId}`}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                title={tooltipText}
                className={`${avatarClass} cursor-pointer block`}
              >
                {avatarInner(participant)}
              </Link>
            );
          }

          return (
            <div
              key={index}
              title={tooltipText}
              className={`${avatarClass} cursor-default`}
            >
              {avatarInner(participant)}
            </div>
          );
        })}
      </div>

      {remaining > 0 && showChattingLabel && (
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
          +{remaining} more chatting
        </span>
      )}

      {remaining > 0 && !showChattingLabel && (
        <div
          title={`${remaining} more ${remaining === 1 ? 'member' : 'members'}`}
          className={`${sizeClasses[size]} rounded-full ${
            showBorder ? 'border-[3px] border-white dark:border-gray-800' : ''
          } shadow-lg flex-shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-semibold cursor-default transition-transform hover:scale-110 hover:z-10`}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
