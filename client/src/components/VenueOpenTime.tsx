import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAYPARTS,
  WEEKDAYS,
  quietSlotKey,
  type OpenPeriod,
} from "@shared/partnerTaxonomy";

/**
 * When the space is actually quiet — in the venue's own words.
 *
 * Deliberately separate from Calendar Sync, which answers a different
 * question. A sync says when the space is *booked*; it cannot say that a café
 * is technically free all week but only wants events on Tuesday evenings, or
 * that a villa has three empty weeks in November it would take almost anything
 * for. That is a commercial statement, and only the owner can make it.
 *
 * Two shapes, because the two listing types genuinely think differently. A day
 * space thinks in a weekly rhythm — Monday mornings are always dead. A trip
 * location thinks in blocks of the calendar — the first half of November is
 * open. Forcing either into the other's grid produces an answer nobody means.
 */

export function QuietSlotGrid({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const selected = new Set(value);
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  };

  const toggleDaypart = (daypart: string) => {
    const keys = WEEKDAYS.map((day) => quietSlotKey(day.id, daypart));
    const allOn = keys.every((key) => selected.has(key));
    const next = new Set(selected);
    keys.forEach((key) => (allOn ? next.delete(key) : next.add(key)));
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="w-28 text-left font-normal text-muted-foreground" />
              {WEEKDAYS.map((day) => (
                <th key={day.id} className="text-center font-medium text-gray-700 dark:text-gray-300">
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYPARTS.map((daypart) => (
              <tr key={daypart.id}>
                <th scope="row" className="text-left align-middle">
                  <button
                    type="button"
                    onClick={() => toggleDaypart(daypart.id)}
                    className="text-left"
                    data-testid={`toggle-daypart-${daypart.id}`}
                  >
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {daypart.label}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {daypart.hint}
                    </span>
                  </button>
                </th>
                {WEEKDAYS.map((day) => {
                  const key = quietSlotKey(day.id, daypart.id);
                  const on = selected.has(key);
                  return (
                    <td key={key} className="p-0">
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-pressed={on}
                        aria-label={`${day.label} ${daypart.label}`}
                        data-testid={`quiet-slot-${key}`}
                        className={cn(
                          "h-9 w-full rounded border text-xs transition",
                          on
                            ? "border-primary bg-primary text-white"
                            : "border-gray-200 bg-white hover:border-primary/50 dark:border-gray-700 dark:bg-gray-800",
                        )}
                      >
                        {on ? "Quiet" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Tap a cell to mark it quiet, or a row label to mark that daypart across the week.
        Leaving everything blank simply means you have no particular preference.
      </p>
    </div>
  );
}

/**
 * Date ranges, for spaces that answer in blocks of the calendar.
 *
 * Used twice with opposite meanings — the periods a venue most wants filled,
 * and the periods it is not available at all — so the copy is passed in rather
 * than assumed.
 */
export function PeriodListEditor({
  value,
  onChange,
  addLabel,
  emptyLabel,
  notePlaceholder,
  testId,
}: {
  value: OpenPeriod[];
  onChange: (value: OpenPeriod[]) => void;
  addLabel: string;
  emptyLabel: string;
  notePlaceholder: string;
  testId: string;
}) {
  const rows = Array.isArray(value) ? value : [];

  const update = (index: number, patch: Partial<OpenPeriod>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-3" data-testid={testId}>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-2 gap-3 rounded border p-3 sm:grid-cols-[10rem_10rem_minmax(0,1fr)_auto] sm:items-end"
          >
            <div className="min-w-0 space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">From</Label>
              <Input
                type="date"
                className="w-full"
                value={row.startDate || ""}
                onChange={(event) => update(index, { startDate: event.target.value })}
                data-testid={`${testId}-start-${index}`}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">To</Label>
              <Input
                type="date"
                className="w-full"
                value={row.endDate || ""}
                onChange={(event) => update(index, { endDate: event.target.value })}
                data-testid={`${testId}-end-${index}`}
              />
            </div>
            <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
              <Label className="text-xs font-normal text-muted-foreground">Note</Label>
              <Input
                className="w-full"
                placeholder={notePlaceholder}
                value={row.note || ""}
                onChange={(event) => update(index, { note: event.target.value })}
                data-testid={`${testId}-note-${index}`}
              />
            </div>
            <div className="col-span-2 flex justify-end sm:col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove period"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                data-testid={`${testId}-remove-${index}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { startDate: "", endDate: "" }])}
        data-testid={`${testId}-add`}
      >
        <Plus className="mr-1 h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}
