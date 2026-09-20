import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

/**
 * A section that is small until it has something in it.
 *
 * The builder grew by accretion: every feature added a card, and every card
 * rendered at full height whether or not the organiser was using it. A
 * breathwork class in a borrowed studio — one ticket, no partners, no
 * discounts, no add-on, no referral perk — scrolled past six expanded panels
 * of fields it would never fill, and the two it did need were somewhere in the
 * middle. Simple events have to stay simple, or nobody finishes one.
 *
 * Not a mode, and not a toggle the organiser has to find and set. A section
 * with real content in it is open, because it has something to show; a section
 * with none is a single line, because it has nothing. The only interaction is
 * the one that adds the first thing.
 *
 * Once opened it stays open for the rest of the session even if the content is
 * cleared again — collapsing a panel under someone who has just emptied a
 * field would read as the form eating their work.
 */
export default function MinimalSection({
  title,
  hint,
  isEmpty,
  addLabel,
  onAdd,
  children,
  testId,
}: {
  title: string;
  /** One line, shown on the collapsed row. */
  hint?: string;
  /** True when the section holds nothing the organiser has entered. */
  isEmpty: boolean;
  /** The collapsed row's action, e.g. "Add a discount". Defaults to the title. */
  addLabel?: string;
  /**
   * Called when the collapsed row is used. Optional: where adding means
   * "start filling this in", expanding is the whole action.
   */
  onAdd?: () => void;
  children: ReactNode;
  testId?: string;
}) {
  const [opened, setOpened] = useState(!isEmpty);

  // Content arriving from elsewhere — a draft loading, a value set by another
  // step — opens the section without anybody clicking anything.
  useEffect(() => {
    if (!isEmpty) setOpened(true);
  }, [isEmpty]);

  if (opened) {
    return <div data-testid={testId}>{children}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => { setOpened(true); onAdd?.(); }}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-dashed p-4 text-left",
        "transition-colors hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20",
      )}
      data-testid={testId ? `${testId}-collapsed` : undefined}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        <Plus className="h-4 w-4 text-gray-500" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900 dark:text-white">
          {addLabel || title}
        </span>
        {hint && (
          <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>
        )}
      </span>
    </button>
  );
}
