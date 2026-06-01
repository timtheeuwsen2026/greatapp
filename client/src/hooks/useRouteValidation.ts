import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface RouteValidationResult {
  isValid: boolean;
  isLoading: boolean;
  error?: string;
}

export function useRouteValidation(route: string): RouteValidationResult {
  const [isValid, setIsValid] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let isMounted = true;

    const validateRoute = async () => {
      setIsLoading(true);
      setError(undefined);

      try {
        const response = await fetch(route, {
          method: 'HEAD',
          cache: 'no-cache'
        });

        if (isMounted) {
          if (response.ok) {
            setIsValid(true);
          } else {
            setIsValid(false);
            setError(`Route returned ${response.status}: ${response.statusText}`);
          }
        }
      } catch (err) {
        if (isMounted) {
          setIsValid(false);
          setError(err instanceof Error ? err.message : 'Route validation failed');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    if (route) {
      validateRoute();
    }

    return () => {
      isMounted = false;
    };
  }, [route]);

  return { isValid, isLoading, error };
}

export function useSafeNavigation() {
  const [, setLocation] = useLocation();

  const safeNavigate = async (route: string, fallbackRoute: string = "/creator-dashboard") => {
    try {
      // For client-side routing, attempt navigation directly with error recovery
      setLocation(route);
      
      // Wait a small delay to check if navigation was successful
      setTimeout(() => {
        // If we're still here and there's an error in console, fall back
        const hasNavigationError = window.location.pathname === window.location.pathname && 
                                  window.location.pathname !== route.split('?')[0];
        
        if (hasNavigationError && route !== fallbackRoute) {
          console.warn(`Route ${route} may not be available, providing fallback to ${fallbackRoute}`);
          // Only fallback if the current route doesn't match the intended route
          if (!window.location.pathname.includes(route.split('?')[0])) {
            setLocation(fallbackRoute);
          }
        }
      }, 100);
    } catch (error) {
      console.error(`Failed to navigate to ${route}:`, error);
      setLocation(fallbackRoute);
    }
  };

  return { safeNavigate };
}