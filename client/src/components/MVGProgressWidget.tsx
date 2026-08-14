import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Clock, CheckCircle, AlertCircle, Shield, Zap } from "lucide-react";
import { MVGProgressData } from "@shared/schema";
import { formatMvgParticipantCount } from "@/lib/participantCounts";

interface MVGProgressWidgetProps {
  experienceId: string;
  className?: string;
  showTitle?: boolean;
  isFreeExperience?: boolean;
  refreshInterval?: number; // in milliseconds, default 30 seconds
}


export default function MVGProgressWidget({ 
  experienceId, 
  className = "",
  showTitle = true,
  isFreeExperience = false,
  refreshInterval = 30000 
}: MVGProgressWidgetProps) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const { data: mvgProgress, isLoading, error } = useQuery<MVGProgressData>({
    queryKey: ["/api/experiences", experienceId, "mvg-progress"],
    enabled: !!experienceId,
    refetchInterval: refreshInterval,
    refetchIntervalInBackground: true,
  });

  // Update last updated time whenever data changes
  useEffect(() => {
    if (mvgProgress) {
      setLastUpdated(new Date());
    }
  }, [mvgProgress]);

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-red-700 text-sm">Unable to load progress</span>
        </div>
      </div>
    );
  }

  if (isLoading || !mvgProgress) {
    return (
      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-2 bg-gray-200 rounded"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const { currentBookings, mvgMin, percentage, mvgDeadline, mvgStatus } = mvgProgress;
  // Single source of truth: use mvgStatus from backend, not a derived count comparison
  const isComplete = mvgStatus === "met";
  const remaining = Math.max(0, mvgMin - currentBookings);
  
  // Calculate time remaining until deadline
  const timeRemaining = mvgDeadline ? 
    Math.max(0, new Date(mvgDeadline).getTime() - new Date().getTime()) : 0;
  const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  // Determine widget color scheme based on status
  let colorScheme = {
    bg: "bg-amber-50",
    border: "border-amber-200", 
    text: "text-amber-900",
    textSecondary: "text-amber-800",
    textTertiary: "text-amber-700",
    icon: "text-amber-600"
  };

  if (isComplete) {
    colorScheme = {
      bg: "bg-green-50",
      border: "border-green-200",
      text: "text-green-900", 
      textSecondary: "text-green-800",
      textTertiary: "text-green-700",
      icon: "text-green-600"
    };
  } else if (mvgStatus === "failed") {
    colorScheme = {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-900",
      textSecondary: "text-red-800", 
      textTertiary: "text-red-700",
      icon: "text-red-600"
    };
  }

  return (
    <div className={`${colorScheme.bg} border ${colorScheme.border} rounded-lg p-4 space-y-3 ${className}`} data-testid="mvg-progress-widget">
      {showTitle && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className={`h-4 w-4 ${colorScheme.icon}`} />
            <span className={`font-medium ${colorScheme.text}`}>
              {isComplete ? "Group Size Achieved!" : "Minimum Group Progress"}
            </span>
          </div>
          {isComplete && (
            <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmed
            </Badge>
          )}
          {mvgStatus === "failed" && (
            <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
              <AlertCircle className="h-3 w-3 mr-1" />
              Not Met
            </Badge>
          )}
        </div>
      )}
      
      <div className="space-y-3">
        {/* Human gap text — primary metric for FORMING, dominant over all other text */}
        {!isComplete && mvgStatus !== "failed" && remaining > 0 && (
          <p className="text-lg font-black text-primary leading-tight" data-testid="mvg-human-gap-text">
            {remaining === 1
              ? "🔥 Just 1 more person to make this real!"
              : remaining <= 3
              ? `🔥 Just ${remaining} more people to make this real!`
              : remaining <= 6
              ? `⚡ ${remaining} more people needed to confirm this experience!`
              : `👥 ${remaining} more people needed to make this happen!`}
          </p>
        )}

        <div className="flex items-center text-sm">
          <span className={`${colorScheme.textSecondary} font-medium`} data-testid="mvg-progress-count">
            {formatMvgParticipantCount(currentBookings, mvgMin, isComplete)}
          </span>
        </div>
        
        <Progress 
          value={Math.min(percentage, 100)}
          className="h-3"
          data-testid="mvg-progress-bar"
        />
        
        <div className="flex justify-between items-center text-xs">
          <span className={colorScheme.textTertiary} data-testid="mvg-progress-remaining">
            {isComplete ? "Minimum reached!" : ""}
          </span>
          <span className={`flex items-center space-x-1 ${colorScheme.textTertiary}`}>
            <Clock className="h-3 w-3" />
            <span data-testid="mvg-progress-updated">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          </span>
        </div>

        {/* Time remaining and status information */}
        {mvgDeadline && !isFreeExperience && !isComplete && mvgStatus !== "failed" && (
          <Alert className="mt-3">
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Payment Protection:</strong> Your payment is held securely until we reach {mvgMin} participants.
              {daysRemaining > 0 && (
                <> Time remaining: <strong>{daysRemaining}d {hoursRemaining}h</strong></>
              )}
              {daysRemaining === 0 && hoursRemaining > 0 && (
                <> Time remaining: <strong>{hoursRemaining} hours</strong></>
              )}
            </AlertDescription>
          </Alert>
        )}

        {isComplete && (
          <Alert className="mt-3">
            <Zap className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Booking Confirmed!</strong> The minimum group size has been reached. {isFreeExperience
                ? "Your spot is secured."
                : "Your payment has been processed and your spot is secured."}
            </AlertDescription>
          </Alert>
        )}

        {mvgStatus === "failed" && (
          <Alert variant="destructive" className="mt-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Booking Cancelled:</strong> The minimum group size was not reached by the deadline. {!isFreeExperience && "Your payment has been refunded automatically."}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
