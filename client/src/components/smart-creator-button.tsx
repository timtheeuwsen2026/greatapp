import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface SmartCreatorButtonProps {
  className?: string;
  size?: "sm" | "lg" | "default";
  children?: React.ReactNode;
  onMobileMenuClose?: () => void;
}

export default function SmartCreatorButton({ 
  className = "btn-gradient", 
  size = "default",
  children = "Start Creating",
  onMobileMenuClose
}: SmartCreatorButtonProps) {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    // Close mobile menu if callback provided
    onMobileMenuClose?.();
    
    // Navigate to /creator - the page will handle auth and loading states
    setLocation("/creator");
  };

  return (
    <Button 
      className={className} 
      size={size}
      onClick={handleClick}
      data-testid="button-start-creating"
    >
      {children}
    </Button>
  );
}