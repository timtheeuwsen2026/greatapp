import { describeEventDate, isConceptDraft, type ConceptIdea } from "@shared/conceptIdea";

/**
 * What the organiser already told us in the idea phase, shown where the builder
 * would otherwise be asking again.
 *
 * Both render nothing for an event that did not start as an idea, so the
 * builder looks exactly as it did for anyone arriving another way.
 */

/** Audience and group size — the answers the builder has no field for. */
export function IdeaSummaryCard({ concept }: { concept?: Partial<ConceptIdea> | null }) {
  if (!isConceptDraft({ concept })) return null;

  const audience = concept?.audience?.trim();
  const min = concept?.groupSizeMin ?? null;
  const max = concept?.groupSizeMax ?? null;
  const group = min && max ? `${min} to ${max} people` : max ? `Up to ${max} people` : min ? `From ${min} people` : null;
  const parts = [audience ? `For ${audience}` : null, group].filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <div className="rounded-lg border bg-white p-4 dark:bg-gray-900" data-testid="idea-summary-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">From your idea</p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{parts.join(" · ")}</p>
    </div>
  );
}

/**
 * The period or open date the idea started with, above the date fields. An event
 * cannot be published without an exact date, so this says so rather than
 * leaving a blank picker to explain itself.
 */
export function IdeaPeriodCard({
  concept, startDate,
}: { concept?: Partial<ConceptIdea> | null; startDate?: Date | string | null }) {
  if (!isConceptDraft({ concept }) || concept?.dateMode === "exact") return null;

  const picked = !!startDate;
  const heading = concept?.dateMode === "period"
    ? `Period: ${describeEventDate({ concept })}`
    : "No date picked yet";

  return (
    <div className="rounded-lg border bg-white p-4 dark:bg-gray-900" data-testid="idea-period-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date · from your idea</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{heading}</p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {picked
          ? "You've picked the exact date below."
          : "Pick the exact date below. It's required to publish."}
      </p>
    </div>
  );
}
