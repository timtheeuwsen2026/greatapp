import { useRoute } from "wouter";
import CopyableLink from "@/components/CopyableLink";
import {
  IDEA_NEEDS,
  describeEventDate,
  describeIdeaFor,
  describePeopleEarn,
  isConceptDraft,
  type ConceptIdea,
  type IdeaNeedId,
  type IdeaSlot,
} from "@shared/conceptIdea";

/**
 * What the organiser already told us in the idea phase, shown where the builder
 * would otherwise be asking again.
 *
 * Both render nothing for an event that did not start as an idea, so the
 * builder looks exactly as it did for anyone arriving another way.
 */

function slotStatus(slot: IdeaSlot | undefined): string {
  if (!slot) return "";
  return [
    slot.board ? "On the Collab board" : null,
    slot.direct ? (slot.inviteUrl ? "Invite sent" : "Invite not sent yet") : null,
    slot.ownCommunity ? "Your own community" : null,
  ].filter(Boolean).join(" · ");
}

/** Who it is for, group size, and the open slots with their invite links. */
export function IdeaSummaryCard({ concept }: { concept?: Partial<ConceptIdea> | null }) {
  const [, params] = useRoute<{ draftId?: string }>("/event-builder/:draftId");
  if (!isConceptDraft({ concept })) return null;

  const forLine = describeIdeaFor(concept);
  const needs = (concept?.needs ?? []) as IdeaNeedId[];
  const answeredNeeds = Array.isArray(concept?.needs);
  if (!forLine && !answeredNeeds) return null;
  const draftId = params?.draftId;

  return (
    <div className="rounded-lg border bg-white p-4 dark:bg-gray-900" data-testid="idea-summary-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">From your idea</p>
        {draftId && (
          <a
            href={`/create-experience?start=idea&draft=${encodeURIComponent(draftId)}`}
            className="text-sm font-medium text-primary hover:underline"
            data-testid="idea-summary-change"
          >
            Change idea and needs
          </a>
        )}
      </div>
      {forLine && (
        <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white" data-testid="idea-summary-for">
          For {forLine}
        </p>
      )}
      {needs.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="idea-summary-needs">
          {needs.map((need) => {
            const slot = concept?.slots?.[need];
            const label = IDEA_NEEDS.find((entry) => entry.id === need)?.label ?? need;
            const earn = need === "community" ? describePeopleEarn(slot) : null;
            return (
              <li key={need} className="text-sm" data-testid={`idea-summary-need-${need}`}>
                <span className="font-semibold text-gray-900 dark:text-white">{label}</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {[slotStatus(slot), earn].filter(Boolean).length ? ` · ${[slotStatus(slot), earn].filter(Boolean).join(" · ")}` : ""}
                </span>
                {slot?.inviteUrl && (
                  <div className="mt-1">
                    <CopyableLink url={slot.inviteUrl} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {needs.length > 0 && !concept?.sentAt && (
        <p className="mt-2 text-xs text-amber-700" data-testid="idea-summary-not-sent">
          Not sent yet. Open "Change idea and needs" and press Send to post it and send the invites.
        </p>
      )}
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
