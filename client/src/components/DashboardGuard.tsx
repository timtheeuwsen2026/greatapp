import { ReactNode } from "react";
import { useDashboardAccessControl } from "@/hooks/useDashboardRedirect";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Shield, AlertTriangle } from "lucide-react";

export type UserRole = 'participant' | 'creator' | 'venue_provider' | 'service_provider' | 'admin';

interface DashboardGuardProps {
  children: ReactNode;
  requiredRole: UserRole;
  fallback?: ReactNode;
}

export default function DashboardGuard({ 
  children, 
  requiredRole, 
  fallback 
}: DashboardGuardProps) {
  const { isAuthorized, isLoading, userRole } = useDashboardAccessControl(requiredRole);

  // Show loading state while checking permissions
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <h2 className="text-lg font-semibold mb-2">Verifying Access</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Checking dashboard permissions...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show access denied if not authorized and no fallback provided
  if (!isAuthorized && !fallback) {
    const roleDisplayNames = {
      participant: "Guest",
      creator: "Creator",
      venue_provider: "Venue Provider",
      service_provider: "Service Provider",
      admin: "Administrator"
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
              <Shield className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              Access Restricted
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              This dashboard requires <strong>{roleDisplayNames[requiredRole]}</strong> access.
            </p>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
              <div className="flex items-center">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mr-2" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Current role: <strong>{roleDisplayNames[userRole || 'participant']}</strong>
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Redirecting to your dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show fallback if provided and not authorized
  if (!isAuthorized && fallback) {
    return <>{fallback}</>;
  }

  // User is authorized, show dashboard content
  return <>{children}</>;
}