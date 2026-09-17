import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A selectable chip.
 *
 * Extracted because the Partners model turned three single-select dropdowns
 * into multi-selects at once — "Looking for", deal preference, partner type,
 * the two standing-preference profiles — and each screen was about to grow its
 * own version. The tick is what makes a selected chip readable as "on" rather
 * than merely "highlighted", which matters when several are selected at once.
 */
export default function ChipToggle({
  label,
  selected,
  onClick,
  disabled = false,
  hint,
  testId,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Shown under the label where the label alone is ambiguous. */
  hint?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-start gap-1.5 rounded-full border px-3.5 py-1.5 text-left text-sm transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        selected
          ? "border-transparent bg-indigo-100 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
          : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300 dark:border-gray-700 dark:bg-transparent dark:text-gray-200",
      )}
      data-testid={testId}
    >
      {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>
        {label}
        {hint && (
          <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}
