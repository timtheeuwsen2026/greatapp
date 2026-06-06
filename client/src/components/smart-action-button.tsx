import { Button } from "@/components/ui/button";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useLocation } from "wouter";

interface SmartActionButtonProps {
  action: 'join_community' | 'create_experience' | 'book_experience';
  experienceId?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
}

export default function SmartActionButton({ 
  action, 
  experienceId, 
  children, 
  className,
  size = "default",
  variant = "default"
}: SmartActionButtonProps) {
  const { isAuthenticated, hasParticipantProfile, profileType } = useUserProfile();
  const [, setLocation] = useLocation();

  const handleClick = () => {
    // Not logged in - go to login (external auth redirect - keep window.location)
    if (!isAuthenticated) {
      console.log("User not authenticated, redirecting to login");
      window.location.href = '/api/login';
      return;
    }

    if (action === 'join_community' && !hasParticipantProfile) {
      sessionStorage.setItem('postParticipantOnboardingRedirect', '/community-hub');
      setLocation('/participant-profile-setup');
      return;
    }

    switch (action) {
      case 'join_community':
        setLocation('/community-hub');
        break;
      case 'create_experience':
        console.log("Navigating to create experience, profile type:", profileType);
        // All create intents go to creator dashboard for profile gating
        console.log("Routing to creator dashboard for profile gating");
        setLocation('/creator-dashboard');
        break;
      case 'book_experience':
        if (experienceId) {
          setLocation(`/checkout/${experienceId}`);
        }
        break;
    }
  };

  return (
    <Button 
      onClick={handleClick}
      className={className}
      size={size}
      variant={variant}
    >
      {children}
    </Button>
  );
}
