import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Loader2, User, Crown, Building, Wrench, Shield, ChevronDown, Megaphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRoleSwitch, type UserRole } from "@/hooks/useRoleSwitch";

const roleConfig: Record<UserRole, { label: string; icon: any; color: string; description: string }> = {
  participant: {
    label: "Participant",
    icon: User,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    description: "Discover and join experiences"
  },
  creator: {
    label: "Creator", 
    icon: Crown,
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    description: "Create and host experiences"
  },
  venue_provider: {
    label: "Venue Provider",
    icon: Building,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300", 
    description: "Provide venues for experiences"
  },
  service_provider: {
    label: "Service Provider",
    icon: Wrench,
    color: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
    description: "Offer services and expertise"
  },
  admin: {
    label: "Administrator",
    icon: Shield,
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
    description: "Platform administration"
  },
  promoter: {
    label: "Promoter",
    icon: Megaphone,
    color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
    description: "Promote experiences and earn commissions"
  }
};

interface RoleSwitcherProps {
  variant?: 'dropdown' | 'card' | 'toggle';
  showDescription?: boolean;
  allowedRoles?: UserRole[];
}

export default function RoleSwitcher({ 
  variant = 'dropdown',
  showDescription = true,
  allowedRoles = ['participant', 'creator', 'venue_provider', 'service_provider', 'promoter']
}: RoleSwitcherProps) {
  const { user } = useAuth();
  const { switchRole, isLoading, isTransitioning } = useRoleSwitch();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const currentRole = user.role as UserRole;
  const currentConfig = roleConfig[currentRole];
  const CurrentIcon = currentConfig.icon;

  // Toggle variant for simple participant ↔ creator switching
  if (variant === 'toggle') {
    const isCreator = currentRole === 'creator';
    
    return (
      <div className="flex items-center space-x-3" data-testid="role-toggle">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Guest</span>
          <Switch
            checked={isCreator}
            onCheckedChange={() => switchRole(isCreator ? 'participant' : 'creator')}
            disabled={isLoading || isTransitioning}
            data-testid="role-switch"
          />
          <span className="text-sm font-medium">Creator</span>
        </div>
        {(isLoading || isTransitioning) && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
      </div>
    );
  }

  // Card variant for settings/profile pages
  if (variant === 'card') {
    return (
      <Card className="w-full max-w-md" data-testid="role-switcher-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CurrentIcon className="h-5 w-5" />
            <span>Current Role</span>
          </CardTitle>
          <CardDescription>
            Switch between different platform roles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Badge className={currentConfig.color}>
            {currentConfig.label}
          </Badge>
          
          {showDescription && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {currentConfig.description}
            </p>
          )}

          <div className="grid grid-cols-1 gap-2">
            {allowedRoles.filter(role => role !== currentRole).map((role) => {
              const config = roleConfig[role];
              const Icon = config.icon;
              
              return (
                <Button
                  key={role}
                  variant="outline"
                  className="justify-start"
                  onClick={() => switchRole(role)}
                  disabled={isLoading || isTransitioning}
                  data-testid={`switch-to-${role}`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  Switch to {config.label}
                </Button>
              );
            })}
          </div>

          {(isLoading || isTransitioning) && (
            <div className="flex items-center justify-center text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {isTransitioning ? 'Redirecting...' : 'Updating role...'}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Dropdown variant for navigation menu
  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-auto p-2"
          data-testid="role-switcher-dropdown"
        >
          <div className="flex items-center space-x-2">
            <Badge className={`${currentConfig.color} text-xs`}>
              <CurrentIcon className="h-3 w-3 mr-1" />
              {currentConfig.label}
            </Badge>
            <ChevronDown className="h-3 w-3" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm font-medium">Switch Role</div>
        <DropdownMenuSeparator />
        
        {allowedRoles.map((role) => {
          const config = roleConfig[role];
          const Icon = config.icon;
          const isCurrentRole = role === currentRole;
          
          return (
            <DropdownMenuItem
              key={role}
              onClick={() => !isCurrentRole && switchRole(role)}
              disabled={isCurrentRole || isLoading || isTransitioning}
              className={isCurrentRole ? "bg-gray-50 dark:bg-gray-800" : ""}
              data-testid={`dropdown-${role}`}
            >
              <Icon className="h-4 w-4 mr-2" />
              <div className="flex flex-col">
                <span className={isCurrentRole ? "font-medium" : ""}>
                  {config.label}
                  {isCurrentRole && " (Current)"}
                </span>
                {showDescription && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {config.description}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}

        {(isLoading || isTransitioning) && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-3 flex items-center justify-center text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {isTransitioning ? 'Redirecting...' : 'Updating...'}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}