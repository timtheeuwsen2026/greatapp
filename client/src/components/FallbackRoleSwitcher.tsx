import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRoleSwitch, type UserRole } from "@/hooks/useRoleSwitch";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface FallbackRoleSwitcherProps {
  variant?: "card" | "compact";
  showRetryButton?: boolean;
}

export default function FallbackRoleSwitcher({ 
  variant = "card",
  showRetryButton = true 
}: FallbackRoleSwitcherProps) {
  const { user } = useAuth();
  const { 
    switchRole, 
    retryRoleSwitch, 
    isLoading, 
    error, 
    isTransitioning,
    retryCount,
    canRetry 
  } = useRoleSwitch();

  if (!user) return null;

  const currentRole = user.role as UserRole;

  const roleDisplayNames = {
    participant: "Guest",
    creator: "Creator",
    venue_provider: "Venue Provider",
    service_provider: "Service Provider",
    admin: "Administrator"
  };

  const roleDescriptions = {
    participant: "Browse and join experiences",
    creator: "Create and host experiences",
    venue_provider: "Offer venues for experiences",
    service_provider: "Provide services for experiences",
    admin: "Platform administration"
  };

  const handleRoleSwitch = (newRole: UserRole) => {
    if (isTransitioning) return;
    switchRole(newRole);
  };

  const handleRetry = () => {
    if (canRetry && user) {
      retryRoleSwitch(user.role as UserRole);
    }
  };

  // Compact variant for navigation
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2">
        <Badge 
          variant={currentRole === 'creator' ? 'default' : 'secondary'}
          className="cursor-pointer"
        >
          {roleDisplayNames[currentRole]}
        </Badge>
        
        {error && showRetryButton && canRetry && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRetry}
            disabled={isTransitioning}
            data-testid="retry-role-switch"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        )}
        
        {isTransitioning && (
          <div className="flex items-center text-xs text-muted-foreground">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Switching...
          </div>
        )}
      </div>
    );
  }

  // Full card variant
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Current Role
          {isTransitioning ? (
            <Badge variant="outline" className="animate-pulse">
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Switching...
            </Badge>
          ) : (
            <Badge variant={currentRole === 'creator' ? 'default' : 'secondary'}>
              {roleDisplayNames[currentRole]}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {roleDescriptions[currentRole]}
        </p>

        {/* Error Handling */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Role switch failed. {retryCount > 0 && `(Attempt ${retryCount + 1}/3)`}</span>
              {showRetryButton && canRetry && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRetry}
                  disabled={isTransitioning}
                  data-testid="retry-role-switch"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Max Retries Reached */}
        {retryCount >= 3 && (
          <Alert>
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Maximum retry attempts reached. Please refresh the page or contact support if the issue persists.
            </AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {!error && !isTransitioning && retryCount === 0 && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Role active. You can switch to other roles using the buttons below.
            </AlertDescription>
          </Alert>
        )}

        {/* Role Switch Buttons */}
        <div className="grid gap-2">
          {currentRole !== 'participant' && (
            <Button
              variant="outline"
              onClick={() => handleRoleSwitch('participant')}
              disabled={isTransitioning}
              data-testid="switch-to-participant"
            >
              Switch to Guest
            </Button>
          )}
          
          {currentRole !== 'creator' && (
            <Button
              variant="outline"
              onClick={() => handleRoleSwitch('creator')}
              disabled={isTransitioning}
              data-testid="switch-to-creator"
            >
              Switch to Creator
            </Button>
          )}
          
          {currentRole !== 'venue_provider' && (
            <Button
              variant="outline"
              onClick={() => handleRoleSwitch('venue_provider')}
              disabled={isTransitioning}
              data-testid="switch-to-venue-provider"
            >
              Switch to Venue Provider
            </Button>
          )}
          
          {currentRole !== 'service_provider' && (
            <Button
              variant="outline"
              onClick={() => handleRoleSwitch('service_provider')}
              disabled={isTransitioning}
              data-testid="switch-to-service-provider"
            >
              Switch to Service Provider
            </Button>
          )}
        </div>

        {/* Fallback Information */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Profile setup required for new roles</p>
          <p>• Dashboard access updates automatically</p>
          <p>• No logout required for role changes</p>
        </div>
      </CardContent>
    </Card>
  );
}