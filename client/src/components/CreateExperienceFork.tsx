import { useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import PostCollabIdeaModal from "@/components/PostCollabIdeaModal";
import { Hammer, Lightbulb } from "lucide-react";

/**
 * "Create experience" — the one first step.
 *
 * The Collab Idea modal and the Event Builder were reached through separate,
 * disconnected entry points: the top nav, Creator Home's "+ New", a dashboard
 * button, Venue Home's equivalent. Nothing established what the person was
 * trying to do before dropping them into one flow or the other — so an
 * organiser with a rough idea landed in an eleven-step builder asking for a
 * title and a cover photo, and gave up.
 *
 * Two doors, and only two:
 *
 *  - **I have an idea** → the existing Post a Collab Idea modal, unchanged
 *    beyond what its own spec adds. Not a new flow.
 *  - **I'm ready to build** → the existing Day Event / Multi-Day split page,
 *    also unchanged.
 *
 * This component is routing and nothing else. Every other entry point opens it
 * rather than jumping past it, which is the only way the fork is worth having.
 */
export default function CreateExperienceFork({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [ideaOpen, setIdeaOpen] = useState(false);

  const chooseIdea = () => {
    onOpenChange(false);
    setIdeaOpen(true);
  };

  const chooseBuild = () => {
    onOpenChange(false);
    navigate("/event-builder");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Two cards and a sentence, and it was still cramped: at
            `sm:max-w-lg` the choice that decides which of two flows somebody
            enters looked like a confirmation prompt. Generous, and a full
            sheet on a phone — but still an overlay, not a page. Point 28a. */}
        <DialogContent className="w-full max-w-none rounded-none p-6 sm:max-w-2xl sm:rounded-lg sm:p-10">
          <DialogHeader>
            <DialogTitle className="text-2xl">Create an experience</DialogTitle>
            <DialogDescription className="text-base">
              Two ways in, depending on how far along you are.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={chooseIdea}
              className="rounded-2xl border p-6 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50/40"
              data-testid="button-fork-have-idea"
            >
              <Lightbulb className="mb-3 h-7 w-7 text-amber-500" />
              <p className="text-base font-semibold text-gray-900 dark:text-white">
                I have an idea
              </p>
              <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                Post it to the collab board, or invite specific partners to join.
              </p>
            </button>

            <button
              type="button"
              onClick={chooseBuild}
              className="rounded-2xl border-2 border-indigo-500 bg-indigo-50/40 p-6 text-left transition-colors hover:bg-indigo-50/70 dark:bg-indigo-950/30"
              data-testid="button-fork-ready-to-build"
            >
              <Hammer className="mb-3 h-7 w-7 text-indigo-600" />
              <p className="text-base font-semibold text-gray-900 dark:text-white">
                I'm ready to build
              </p>
              <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                I already know which partners I'm working with.
              </p>
            </button>
          </div>

          <p className="text-sm text-gray-500">
            An idea can become an event later, carrying over what you've already
            answered — you're not choosing once and for all.
          </p>
        </DialogContent>
      </Dialog>

      <PostCollabIdeaModal open={ideaOpen} onOpenChange={setIdeaOpen} />
    </>
  );
}
