import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A currency or margin field you can actually type a decimal into.
 *
 * Every money field in the builder used to be `<Input type="number">` with
 * `onChange={e => setValue(parseFloat(e.target.value) || 0)}`. Three things go
 * wrong with that, and all three bite hardest on the small amounts margins are
 * usually made of:
 *
 *  - Typing "." parses to NaN, `|| 0` turns it into 0, and the controlled value
 *    re-renders as "0" — so the decimal point is swallowed the instant it is
 *    typed. ".50" is unreachable.
 *  - Typing "0." parses to 0, re-renders as "0", and the trailing point is gone
 *    again. The only way through was to type "05" and then reposition the caret
 *    to insert a "." in the middle.
 *  - `|| 0` also cannot tell a cleared field from a deliberate zero.
 *
 * The fix is to hold what the user typed as text and only tell the caller about
 * the parsed number. The text is authoritative while the field has focus, so
 * an in-progress "0." or "." survives; the number is authoritative once focus
 * leaves or the value is changed from elsewhere, so the field always settles on
 * something a form can save.
 */
export type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & {
  value: number | string | null | undefined;
  /** The parsed amount. `null` means the field was cleared. */
  onValueChange: (value: number | null) => void;
  /** Whole numbers only — a head count or an inventory cap. */
  integer?: boolean;
  allowNegative?: boolean;
};

/** What may sit in the box mid-keystroke: "", "-", ".", "0.", "1.5". */
function isTypeable(text: string, integer: boolean, allowNegative: boolean): boolean {
  if (text === "") return true;
  const pattern = integer
    ? (allowNegative ? /^-?\d*$/ : /^\d*$/)
    : (allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/);
  return pattern.test(text);
}

function toText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    { value, onValueChange, integer = false, allowNegative = false, className, onBlur, onFocus, ...rest },
    ref,
  ) {
    const [text, setText] = React.useState(() => toText(value));
    const [focused, setFocused] = React.useState(false);

    // While the field is focused the text is the truth — re-syncing here is
    // what used to eat the decimal point. Once focus leaves, whatever the form
    // holds wins, so a value corrected elsewhere shows up.
    React.useEffect(() => {
      if (focused) return;
      const incoming = toText(value);
      setText((current) => (Number(current) === Number(incoming) && current !== "" ? current : incoming));
    }, [value, focused]);

    return (
      <Input
        {...rest}
        ref={ref}
        // Deliberately not type="number": a number input reports "" for any
        // value the browser considers incomplete, so the component can never
        // see the "0." the user is halfway through typing. inputMode still
        // brings up the numeric keypad on a phone.
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        value={text}
        className={cn(className)}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onChange={(event) => {
          const next = event.target.value.replace(",", ".");
          if (!isTypeable(next, integer, allowNegative)) return;
          setText(next);

          if (next === "" || next === "-" || next === "." || next === "-.") {
            onValueChange(null);
            return;
          }
          const parsed = integer ? parseInt(next, 10) : parseFloat(next);
          onValueChange(Number.isFinite(parsed) ? parsed : null);
        }}
        onBlur={(event) => {
          setFocused(false);
          // Settle "0." or "." into something readable, without changing what
          // the form was already told.
          setText(toText(text === "" ? null : Number(text)));
          onBlur?.(event);
        }}
      />
    );
  },
);

export default MoneyInput;
