import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useSafeNavigation } from "@/hooks/useRouteValidation";
import { Loader2, AlertTriangle } from "lucide-react";

interface SafeCreatorButtonProps {
  route: string;
  fallbackRoute?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  testId?: string;
  disabled?: boolean;
}

export default function SafeCreatorButton({
  route,
  fallbackRoute = "/creator-dashboard",
  children,
  className,
  variant = "default",
  size = "default",
  testId,
  disabled = false,
  ...props
}: SafeCreatorButtonProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { safeNavigate } = useSafeNavigation();

  const handleSafeClick = async () => {
    if (isNavigating) return; // Prevent double-clicks
    
    setIsNavigating(true);
    setError(null);
    
    try {
      await safeNavigate(route, fallbackRoute);
      
      // Reset loading state after successful navigation
      setTimeout(() => {
        setIsNavigating(false);
      }, 200);
    } catch (err) {
      setError("Navigation failed - Click to retry");
      setIsNavigating(false);
      console.error("Safe navigation error:", err);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleSafeClick}
      disabled={disabled || isNavigating}
      data-testid={testId}
      {...props}
    >
      {isNavigating ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Loading...
        </>
      ) : error ? (
        <>
          <AlertTriangle className="w-4 h-4 mr-2" />
          Try Again
        </>
      ) : (
        children
      )}
    </Button>
  );
}