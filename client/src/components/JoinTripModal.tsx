import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Users, Target, CreditCard, Sparkles } from "lucide-react";
import { FundingProgressBar } from "@/components/funding/FundingProgressBar";
import { normalizeImageUrl } from "@/lib/utils";
import { formatMvgParticipantCount } from "@/lib/participantCounts";

interface JoinTripModalProps {
  open: boolean;
  onClose: () => void;
  trip: {
    id: string;
    title: string;
    location: string;
    coverImageUrl?: string | null;
    unlockPrice: number;
    mvgGoal: number;
    amountFunded: number;
    mvgRemaining: number;
    fundingPercentage: number;
    currentParticipants: number;
    minimumParticipants: number;
    isEarlyFounder: boolean;
    currency?: string;
    lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
  };
  onConfirm: () => void | Promise<void>;
}

// Helper to format currency with proper symbol
// DATA CONTRACT: Currency must come from experience.currency - never default to USD
function formatCurrency(amount: number, currency?: string): string {
  if (!currency) {
    console.warn('[DataContract] Currency missing - using experience.currency is required');
  }
  const currencyCode = (currency || 'EUR').toUpperCase(); // Default EUR for existing data
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
  };
  const symbol = symbols[currencyCode] || currencyCode + ' ';
  return `${symbol}${amount.toLocaleString()}`;
}

export function JoinTripModal({ open, onClose, trip, onConfirm }: JoinTripModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const isMvgMet = trip.lifecycleStatus
    ? trip.lifecycleStatus === 'confirmed'
    : trip.currentParticipants >= trip.minimumParticipants;

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error("Payment error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Join This Adventure</DialogTitle>
          <DialogDescription className="text-base">
            {trip.title} • {trip.location}
          </DialogDescription>
        </DialogHeader>

        {trip.coverImageUrl && (
          <div className="w-full h-48 rounded-lg overflow-hidden">
            <img 
              src={normalizeImageUrl(trip.coverImageUrl) || ''} 
              alt={trip.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="space-y-6 py-4">
          {/* Unlock Price Display */}
          <div className="p-6 bg-primary/5 dark:bg-primary/10 rounded-lg border-2 border-primary/20">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Unlock: {formatCurrency(trip.unlockPrice, trip.currency)}
              </div>
              {trip.isEarlyFounder && (
                <Badge className="bg-primary text-white font-bold">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Early Founder
                </Badge>
              )}
            </div>
            <div className="text-2xl font-bold text-primary mb-2">
              {(trip.minimumParticipants - trip.currentParticipants) === 1
                ? '🔥 Just 1 more traveler to make this real!'
                : (trip.minimumParticipants - trip.currentParticipants) <= 3 && (trip.minimumParticipants - trip.currentParticipants) > 0
                ? `🔥 Just ${trip.minimumParticipants - trip.currentParticipants} more travelers to make this real!`
                : (trip.minimumParticipants - trip.currentParticipants) <= 6 && (trip.minimumParticipants - trip.currentParticipants) > 0
                ? `⚡ ${trip.minimumParticipants - trip.currentParticipants} more travelers needed to confirm this trip!`
                : (trip.minimumParticipants - trip.currentParticipants) > 0
                ? `👥 ${trip.minimumParticipants - trip.currentParticipants} more travelers needed to make this happen!`
                : '✅ Group confirmed!'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              One-time prepayment • Reserve your spot now
            </div>
          </div>

          {/* What You're Reserving */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
              What you're reserving:
            </h4>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {trip.isEarlyFounder ? "Early Founder" : "Confirmed"} seat on this adventure
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Full refund if MVG target isn't met
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Access to pre-trip community chat
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Join the founding group shaping this experience
                </span>
              </li>
            </ul>
          </div>

          {/* MVG Target Status */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              <h4 className="font-semibold text-gray-900 dark:text-white">
                MVG Target Status
              </h4>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  <Users className="h-4 w-4 inline mr-1" />
                  {formatMvgParticipantCount(
                    trip.currentParticipants,
                    trip.minimumParticipants,
                    isMvgMet,
                  )}
                </span>
              </div>
              
              <FundingProgressBar
                currentParticipants={trip.currentParticipants}
                minimumParticipants={trip.minimumParticipants}
                fundingPercentage={trip.fundingPercentage}
                amountFunded={trip.amountFunded}
                fundingGoal={trip.mvgGoal}
                participantsNeeded={trip.minimumParticipants - trip.currentParticipants}
                size="md"
                lifecycleStatus={trip.lifecycleStatus}
              />
              
              <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-700 dark:text-gray-300 font-semibold uppercase tracking-wide text-xs">
                  MVG {formatCurrency(trip.mvgGoal, trip.currency)}
                </span>
                <span className="font-bold text-primary dark:text-primary/80 text-base">
                  {formatCurrency(trip.mvgRemaining, trip.currency)} remaining
                </span>
              </div>
            </div>
          </div>

          {/* Payment Info Notice */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <CreditCard className="h-3 w-3 inline mr-1" />
              Secure payment via Stripe • Sandbox mode for testing
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1"
            data-testid="modal-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold text-base"
            data-testid="modal-confirm-deposit"
          >
            {isProcessing ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                {trip.isEarlyFounder ? 'Unlock Early Price' : 'Reserve Seat'} — ${trip.unlockPrice.toLocaleString()}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
