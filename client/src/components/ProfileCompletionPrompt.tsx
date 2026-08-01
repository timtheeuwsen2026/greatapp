import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sparkles, MessageCircle, Briefcase, X } from "lucide-react";

/**
 * Asks a brand-new buyer to finish their participant profile, without taking
 * the confirmation away from them.
 *
 * The first version of this flow redirected straight into onboarding, so buyers
 * never saw that their payment worked. The second put the invitation inline on
 * the confirmation page — safe, but easy to scroll past. This one keeps the
 * confirmation on screen and raises the ask on top of it a beat later, so the
 * booking registers first and the profile step cannot be missed. Dismissing it
 * leaves a bar pinned to the bottom of the page, so it is always one tap away.
 */

type ProfileCompletionPromptProps = {
  experienceId?: string | null;
  bookingId?: string | null;
  /** Where onboarding should return to. Defaults to the current page. */
  returnTo?: string;
  /** Milliseconds to let the confirmation land before asking. */
  delayMs?: number;
};

export function ProfileCompletionPrompt({
  experienceId,
  bookingId,
  returnTo,
  delayMs = 1500,
}: ProfileCompletionPromptProps) {
  // Keyed by booking so a second purchase asks again, but re-opening this page
  // (or a re-render) does not nag someone who already said "later".
  const dismissKey = `profile-prompt-dismissed:${bookingId || experienceId || "unknown"}`;
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(dismissKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    const timer = setTimeout(() => setOpen(true), delayMs);
    return () => clearTimeout(timer);
  }, [dismissed, delayMs]);

  const dismiss = () => {
    setOpen(false);
    setDismissed(true);
    try {
      sessionStorage.setItem(dismissKey, "1");
    } catch {
      // Storage can be disabled; the bar simply reappears on reload.
    }
  };

  const openSetup = () => {
    try {
      sessionStorage.setItem(
        "postParticipantOnboardingRedirect",
        returnTo || window.location.pathname + window.location.search,
      );
    } catch {
      // Onboarding falls back to its default landing page.
    }
    const params = new URLSearchParams({ afterCheckout: "true" });
    if (experienceId) params.set("experience", experienceId);
    if (bookingId) params.set("booking", bookingId);
    window.location.href = `/participant-profile-setup?${params.toString()}`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
        <DialogContent className="sm:max-w-md" data-testid="profile-prompt-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              One last step
            </DialogTitle>
            <DialogDescription>
              Your spot is confirmed. Complete your attendee profile so the organiser
              and the group know who's coming.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Unlocks the community hub and the group chat for this trip
            </li>
            <li className="flex items-start gap-2">
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Lets the organiser match you to roles and perks that fit your skills
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Takes about a minute — your share link stays right here
            </li>
          </ul>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="flex-1" onClick={openSetup} data-testid="profile-prompt-start">
              Complete my profile
            </Button>
            <Button variant="ghost" className="flex-1" onClick={dismiss} data-testid="profile-prompt-later">
              I'll do this later
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pinned after "later" so the step is always in reach while they scroll
          through the share kit. */}
      {dismissed && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/20 bg-white/95 backdrop-blur dark:bg-gray-900/95"
          data-testid="profile-prompt-bar"
        >
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
            <p className="flex-1 text-sm text-gray-700 dark:text-gray-200">
              <span className="font-semibold">Finish your attendee profile</span>
              <span className="hidden sm:inline"> — unlocks the community hub and group chat.</span>
            </p>
            <Button size="sm" onClick={openSetup} data-testid="profile-prompt-bar-start">
              Complete
            </Button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Hide this reminder"
              className="rounded p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default ProfileCompletionPrompt;
