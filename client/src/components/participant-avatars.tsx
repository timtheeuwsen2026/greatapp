import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { Plane } from "lucide-react";

interface ParticipantAvatarsProps {
  participants: Array<{
    user?: {
      firstName?: string;
      lastName?: string;
      profileImageUrl?: string;
    };
    userId?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    displayName?: string;
  }>;
  maxDisplay?: number;
  totalCount: number;
}

function isAnonymousEntry(firstName?: string, lastName?: string, displayName?: string): boolean {
  const combined = `${firstName || ''} ${lastName || ''} ${displayName || ''}`.toLowerCase().trim();
  if (!combined || combined.replace(/\s/g, '') === '') return true;
  if (combined.includes('anonymous')) return true;
  if (combined.includes('???')) return true;
  if (combined.includes('test')) return true;
  if (combined.startsWith('qa') || combined.includes(' qa')) return true;
  return false;
}

export default function ParticipantAvatars({ 
  participants, 
  maxDisplay = 3, 
  totalCount 
}: ParticipantAvatarsProps) {

  const realParticipants = participants.filter(p => {
    const fn = p.user?.firstName || p.firstName;
    const ln = p.user?.lastName || p.lastName;
    const dn = p.displayName;
    return !isAnonymousEntry(fn, ln, dn);
  });

  const displayParticipants = realParticipants.slice(0, maxDisplay);
  const remainingCount = Math.max(0, totalCount - maxDisplay);
  
  const getInitials = (firstName?: string, lastName?: string, displayName?: string) => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (firstName) return firstName[0].toUpperCase();
    if (displayName) {
      const words = displayName.trim().split(/\s+/);
      if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
      return displayName.slice(0, 2).toUpperCase();
    }
    return null;
  };

  const getNames = () => {
    if (realParticipants.length === 0) return "Be the first to join!";
    
    const names = displayParticipants
      .map(p => p.user?.firstName || p.firstName || p.displayName)
      .filter(Boolean)
      .slice(0, 2) as string[];
    
    if (remainingCount > 0) {
      return names.length > 0 
        ? `${names.join(", ")} & ${remainingCount} others`
        : `${remainingCount} travelers joined`;
    }
    
    return names.join(", ");
  };

  return (
    <div className="flex items-center space-x-2">
      <div className="flex -space-x-2 avatar-stack">
        {displayParticipants.map((participant, index) => {
          const fn = participant.user?.firstName || participant.firstName;
          const ln = participant.user?.lastName || participant.lastName;
          const dn = participant.displayName;
          const imgUrl = participant.user?.profileImageUrl || participant.profileImageUrl || "";
          const initials = getInitials(fn, ln, dn);
          const isPlaceholder = !initials;
          const userId = participant.userId;

          const avatarEl = (
            <Avatar
              className={`w-8 h-8 border-2 border-white avatar ${userId ? 'hover:opacity-90 hover:scale-110 transition-transform' : ''}`}
              title={userId ? (fn || dn || 'Traveler') : undefined}
            >
              <AvatarImage src={imgUrl} />
              <AvatarFallback className={`text-xs ${isPlaceholder ? 'bg-gradient-to-br from-violet-500 to-purple-700' : 'bg-gradient-to-br from-primary to-secondary'} text-white`}>
                {isPlaceholder ? <Plane className="h-3 w-3" /> : initials}
              </AvatarFallback>
            </Avatar>
          );

          if (userId) {
            return (
              <Link
                key={index}
                href={`/community/profile/${userId}`}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                className="cursor-pointer block"
              >
                {avatarEl}
              </Link>
            );
          }

          return <span key={index}>{avatarEl}</span>;
        })}
        
        {remainingCount > 0 && (
          <Avatar className="w-8 h-8 border-2 border-white avatar">
            <AvatarFallback className="text-xs bg-gray-200 text-gray-600">
              +{remainingCount}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      
      <div className="ml-3">
        <p className="text-xs text-gray-600">{getNames()}</p>
      </div>
    </div>
  );
}
