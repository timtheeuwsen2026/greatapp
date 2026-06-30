import { useAuth } from './useAuth';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

export type UserRole = 'participant' | 'creator' | 'venue_provider' | 'service_provider' | 'admin' | 'promoter';

export function useRoleAuth(requiredRole: UserRole) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const error = null as (Error & { message: string }) | null; // kept for backward compat
  const isError = false;
  const { toast } = useToast();

  const hasRequiredRole =
    user?.role === requiredRole ||
    user?.role === 'admin';
  const isAuthorized = isAuthenticated && hasRequiredRole;

  useEffect(() => {
    if (isError && error) {
      // Handle authentication errors
      console.error('Role auth error:', error);
      toast({
        title: "Authentication Error",
        description: error.message || "Unable to verify authentication. Please try again.",
        variant: "destructive",
      });
      
      // Only redirect to login if it's an authentication error (401)
      if (error.message?.includes('401')) {
        setTimeout(() => {
          console.log('Redirecting to login due to 401 error');
          window.location.href = "/api/login";
        }, 1500);
      }
    } else if (!isLoading && !isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please log in to access this page.",
        variant: "destructive",
      });
      setTimeout(() => {
        console.log('Redirecting to login - not authenticated');
        window.location.href = "/api/login";
      }, 1000);
    } else if (!isLoading && isAuthenticated && !hasRequiredRole) {
      toast({
        title: "Access Denied",
        description: `This page requires ${requiredRole.replace('_', ' ')} access.`,
        variant: "destructive",
      });
    }
  }, [isAuthenticated, isLoading, hasRequiredRole, requiredRole, toast, isError, error]);

  return {
    user,
    isAuthenticated,
    isLoading,
    hasRequiredRole,
    isAuthorized,
    userRole: user?.role,
    error,
    isError
  };
}

export function useCreatorAuth() {
  return useRoleAuth('creator');
}

export function useVenueAuth() {
  return useRoleAuth('venue_provider');
}

export function useServiceProviderAuth() {
  return useRoleAuth('service_provider');
}
