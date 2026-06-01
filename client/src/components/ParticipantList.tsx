import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Plane } from "lucide-react";
import { Link } from "wouter";

interface Participant {
  user?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  };
  userId?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  displayName?: string;
  avatarUrl?: string;
  profile?: {
    displayName?: string;
    avatarUrl?: string;
  };
}

interface ParticipantListProps {
  participants: Participant[];
  showList: boolean;
  totalCount: number;
  isLoading?: boolean;
}

function isAnonymousParticipant(firstName?: string, lastName?: string, displayName?: string): boolean {
  const combined = `${firstName || ''} ${lastName || ''} ${displayName || ''}`.toLowerCase().trim();
  if (!combined || combined.replace(/\s/g, '') === '') return true;
  if (combined.includes('anonymous')) return true;
  if (combined.includes('???')) return true;
  if (combined.includes('test')) return true;
  if (combined.startsWith('qa') || combined.includes(' qa')) return true;
  return false;
}

export default function ParticipantList({ 
  participants, 
  showList, 
  totalCount,
  isLoading = false
}: ParticipantListProps) {
  const getParticipantData = (participant: Participant) => {
    const user = participant.user || participant;
    const userId = participant.userId || "";
    const firstName = user.firstName || participant.firstName || "";
    const lastName = user.lastName || participant.lastName || "";
    const profileImageUrl = user.profileImageUrl || participant.profileImageUrl || participant.avatarUrl || participant.profile?.avatarUrl || "";
    const displayName = participant.displayName || participant.profile?.displayName || firstName || "";
    
    return { userId, firstName, lastName, profileImageUrl, displayName };
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (firstName && lastName) return `${firstName[0].toUpperCase()}${lastName[0].toUpperCase()}`;
    if (firstName) return firstName[0].toUpperCase();
    return "";
  };

  const getPrimaryName = (firstName?: string, lastName?: string, displayName?: string) => {
    if (displayName && displayName !== firstName) return displayName;
    return firstName || "";
  };

  // Filter out anonymous/test/QA/broken entries from the list
  const filteredParticipants = participants.filter(p => {
    const { firstName, lastName, displayName } = getParticipantData(p);
    return !isAnonymousParticipant(firstName, lastName, displayName);
  });

  // Loading state
  if (isLoading) {
    if (!showList) {
      return (
        <div className="flex items-center space-x-2" data-testid="participant-list-loading">
          <Users className="h-4 w-4 text-gray-400" />
          <Skeleton className="h-4 w-32" />
        </div>
      );
    }

    return (
      <div className="space-y-4" data-testid="participant-grid-loading">
        <div className="flex items-center space-x-2 mb-4">
          <Users className="h-5 w-5 text-gray-400" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center space-x-3 p-3 border rounded-lg">
              <Skeleton className="w-10 h-10 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Simple count display when showList is false
  if (!showList) {
    return (
      <div className="flex items-center space-x-2" data-testid="participant-count-only">
        <Users className="h-4 w-4 text-gray-600" />
        <span className="text-sm text-gray-600" data-testid="text-participant-count">
          {totalCount === 0 
            ? "Be the first to join!" 
            : `${totalCount} ${totalCount === 1 ? 'person is' : 'people are'} joining`
          }
        </span>
      </div>
    );
  }

  // Empty state for grid view
  if (filteredParticipants.length === 0) {
    return (
      <div className="space-y-4" data-testid="participant-grid-empty">
        <div className="flex items-center space-x-2 mb-4">
          <Users className="h-5 w-5 text-gray-600" />
          <span className="font-medium text-gray-900">Participants ({totalCount})</span>
        </div>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-600 text-sm" data-testid="text-participant-count">
            Be the first to join this experience!
          </p>
        </div>
      </div>
    );
  }

  // Grid view with participant list
  return (
    <div className="space-y-4" data-testid="participant-grid">
      <div className="flex items-center space-x-2 mb-4">
        <Users className="h-5 w-5 text-gray-600" />
        <span className="font-medium text-gray-900" data-testid="text-participant-count">
          Participants ({totalCount})
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredParticipants.map((participant, index) => {
          const { userId, firstName, lastName, profileImageUrl, displayName } = getParticipantData(participant);
          const primaryName = getPrimaryName(firstName, lastName, displayName);
          const initials = getInitials(firstName, lastName);
          const participantId = userId || `participant-${index}`;
          const isPlaceholder = !firstName && !primaryName;

          const cardInner = (
            <>
              {isPlaceholder ? (
                <div
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center flex-shrink-0"
                  data-testid={`participant-avatar-${participantId}`}
                >
                  <Plane className="h-4 w-4 text-white" />
                </div>
              ) : (
                <Avatar 
                  className="w-10 h-10 flex-shrink-0" 
                  data-testid={`participant-avatar-${participantId}`}
                >
                  <AvatarImage src={profileImageUrl || ""} alt={primaryName || "Traveler"} />
                  <AvatarFallback className="text-xs bg-gradient-to-br from-primary to-secondary text-white">
                    {initials || <Plane className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="flex-1 min-w-0">
                <p 
                  className="text-sm font-medium text-gray-900 truncate" 
                  data-testid={`participant-name-${participantId}`}
                >
                  {isPlaceholder ? (
                    <span className="text-gray-400 italic">Traveler</span>
                  ) : (
                    primaryName
                  )}
                </p>
              </div>
            </>
          );

          if (userId) {
            return (
              <Link
                key={participantId}
                href={`/community/profile/${userId}`}
                className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:border-primary/30 transition-colors bg-white cursor-pointer hover:bg-primary/5 block"
                data-testid={`participant-item-${participantId}`}
              >
                {cardInner}
              </Link>
            );
          }

          return (
            <div
              key={participantId}
              className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg bg-white"
              data-testid={`participant-item-${participantId}`}
            >
              {cardInner}
            </div>
          );
        })}
      </div>

      {totalCount > filteredParticipants.length && (
        <div className="text-center pt-2">
          <p className="text-sm text-gray-500">
            and {totalCount - filteredParticipants.length} more {totalCount - filteredParticipants.length === 1 ? 'participant' : 'participants'}
          </p>
        </div>
      )}
    </div>
  );
}
