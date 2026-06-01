import { useEffect, useState } from "react";
import { Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CountdownTimerProps {
  deadline: string;
  daysRemaining?: number;
  hoursRemaining?: number;
  deadlinePassed?: boolean;
  showIcon?: boolean;
  variant?: "default" | "urgent" | "badge";
  className?: string;
}

export function CountdownTimer({
  deadline,
  daysRemaining: initialDays,
  hoursRemaining: initialHours,
  deadlinePassed: initialDeadlinePassed = false,
  showIcon = true,
  variant = "default",
  className = ""
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: initialDays ?? 0,
    hours: initialHours ?? 0,
    deadlinePassed: initialDeadlinePassed
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline).getTime();
      const difference = deadlineTime - now;

      if (difference <= 0) {
        return { days: 0, hours: 0, deadlinePassed: true };
      }

      const days = Math.ceil(difference / (1000 * 60 * 60 * 24));
      const hours = Math.ceil(difference / (1000 * 60 * 60));

      return { days, hours, deadlinePassed: false };
    };

    setTimeLeft(calculateTimeLeft());

    // Update every minute
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 60000);

    return () => clearInterval(interval);
  }, [deadline]);

  const getUrgencyColor = () => {
    if (timeLeft.deadlinePassed) return "text-gray-500 dark:text-gray-400";
    if (timeLeft.days <= 1) return "text-destructive";
    if (timeLeft.days <= 3) return "text-warning dark:text-yellow-400";
    return "text-gray-700 dark:text-gray-300";
  };

  const getTimeDisplay = () => {
    if (timeLeft.deadlinePassed) {
      return "Deadline passed";
    }
    if (timeLeft.days === 0) {
      return `${timeLeft.hours}h left`;
    }
    if (timeLeft.days === 1) {
      return "1 day left";
    }
    return `${timeLeft.days} days left`;
  };

  if (variant === "badge") {
    return (
      <Badge 
        variant={timeLeft.deadlinePassed ? "secondary" : timeLeft.days <= 2 ? "destructive" : "default"}
        className={className}
        aria-label={`Time remaining: ${getTimeDisplay()}`}
      >
        {showIcon && <Clock className="h-3 w-3 mr-1" aria-hidden="true" />}
        {getTimeDisplay()}
      </Badge>
    );
  }

  return (
    <div 
      className={`flex items-center gap-1.5 ${getUrgencyColor()} ${className}`}
      role="timer"
      aria-live="polite"
      aria-label={`Time remaining: ${getTimeDisplay()}`}
    >
      {showIcon && (
        timeLeft.days <= 2 && !timeLeft.deadlinePassed ? (
          <AlertCircle className="h-4 w-4 animate-pulse" aria-hidden="true" />
        ) : (
          <Clock className="h-4 w-4" aria-hidden="true" />
        )
      )}
      <span className={variant === "urgent" ? "font-semibold" : "font-medium"}>
        {getTimeDisplay()}
      </span>
    </div>
  );
}
