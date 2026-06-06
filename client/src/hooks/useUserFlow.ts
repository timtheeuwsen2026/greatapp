import { useAuth } from "./useAuth";
import { useQuery } from "@tanstack/react-query";
import type { ParticipantProfile, CreatorProfile } from "@shared/schema";

export type UserFlowState = 
  | "new_visitor" // Not logged in
  | "logged_in_no_profile" // Logged in but no profile
  | "participant_complete" // Has participant profile
  | "creator_complete" // Has creator profile
  | "both_profiles" // Has both profiles
  | "loading";

export type UserIntent = 
  | "find_experiences" // Browse and join experiences
  | "create_experiences" // Create/host experiences  
  | "join_community" // Community engagement
  | "plan_trip" // AI travel planning
  | "grow_personally" // Personal development
  | "meet_people" // Social networking
  | "explore_platform"; // General exploration

type ParticipantProfileStatus = {
  hasProfile: boolean;
  profile: ParticipantProfile | null;
};

export function useUserFlow() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Get participant profile
  const { data: participantProfileStatus, isLoading: participantLoading } = useQuery<ParticipantProfileStatus>({
    queryKey: ["/api/participant-profile/status"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Get creator profile  
  const { data: creatorProfile, isLoading: creatorLoading } = useQuery<CreatorProfile>({
    queryKey: ["/api/creator-profile"],
    enabled: isAuthenticated,
    retry: false,
  });

  const isLoading = authLoading || participantLoading || creatorLoading;
  const participantProfile = participantProfileStatus?.profile || null;

  // Determine user flow state
  const getFlowState = (): UserFlowState => {
    if (isLoading) return "loading";
    if (!isAuthenticated) return "new_visitor";
    if (!user) return "new_visitor";

    const hasParticipant = participantProfileStatus?.hasProfile === true;
    const hasCreator = !!creatorProfile;

    if (hasParticipant && hasCreator) return "both_profiles";
    if (hasCreator) return "creator_complete";
    if (hasParticipant) return "participant_complete";
    return "logged_in_no_profile";
  };

  // Get recommended actions based on state
  const getRecommendedActions = (intent?: UserIntent) => {
    const state = getFlowState();
    
    switch (state) {
      case "new_visitor":
        return {
          primary: { label: "Join Great.", action: "/api/login" },
          secondary: [
            { label: "Browse Experiences", action: "/experiences" },
            { label: "Learn More", action: "/why-us" }
          ]
        };

      case "logged_in_no_profile":
        return {
          primary: { label: "Complete Profile Setup", action: "/conversational-profile" },
          secondary: []
        };

      case "participant_complete":
        return {
          primary: intent === "create_experiences" 
            ? { label: "Start Creating", action: "/conversational-creator-setup-v2" }
            : { label: "Find Experiences", action: "/experiences" },
          secondary: [
            { label: "Join Community", action: "/community" },
            { label: "Plan a Trip", action: "/ai-travel" },
            { label: "Create Experience", action: "/conversational-creator-setup-v2" }
          ]
        };

      case "creator_complete":
        return {
          primary: { label: "Create Experience", action: "/create" },
          secondary: [
            { label: "Creator Dashboard", action: "/creator-dashboard" },
            { label: "Join as Participant", action: "/conversational-profile?type=participant" },
            { label: "Find Experiences", action: "/experiences" }
          ]
        };

      case "both_profiles":
        return {
          primary: intent === "create_experiences"
            ? { label: "Create Experience", action: "/create" }
            : { label: "Find Experiences", action: "/experiences" },
          secondary: [
            { label: "Creator Dashboard", action: "/creator-dashboard" },
            { label: "Community", action: "/community" },
            { label: "Plan Trip", action: "/ai-travel" }
          ]
        };

      default:
        return { primary: { label: "Loading...", action: "/" }, secondary: [] };
    }
  };

  // Get the right profile setup flow
  const getProfileSetupFlow = (userType: 'participant' | 'creator' | 'venue') => {
    const state = getFlowState();
    
    if (state === "new_visitor") {
      return "/api/login"; // Must login first
    }
    
    if (state === "logged_in_no_profile") {
      return `/conversational-profile?type=${userType}`;
    }

    // If they have a profile but want to add another type
    if (userType === 'creator' && state === "participant_complete") {
      return `/conversational-profile?type=creator`;
    }
    
    if (userType === 'participant' && state === "creator_complete") {
      return `/conversational-profile?type=participant`;
    }

    // They already have this profile type - go to dashboard
    if (userType === 'creator' && (state === "creator_complete" || state === "both_profiles")) {
      return "/creator-dashboard";
    }
    
    if (userType === 'participant' && (state === "participant_complete" || state === "both_profiles")) {
      return "/community";
    }

    return `/conversational-profile?type=${userType}`;
  };

  const flowState = getFlowState();

  return {
    user,
    participantProfile,
    creatorProfile,
    flowState,
    isLoading,
    getRecommendedActions,
    getProfileSetupFlow,
    hasParticipantProfile: participantProfileStatus?.hasProfile === true,
    hasCreatorProfile: !!creatorProfile,
    needsProfileSetup: flowState === "logged_in_no_profile"
  };
}
