import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, User, Crown, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRoleSwitch, type UserRole } from "@/hooks/useRoleSwitch";
import { useToast } from "@/hooks/use-toast";

interface GuestCreatorToggleProps {
  variant?: 'toggle' | 'card';
  showDescription?: boolean;
}

export default function GuestCreatorToggle({ 
  variant = 'toggle',
  showDescription = true 
}: GuestCreatorToggleProps) {
  const { user } = useAuth();
  const { switchRole, retryRoleSwitch, isLoading, error, isTransitioning, retryCount, canRetry } = useRoleSwitch();
  const { toast } = useToast();
  const [sessionTestPassed, setSessionTestPassed] = useState<boolean | null>(null);

  if (!user) return null;

  const currentRole = user.role as UserRole;
  const isCreator = currentRole === 'creator';
  const isParticipant = currentRole === 'participant';

  // Test session persistence after role change
  useEffect(() => {
    if (!isLoading && !isTransitioning) {
      // Test session persistence
      fetch('/api/auth/user', { credentials: 'include' })
        .then(response => {
          if (response.ok) {
            setSessionTestPassed(true);
          } else {
            setSessionTestPassed(false);
          }
        })
        .catch(() => setSessionTestPassed(false));
    }
  }, [user?.role, isLoading, isTransitioning]);

  const handleRoleSwitch = (targetRole: 'creator' | 'participant') => {
    if (isTransitioning || isLoading) return;
    
    // Show confirmation for role switch
    toast({
      title: "Switching Role",
      description: `Switching to ${targetRole === 'creator' ? 'Creator' : 'Guest'}...`,
    });

    switchRole(targetRole);
  };

  const handleRetry = () => {
    if (canRetry && user) {
      const targetRole = isCreator ? 'participant' : 'creator';
      retryRoleSwitch(targetRole);
    }
  };

  // Toggle variant for simple switching
  if (variant === 'toggle') {
    return (
      <div className="space-y-4" data-testid="guest-creator-toggle">
        {/* Main Toggle */}
        <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <User className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium">Guest</span>
            <Switch
              checked={isCreator}
              onCheckedChange={() => handleRoleSwitch(isCreator ? 'participant' : 'creator')}
              disabled={isLoading || isTransitioning || (!isParticipant && !isCreator)}
              data-testid="role-switch"
            />
            <span className="text-sm font-medium">Creator</span>
            <Crown className="h-5 w-5 text-purple-600" />
          </div>
          
          {(isLoading || isTransitioning) && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
        </div>

        {/* Status Display */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <span>Current:</span>
            <Badge variant={isCreator ? "default" : "secondary"}>
              {isCreator ? "Creator" : "Guest"}
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2">
            <span>Session:</span>
            <Badge variant={sessionTestPassed === true ? "default" : sessionTestPassed === false ? "destructive" : "secondary"}>
              {sessionTestPassed === true ? "✓ Active" : sessionTestPassed === false ? "✗ Failed" : "Testing..."}
            </Badge>
          </div>
        </div>

        {/* Error Handling */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-800 dark:text-red-200">
                  Role switch failed (Attempt {retryCount + 1}/3)
                </span>
              </div>
              
              {canRetry && (
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
            </div>
          </div>
        )}
      </div>
    );
  }

  // Card variant with detailed information
  return (
    <Card className="w-full max-w-md" data-testid="guest-creator-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Role Switcher</span>
          <Badge variant={sessionTestPassed === true ? "default" : sessionTestPassed === false ? "destructive" : "secondary"}>
            Session: {sessionTestPassed === true ? "Active" : sessionTestPassed === false ? "Failed" : "Testing"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Switch between Guest and Creator roles without logout
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center space-x-4">
          <Button
            variant={isParticipant ? "default" : "outline"}
            size="sm"
            onClick={() => handleRoleSwitch('participant')}
            disabled={isParticipant || isLoading || isTransitioning}
            data-testid="switch-to-guest"
          >
            <User className="h-4 w-4 mr-2" />
            Guest
          </Button>
          
          <Button
            variant={isCreator ? "default" : "outline"}
            size="sm"
            onClick={() => handleRoleSwitch('creator')}
            disabled={isCreator || isLoading || isTransitioning}
            data-testid="switch-to-creator"
          >
            <Crown className="h-4 w-4 mr-2" />
            Creator
          </Button>
        </div>

        {showDescription && (
          <div className="text-sm text-gray-600 dark:text-gray-300 text-center">
            {isCreator ? "Create and host experiences" : "Discover and join experiences"}
          </div>
        )}

        {/* Dashboard Preview */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-xs font-medium mb-1">Dashboard Route:</div>
          <div className="text-xs font-mono">
            {isCreator ? "/creator-dashboard" : "/user-dashboard"}
          </div>
        </div>

        {/* Loading State */}
        {(isLoading || isTransitioning) && (
          <div className="flex items-center justify-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {isTransitioning ? 'Redirecting to dashboard...' : 'Updating role...'}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-red-800 dark:text-red-200">
                Switch Failed (Attempt {retryCount + 1}/3)
              </span>
            </div>
            
            {canRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={isTransitioning}
                className="w-full"
                data-testid="retry-role-switch"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Role Switch
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}