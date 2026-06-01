import { ReactNode } from 'react';
import { useRoleAuth, UserRole } from '@/hooks/useRoleAuth';
import AccessDenied from './AccessDenied';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole: UserRole;
  fallback?: ReactNode;
}

export default function ProtectedRoute({ 
  children, 
  requiredRole, 
  fallback 
}: ProtectedRouteProps) {
  const { isLoading, isAuthorized, isAuthenticated } = useRoleAuth(requiredRole);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show access denied if not authorized
  if (!isAuthorized) {
    return fallback || (
      <AccessDenied 
        requiredRole={requiredRole}
        isAuthenticated={isAuthenticated}
      />
    );
  }

  // Render protected content
  return <>{children}</>;
}