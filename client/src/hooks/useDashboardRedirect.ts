import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export type UserRole = 'participant' | 'creator' | 'venue_provider' | 'service_provider' | 'admin';

interface DashboardRoutes {
  [key: string]: string;
}

const dashboardRoutes: DashboardRoutes = {
  participant: "/user-dashboard",
  creator: "/creator-dashboard", 
  venue_provider: "/venue-dashboard",
  service_provider: "/service-provider-dashboard",
  admin: "/admin"
};

const roleDisplayNames: { [key: string]: string } = {
  participant: "Guest",
  creator: "Creator",
  venue_provider: "Venue Provider",
  service_provider: "Service Provider", 
  admin: "Administrator"
};

export function useDashboardRedirect() {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (isLoading || !user) return;

    const currentRole = user.role as UserRole;
    const correctDashboard = dashboardRoutes[currentRole];
    
    // Check if user is on a dashboard page
    const isDashboardPage = Object.values(dashboardRoutes).some(route => 
      location.startsWith(route)
    );

    // Check if user is on wrong dashboard
    const isOnWrongDashboard = isDashboardPage && location !== correctDashboard;

    if (isOnWrongDashboard) {
      toast({
        title: "Dashboard Updated",
        description: `Redirecting to ${roleDisplayNames[currentRole]} dashboard`,
      });

      // Smooth redirect to correct dashboard
      setTimeout(() => {
        navigate(correctDashboard);
      }, 1000);
    }
  }, [user?.role, location, navigate, toast, isLoading]);

  return {
    getCurrentDashboard: () => user?.role ? dashboardRoutes[user.role] : "/",
    getCorrectDashboard: (role: UserRole) => dashboardRoutes[role],
    isOnCorrectDashboard: () => {
      if (!user) return false;
      return location === dashboardRoutes[user.role];
    }
  };
}

// Hook for enforcing dashboard access based on role
export function useDashboardAccessControl(requiredRole: UserRole) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      // Not authenticated - redirect to login
      toast({
        title: "Authentication Required",
        description: "Please log in to access this dashboard",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1500);
      return;
    }

    const userRole = user.role as UserRole;
    
    // Allow admin access to all dashboards
    if (userRole === 'admin') return;
    
    // Check if user has correct role for this dashboard
    if (userRole !== requiredRole) {
      const correctDashboard = dashboardRoutes[userRole] || "/";
      const requiredRoleDisplay = roleDisplayNames[requiredRole];
      const userRoleDisplay = roleDisplayNames[userRole];

      toast({
        title: "Access Restricted",
        description: `${requiredRoleDisplay} dashboard requires ${requiredRoleDisplay.toLowerCase()} role. Redirecting to your ${userRoleDisplay} dashboard.`,
        variant: "destructive",
      });

      setTimeout(() => {
        navigate(correctDashboard);
      }, 2000);
    }
  }, [user, requiredRole, navigate, toast, isLoading]);

  return {
    isAuthorized: user?.role === requiredRole || user?.role === 'admin',
    isLoading,
    userRole: user?.role as UserRole
  };
}