import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** YYYY-MM-DD → a Date on that calendar day in the browser's own timezone. */
export function dayToDate(day: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** A Date → the YYYY-MM-DD the person picked, not the one UTC would call it. */
export function dateToDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A calendar day picked from the same calendar the Event Builder's Dates step
 * uses, holding a plain YYYY-MM-DD string. The string is the point: the idea
 * phase deals in days, and a Date would carry a timezone that moves the day.
 */
export default function DayPickerField({
  value,
  onChange,
  placeholder,
  min,
  invalid,
  clearable,
  "data-testid": testId,
}: {
  value: string;
  onChange: (day: string) => void;
  placeholder: string;
  /** Earliest pickable day, YYYY-MM-DD. */
  min?: string;
  invalid?: boolean;
  /** Offer a way back to empty — for fields that are optional. */
  clearable?: boolean;
  "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = dayToDate(value);
  const earliest = min ? dayToDate(min) : undefined;

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-12 w-full justify-start rounded-xl pl-3 text-left text-base font-normal",
              clearable && selected && "pr-10",
              !selected && "text-muted-foreground",
              invalid && "border-red-400",
            )}
            aria-invalid={invalid || undefined}
            // The button's text is only the date; the label says which date.
            aria-label={selected ? `${placeholder}: ${format(selected, "d MMMM yyyy")}` : placeholder}
            data-testid={testId}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
            {selected ? format(selected, "d MMM yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? earliest}
            onSelect={(date) => {
              if (date) onChange(dateToDay(date));
              setOpen(false);
            }}
            disabled={earliest ? (date) => date < earliest : undefined}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {/* A sibling of the trigger, not inside it: a button cannot hold a button. */}
      {clearable && selected && (
        <button
          type="button"
          aria-label="Clear date"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          data-testid={testId ? `${testId}-clear` : undefined}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
