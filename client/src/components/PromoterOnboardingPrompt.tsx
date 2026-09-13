import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { Megaphone, Sparkles, Users } from "lucide-react";

/**
 * The promoter onboarding that did not exist.
 *
 * A creator finishing signup is walked into their profile and then into the
 * builder. A promoter was walked nowhere: the role was assigned, the dashboard
 * opened, and the Experience Pool sat there empty with no explanation, because
 * the server quietly returns nothing to a promoter with no completed profile.
 *
 * So this asks, once, on the first dashboard they land on. Dismissing it is
 * allowed — but the Pool stays shut until the profile is done, and the Pool
 * says so in its own words rather than pretending there is nothing on.
 */
export default function PromoterOnboardingPrompt({
  /** Milliseconds to let the dashboard render before asking. */
  delayMs = 900,
}: { delayMs?: number } = {}) {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const isPromoter = String((user as any)?.role || "") === "promoter";

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/promoter-profile"],
    enabled: isAuthenticated && isPromoter,
    retry: false,
  });

  const completed = (profile as any)?.completed === true;
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("promoter-onboarding-dismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!isPromoter || isLoading || completed || dismissed) return;
    const timer = setTimeout(() => setOpen(true), delayMs);
    return () => clearTimeout(timer);
  }, [isPromoter, isLoading, completed, dismissed, delayMs]);

  if (!isPromoter || completed) return null;

  const dismiss = () => {
    setOpen(false);
    setDismissed(true);
    try {
      sessionStorage.setItem("promoter-onboarding-dismissed", "1");
    } catch {
      // Storage can be disabled; it simply asks again next session.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-promoter-onboarding">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900">
            <Megaphone className="h-6 w-6 text-pink-600 dark:text-pink-400" />
          </div>
          <DialogTitle className="text-center">Set up your promoter profile</DialogTitle>
          <DialogDescription className="text-center">
            Two minutes, and it is what organisers look at before they let you promote
            an event.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-2 text-sm">
          <li className="flex gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
            <span>
              <strong className="block text-gray-900 dark:text-white">Opens the Experience Pool</strong>
              Every event currently looking for promoters, with the deal on offer.
            </span>
          </li>
          <li className="flex gap-3">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
            <span>
              <strong className="block text-gray-900 dark:text-white">Gets you matched</strong>
              Your city and what you promote decide which events reach you first.
            </span>
          </li>
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            className="sm:flex-1"
            onClick={() => setLocation("/promoter/profile-setup")}
            data-testid="button-promoter-onboarding-start"
          >
            Set it up now
          </Button>
          <Button
            variant="ghost"
            className="sm:flex-1"
            onClick={dismiss}
            data-testid="button-promoter-onboarding-later"
          >
            Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
