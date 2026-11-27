import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import ChipToggle from "@/components/ChipToggle";
import {
  ACTIVITIES,
  CATEGORY_GROUPS,
  activityById,
  currentCategory,
  type EventCategoryId,
} from "@shared/eventCategories";

/**
 * "What kind of activity?" (board A1 and build page 3): pick a group, then the
 * activity. A search box finds any of the ~60 activities at once. The same
 * picker is used in the event builder (one activity) and in the idea flow (up
 * to three), so both store the same ids.
 */
export default function ActivityPicker({
  value,
  onChange,
  max = 1,
  initialGroup,
  testIdPrefix = "activity",
}: {
  /** Activity ids, in the order they were picked. */
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  /** A group to open on when nothing is picked yet (an event's stored category). */
  initialGroup?: unknown;
  testIdPrefix?: string;
}) {
  const firstPicked = activityById(value[0]);
  const [group, setGroup] = useState<EventCategoryId>(
    firstPicked?.group ?? currentCategory(initialGroup) ?? CATEGORY_GROUPS[0].id,
  );
  const [query, setQuery] = useState("");
  // The builder mounts before a saved event loads: open on the loaded
  // activity's group once it arrives, unless a group was chosen by hand.
  const [groupChosen, setGroupChosen] = useState(false);
  const loadedGroup = firstPicked?.group ?? currentCategory(initialGroup);
  useEffect(() => {
    if (!groupChosen && loadedGroup) setGroup(loadedGroup);
  }, [loadedGroup, groupChosen]);

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase();
    if (!words) return null;
    return ACTIVITIES.filter((activity) =>
      activity.label.toLowerCase().includes(words)
      || (activity.keywords ?? []).some((keyword) => keyword.includes(words)),
    );
  }, [query]);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((picked) => picked !== id));
      return;
    }
    if (max === 1) {
      onChange([id]);
      return;
    }
    if (value.length >= max) return;
    onChange([...value, id]);
  };

  const shown = matches ?? CATEGORY_GROUPS.find((entry) => entry.id === group)?.activities ?? [];
  // Picked activities from another group stay visible, so nothing is hidden.
  const pickedElsewhere = matches
    ? []
    : value.map((id) => activityById(id)).filter((activity) => activity && activity.group !== group);

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-picker`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${ACTIVITIES.length} activities`}
          className="pl-9"
          aria-label="Search activities"
          data-testid={`${testIdPrefix}-search`}
        />
      </div>

      {!matches && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Group</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Activity group">
            {CATEGORY_GROUPS.map((entry) => {
              const count = value.filter((id) => activityById(id)?.group === entry.id).length;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => { setGroup(entry.id); setGroupChosen(true); }}
                  aria-pressed={group === entry.id}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    group === entry.id
                      ? "border-primary bg-primary text-white"
                      : "border-gray-300 bg-white text-gray-800 hover:border-primary/50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                  }`}
                  data-testid={`${testIdPrefix}-group-${entry.id}`}
                >
                  {entry.label}{count > 0 ? ` · ${count}` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {matches
            ? (matches.length ? "Activities" : "Nothing found. Try another word, or pick a group.")
            : CATEGORY_GROUPS.find((entry) => entry.id === group)?.label}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Activity">
          {shown.map((activity) => (
            <ChipToggle
              key={activity.id}
              label={activity.label}
              selected={value.includes(activity.id)}
              disabled={!value.includes(activity.id) && max > 1 && value.length >= max}
              onClick={() => toggle(activity.id)}
              testId={`${testIdPrefix}-${activity.id}`}
            />
          ))}
        </div>
      </div>

      {pickedElsewhere.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Also</p>
          <div className="flex flex-wrap gap-2">
            {pickedElsewhere.map((activity) => activity && (
              <ChipToggle
                key={activity.id}
                label={activity.label}
                selected
                onClick={() => toggle(activity.id)}
                testId={`${testIdPrefix}-${activity.id}`}
              />
            ))}
          </div>
        </div>
      )}

      {max > 1 && (
        <p className="text-xs text-gray-500" aria-live="polite">
          {value.length} of up to {max} picked.
        </p>
      )}
    </div>
  );
}
