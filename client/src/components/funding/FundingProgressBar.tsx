import { Progress } from "@/components/ui/progress";
import { DollarSign, Users } from "lucide-react";

interface FundingProgressBarProps {
  currentParticipants: number;
  minimumParticipants: number;
  fundingPercentage: number;
  amountFunded?: number;
  fundingGoal?: number;
  depositAmount?: number;
  participantsNeeded?: number;
  showMoney?: boolean;
  showParticipants?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
}

export function FundingProgressBar({
  currentParticipants,
  minimumParticipants,
  fundingPercentage,
  amountFunded,
  fundingGoal,
  depositAmount,
  participantsNeeded,
  showMoney = true,
  showParticipants = true,
  size = "md",
  className = "",
  lifecycleStatus,
}: FundingProgressBarProps) {
  // Single source of truth: use lifecycleStatus from backend if available,
  // otherwise fall back to count comparison for legacy/non-MVG contexts
  const isMVGReached = lifecycleStatus ? lifecycleStatus === 'confirmed' : currentParticipants >= minimumParticipants;
  
  const sizeClasses = {
    sm: "h-1",
    md: "h-1.5",
    lg: "h-2"
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Progress Stats */}
      {(showParticipants || showMoney) && (
        <div className={`flex items-center justify-between ${textSizeClasses[size]} text-gray-600 dark:text-gray-400`}>
          {showParticipants && (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden="true" />
              <span>
                <strong className="text-gray-900 dark:text-white">{currentParticipants}</strong>
                {" / "}{minimumParticipants} participants
              </span>
            </div>
          )}
          
          {showMoney && amountFunded !== undefined && fundingGoal !== undefined && (
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" aria-hidden="true" />
              <span>
                <strong className="text-gray-900 dark:text-white">
                  ${amountFunded.toLocaleString()}
                </strong>
                {" / "}${fundingGoal.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="relative">
          <Progress 
            value={Math.min(fundingPercentage, 100)} 
            className={`${sizeClasses[size]} transition-all duration-500 ease-out ${isMVGReached ? '[&>div]:bg-green-500' : ''}`}
            aria-label={`Group progress: ${currentParticipants} of ${minimumParticipants} participants joined`}
            aria-valuenow={Math.min(fundingPercentage, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
          {/* Shimmer effect on progress bar */}
          {fundingPercentage > 0 && fundingPercentage < 100 && !isMVGReached && (
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer pointer-events-none rounded-full"
              style={{ 
                width: `${Math.min(fundingPercentage, 100)}%`,
                animation: 'shimmer 2s infinite'
              }}
            />
          )}
        </div>
        
        {/* Percentage and Status */}
        <div className={`flex items-center justify-between ${textSizeClasses[size]}`}>
          {isMVGReached ? (
            <span className="font-bold text-green-600 dark:text-green-500 transition-all duration-300 flex items-center gap-1" role="status" aria-live="polite">
              Community Confirmed ✅
            </span>
          ) : (
            <span className="font-semibold text-primary transition-all duration-300" role="status" aria-live="polite">
              {participantsNeeded === 1
                ? '🔥 Just 1 more traveler to make this real!'
                : participantsNeeded !== undefined && participantsNeeded > 0 && participantsNeeded <= 3
                ? `🔥 Just ${participantsNeeded} more travelers to make this real!`
                : participantsNeeded !== undefined && participantsNeeded > 0 && participantsNeeded <= 6
                ? `⚡ ${participantsNeeded} more travelers needed to confirm this trip!`
                : participantsNeeded !== undefined && participantsNeeded > 0
                ? `👥 ${participantsNeeded} more travelers needed to make this happen!`
                : 'Forming now'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
