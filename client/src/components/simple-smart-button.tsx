import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";

interface SimpleSmartButtonProps {
  action: 'join_community' | 'create_experience' | 'book_experience';
  experienceId?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
}

export default function SimpleSmartButton({ 
  action, 
  experienceId, 
  children, 
  className,
  size = "default",
  variant = "default"
}: SimpleSmartButtonProps) {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, hasParticipantProfile } = useUserProfile();

  const handleClick = async () => {
    setIsLoading(true);
    
    // Small delay to show loading state
    setTimeout(() => {
      if (!isAuthenticated) {
        window.location.href = '/api/login';
        return;
      }

      switch (action) {
        case 'join_community':
          if (hasParticipantProfile) {
            setLocation('/community-hub');
          } else {
            sessionStorage.setItem('postParticipantOnboardingRedirect', '/community-hub');
            setLocation('/participant-profile-setup');
          }
          break;
        case 'create_experience':
          console.log("Simple button - navigating to creator dashboard");
          setLocation('/creator-dashboard');
          break;
        case 'book_experience':
          if (experienceId) {
            setLocation(`/checkout/${experienceId}`);
          }
          break;
      }
      setIsLoading(false);
    }, 300);
  };

  return (
    <Button 
      onClick={handleClick}
      className={className}
      size={size}
      variant={variant}
      disabled={isLoading}
      data-testid={`button-${action}`}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : (
        children
      )}
    </Button>
  );
}
