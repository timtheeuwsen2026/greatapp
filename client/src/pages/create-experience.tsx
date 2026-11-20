import { useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Hammer, Lightbulb } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { describeEventDate, isConceptDraft } from "@shared/conceptIdea";
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
  const search = new URLSearchParams(useSearch());
  const startIdea = search.get("start") === "idea";
  // ?draft= reopens a saved idea where it stopped (Save as draft, or Change from the builder).
  const content = startIdea ? <IdeaFlow draftId={search.get("draft")} /> : <CreateChoice />;

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

        <UnfinishedIdeas />
      </div>
    </main>
  );
}

type DraftRow = { id: string; title?: string | null; startDate?: string | null; endDate?: string | null; concept?: any; updatedAt?: string | null };

/**
 * Ideas saved with "Save as draft", to pick up again. Here rather than in a
 * role's own dashboard: any account can start an idea, and only the Creator
 * dashboard lists drafts, so a venue or an affiliate would otherwise never
 * find theirs again.
 */
function UnfinishedIdeas() {
  const [, navigate] = useLocation();
  const { data } = useQuery<DraftRow[]>({
    queryKey: ["/api/experience-drafts", "unfinished-ideas"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/experience-drafts");
      const body = await response.json();
      return Array.isArray(body) ? body : [];
    },
    retry: false,
  });
  const ideas = (data ?? [])
    .filter((draft) => isConceptDraft(draft) && !draft.concept?.sentAt)
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
    .slice(0, 5);
  if (ideas.length === 0) return null;

  return (
    <section className="mt-10" data-testid="unfinished-ideas">
      <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Continue an idea</h2>
      <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-white dark:border-gray-800 dark:bg-gray-900">
        {ideas.map((draft) => (
          <li key={draft.id}>
            <button
              type="button"
              onClick={() => navigate(`${IDEA_FLOW_HREF}&draft=${encodeURIComponent(draft.id)}`)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              data-testid={`unfinished-idea-${draft.id}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-gray-950 dark:text-white">{draft.title?.trim() || "Untitled idea"}</span>
                <span className="block text-sm text-gray-500">{describeEventDate({ startDate: draft.startDate, endDate: draft.endDate, concept: draft.concept })}</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-gray-400" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
