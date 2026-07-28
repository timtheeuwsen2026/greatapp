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
      return;
    }

    if (!isLoading && !isAuthenticated) {
      // The session sync briefly reports "signed out" while it revalidates the
      // token — which happens on every window focus, including when a native
      // file picker closes. Without the cleanup below this timer still fired
      // after the session came back, bouncing a signed-in user to /login and
      // straight back again: the page looked like it was reloading itself.
      const timer = setTimeout(() => {
        toast({
          title: "Authentication Required",
          description: "Please log in to access this page.",
          variant: "destructive",
        });
        // Return them to this page after signing in rather than a dashboard.
        const returnTo = window.location.pathname + window.location.search;
        window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
      }, 2000);
      return () => clearTimeout(timer);
    }

    if (!isLoading && isAuthenticated && !hasRequiredRole) {
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
