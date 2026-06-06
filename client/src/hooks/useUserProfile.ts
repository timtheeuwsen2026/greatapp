import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

export interface UserProfile {
  id: string;
  displayName?: string;
  location?: string;
  bio?: string;
  interests?: string[];
  profileType?: 'participant' | 'creator' | 'venue';
  isComplete: boolean;
}

type ParticipantProfileStatus = {
  hasProfile: boolean;
  profile: unknown | null;
};

export function useUserProfile() {
  const { user, isAuthenticated } = useAuth();

  const { data: participantProfileStatus, isLoading: participantLoading } = useQuery<ParticipantProfileStatus>({
    queryKey: ['/api/participant-profile/status'],
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: creatorProfile, isLoading: creatorLoading } = useQuery({
    queryKey: ['/api/creator-profile'],
    enabled: isAuthenticated,
    retry: false,
  });

  const isLoading = participantLoading || creatorLoading;

  // Determine user's profile state
  const participantProfile = participantProfileStatus?.profile || null;
  const hasParticipantProfile = participantProfileStatus?.hasProfile === true;
  const hasCreatorProfile = !!creatorProfile;
  const hasAnyProfile = hasParticipantProfile || hasCreatorProfile;
  
  const primaryProfile = creatorProfile || participantProfile;
  const profileType = creatorProfile ? 'creator' : hasParticipantProfile ? 'participant' : null;

  return {
    user,
    isAuthenticated,
    isLoading,
    hasParticipantProfile,
    hasCreatorProfile,
    hasAnyProfile,
    primaryProfile,
    profileType,
    needsProfileSetup: isAuthenticated && !hasAnyProfile,
  };
}
