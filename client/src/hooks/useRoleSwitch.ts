import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

export type UserRole = 'participant' | 'creator' | 'venue_provider' | 'service_provider' | 'admin' | 'promoter';

interface RoleSwitchResponse {
  message: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
}

// Profile validation functions
async function checkCreatorProfile(): Promise<boolean> {
  try {
    await apiRequest("GET", "/api/creator-profile");
    return true;
  } catch (error) {
    return false;
  }
}

async function checkVenueProfile(): Promise<boolean> {
  try {
    await apiRequest("GET", "/api/venue-profile");
    return true;
  } catch (error) {
    return false;
  }
}

async function checkServiceProviderProfile(): Promise<boolean> {
  try {
    await apiRequest("GET", "/api/service-provider-profile");
    return true;
  } catch (error) {
    return false;
  }
}

export function useRoleSwitch() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const roleSwitchMutation = useMutation({
    mutationFn: async (newRole: UserRole): Promise<RoleSwitchResponse> => {
      const response = await apiRequest("POST", "/api/auth/assign-role", { role: newRole });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess: async (data, newRole) => {
      try {
        // Update both caches immediately, then verify against the database-backed
        // auth endpoint. AuthContext is the source read by navigation and guards.
        queryClient.setQueryData(["/api/auth/user"], data.user);
        try {
          const updatedUser = await refreshUser();
          if (updatedUser?.role !== newRole) {
            throw new Error("Role update not reflected in session");
          }
        } catch (sessionError) {
          console.error("Session persistence check failed:", sessionError);
          throw new Error("Session sync failed");
        }
        
        // Show success message
        toast({
          title: "Role Updated", 
          description: `Switched to ${newRole.replace('_', ' ')} successfully`,
        });

        // Profile validation and routing logic with fallback handling
        let destinationRoute = "/";
        let needsProfileSetup = false;

        switch (newRole) {
          case 'participant':
            destinationRoute = "/user-dashboard";
            break;
            
          case 'creator':
            const hasCreatorProfile = await checkCreatorProfile();
            if (hasCreatorProfile) {
              destinationRoute = "/creator-dashboard";
            } else {
              destinationRoute = "/conversational-profile?type=creator";
              needsProfileSetup = true;
            }
            break;
            
          case 'venue_provider':
            const hasVenueProfile = await checkVenueProfile();
            if (hasVenueProfile) {
              destinationRoute = "/venue-dashboard";
            } else {
              destinationRoute = "/conversational-profile?type=venue_provider";
              needsProfileSetup = true;
            }
            break;
            
          case 'service_provider':
            const hasServiceProfile = await checkServiceProviderProfile();
            if (hasServiceProfile) {
              destinationRoute = "/service-provider-dashboard";
            } else {
              destinationRoute = "/conversational-profile?type=service_provider";
              needsProfileSetup = true;
            }
            break;
            
          case 'admin':
            destinationRoute = "/admin";
            break;
            
          case 'promoter':
            // Promoter dashboard placeholder
            destinationRoute = "/promoter";
            break;
            
          default:
            destinationRoute = "/user-dashboard";
        }

        // Additional notification for profile setup
        if (needsProfileSetup) {
          setTimeout(() => {
            toast({
              title: "Profile Setup Required",
              description: `Let's create your ${newRole.replace('_', ' ')} profile to get started`,
            });
          }, 1500);
        }

        // Navigate to appropriate destination
        setTimeout(() => {
          navigate(destinationRoute);
          setIsTransitioning(false);
          setRetryCount(0); // Reset retry count on success
        }, 1000);

      } catch (error) {
        // Profile check failed - provide fallback with retry
        console.error('Role switch profile check failed:', error);
        setIsTransitioning(false);
        toast({
          title: "Profile Check Failed",
          description: "Unable to verify your profile. Redirecting to dashboard...",
          variant: "destructive",
        });
        
        // Fallback to basic dashboard routing - no dead ends
        const basicRoutes: Record<UserRole, string> = {
          participant: "/user-dashboard",
          creator: "/creator-dashboard", 
          venue_provider: "/venue-dashboard",
          service_provider: "/service-provider-dashboard",
          admin: "/admin",
          promoter: "/promoter"
        };
        
        setTimeout(() => {
          navigate(basicRoutes[newRole] || "/user-dashboard");
        }, 2000);
      }
    },
    onError: (error: any) => {
      console.error('Role switch mutation error:', error);
      setIsTransitioning(false);
      setRetryCount(prev => prev + 1);
      
      // Enhanced error messages with retry logic
      let errorMessage = "Failed to update role. Please try again.";
      let showRetryButton = true;
      
      if (retryCount >= 2) {
        errorMessage = "Multiple attempts failed. Redirecting to homepage...";
        showRetryButton = false;
        
        // Fallback to homepage after max retries
        setTimeout(() => {
          navigate("/");
        }, 2000);
      } else if (error.message?.includes('401')) {
        errorMessage = "Session expired. Please log in again.";
        showRetryButton = false;
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 3000);
      } else if (error.message?.includes('403')) {
        errorMessage = "Role change not permitted. Contact support if this continues.";
        showRetryButton = false;
      } else if (error.message?.includes('network') || error.message?.includes('Network')) {
        errorMessage = "Network error. Please check your connection and retry.";
      }

      toast({
        title: "Role Switch Failed",
        description: errorMessage,
        variant: "destructive",
      });

      // Reset retry count after max attempts
      if (!showRetryButton) {
        setRetryCount(0);
      }
    }
  });

  const switchRole = (newRole: UserRole) => {
    if (isTransitioning) return; // Prevent double-clicks
    
    setIsTransitioning(true);
    roleSwitchMutation.mutate(newRole);
  };

  const retryRoleSwitch = (newRole: UserRole) => {
    if (retryCount < 3) {
      toast({
        title: "Retrying Role Switch",
        description: `Attempt ${retryCount + 1} of 3...`,
      });
      switchRole(newRole);
    } else {
      toast({
        title: "Max Retries Reached",
        description: "Redirecting to homepage. Please try again later.",
        variant: "destructive",
      });
      
      // Fallback to homepage after max retries
      setTimeout(() => {
        navigate("/");
        setRetryCount(0);
      }, 2000);
    }
  };

  return {
    switchRole,
    retryRoleSwitch,
    isLoading: roleSwitchMutation.isPending || isTransitioning,
    error: roleSwitchMutation.error,
    isTransitioning,
    retryCount,
    canRetry: retryCount < 3 && !isTransitioning
  };
}

// Convenience hooks for common role switches
export function useGuestToCreatorSwitch() {
  const { switchRole, ...rest } = useRoleSwitch();
  
  const switchToCreator = () => switchRole('creator');
  const switchToGuest = () => switchRole('participant');
  
  return {
    switchToCreator,
    switchToGuest,
    switchRole,
    ...rest
  };
}
