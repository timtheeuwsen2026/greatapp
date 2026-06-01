import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useState } from "react";
import { Loader2 } from "lucide-react";

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

  const handleClick = async () => {
    setIsLoading(true);
    
    // Small delay to show loading state
    setTimeout(() => {
      switch (action) {
        case 'join_community':
          setLocation('/profile-setup');
          break;
        case 'create_experience':
          console.log("Simple button - navigating to creator dashboard");
          setLocation('/creator-dashboard');
          break;
        case 'book_experience':
          setLocation('/profile-setup');
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