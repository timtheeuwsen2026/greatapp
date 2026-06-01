import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export type UserRole = 'participant' | 'creator' | 'venue_provider' | 'service_provider' | 'admin';

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
  const queryClient = useQueryClient();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const roleSwitchMutation = useMutation({
    mutationFn: async (newRole: UserRole): Promise<RoleSwitchResponse> => {
      return apiRequest("POST", "/api/auth/assign-role", { role: newRole });
    },
    onSuccess: (data, newRole) => {
      // Invalidate auth cache to trigger re-fetch with new role
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      // Show success message
      toast({
        title: "Role Updated",
        description: `Switched to ${newRole.replace('_', ' ')} successfully`,
      });

      // Navigate to appropriate dashboard based on role
      const dashboardRoutes = {
        participant: "/user-dashboard",
        creator: "/creator-dashboard", 
        venue_provider: "/venue-dashboard",
        service_provider: "/service-provider-dashboard",
        admin: "/admin"
      };

      // Smooth transition to new dashboard
      setTimeout(() => {
        navigate(dashboardRoutes[newRole]);
        setIsTransitioning(false);
      }, 1000);
    },
    onError: (error) => {
      setIsTransitioning(false);
      toast({
        title: "Role Switch Failed",
        description: error.message || "Unable to switch roles. Please try again.",
        variant: "destructive",
      });
    }
  });

  const switchRole = (newRole: UserRole) => {
    setIsTransitioning(true);
    roleSwitchMutation.mutate(newRole);
  };

  return {
    switchRole,
    isLoading: roleSwitchMutation.isPending,
    isTransitioning,
    error: roleSwitchMutation.error
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