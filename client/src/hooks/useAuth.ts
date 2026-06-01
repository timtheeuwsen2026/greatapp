import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error, isError } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: (failureCount, error) => {
      // Don't retry on 401 (unauthorized) - user needs to login
      if (error instanceof Error && error.message.includes('401')) {
        return false;
      }
      // Retry up to 2 times for network errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  // Log auth errors for debugging
  if (isError && error) {
    console.error('Authentication error:', error);
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error: error instanceof Error ? error : null,
    isError,
  };
}