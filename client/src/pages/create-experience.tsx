import { useSearch, useLocation } from "wouter";
import { ArrowRight, Hammer, Lightbulb } from "lucide-react";
import Navigation from "@/components/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import PartnerToolingGate, { usePartnerAccess } from "@/components/PartnerToolingGate";
import IdeaFlow from "@/components/CreateFlow/IdeaFlow";

/** The idea phase lives at its own URL, so its Close button returns to the choice. */
export const IDEA_FLOW_HREF = "/create-experience?start=idea";

/**
 * /create-experience — the one door into making an event, with two ways in.
 *
 *  - **I have an idea** → the idea phase: what, when and who for, then the
 *    partners it needs, and later the deals and a demand test, before the
 *    builder. This is where the new work lands.
 *  - **I'm ready to build** → the event builder, exactly as existing organisers
 *    know it (its Single-Day / Multi-Day choice first).
 *
 * Going idea-first for everyone confused organisers who already had their
 * partners and only wanted the builder, so the choice is back, with the idea
 * phase rather than the old collab-board modal behind the first door.
 *
 * Open to any account the deal tooling is open to, whatever role it chose at
 * sign-up. Someone still waiting on approval, or who has not finished
 * onboarding, is told so here rather than after choosing.
 */
export default function CreateExperiencePage() {
  const { data: access } = usePartnerAccess();
  const startIdea = new URLSearchParams(useSearch()).get("start") === "idea";

  const content = startIdea ? <IdeaFlow /> : <CreateChoice />;

  // Signed-out visitors are sent to sign in and brought back here.
  return (
    <ProtectedRoute requiredRole="any">
      {access?.canUseTooling && startIdea ? (
        // The idea phase runs full screen, on its own.
        content
      ) : (
        <div className="min-h-screen bg-white dark:bg-gray-950">
          <Navigation />
          <PartnerToolingGate>{content}</PartnerToolingGate>
        </div>
      )}
    </ProtectedRoute>
  );
}

function CreateChoice() {
  const [, navigate] = useLocation();

  return (
    <main className="pb-16 pt-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-bold text-gray-950 dark:text-white">Create an experience</h1>
          <p className="mt-3 text-base leading-7 text-gray-600 dark:text-gray-400">
            Two ways in, depending on how far along you are.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate(IDEA_FLOW_HREF)}
            className="group rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:border-gray-800 dark:bg-gray-900"
            data-testid="button-create-have-idea"
          >
            <div className="flex items-start justify-between gap-4">
              <Lightbulb className="h-7 w-7 text-amber-500" />
              <ArrowRight className="h-5 w-5 text-gray-400 transition group-hover:translate-x-1" />
            </div>
            <p className="mt-5 text-xl font-semibold text-gray-950 dark:text-white">I have an idea</p>
            <p className="text-sm font-medium text-primary">and I'm looking for partners</p>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Start from a rough idea: what, roughly when and who it's for. Shape it with a venue,
              community or sponsor before you build the event.
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate("/event-builder")}
            className="group rounded-2xl border-2 border-primary bg-primary/5 p-6 text-left shadow-sm transition hover:bg-primary/10 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            data-testid="button-create-ready-to-build"
          >
            <div className="flex items-start justify-between gap-4 text-primary">
              <Hammer className="h-7 w-7" />
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </div>
            <p className="mt-5 text-xl font-semibold text-gray-950 dark:text-white">I'm ready to build</p>
            <p className="text-sm font-medium text-primary">I know my date, place and partners</p>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Go straight to the event builder you know: tickets, pricing, partners and publish.
            </p>
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          An idea becomes an event later, carrying over everything you've already answered.
        </p>
      </div>
    </main>
  );
}
