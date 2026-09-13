import { ReactNode } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { OTHER_ID, type TaxonomyOption } from "@shared/partnerTaxonomy";

/**
 * The controls every partner onboarding screen is built from.
 *
 * Creator, Promoter and Venue all ask the same shapes of question — pick one
 * category, pick several needs, yes or no on perks — and each screen had been
 * writing its own radio group. Sharing the controls is what makes the answers
 * comparable, which is the entire point of asking them: the matcher can only
 * compare two profiles that speak the same vocabulary.
 *
 * Chips rather than a `<select>` throughout. These lists are short, the hints
 * matter, and a dropdown hides the options behind a click at exactly the
 * moment someone is deciding whether the product is for them.
 */

function Chip({
  selected,
  onClick,
  children,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
        selected
          ? "border-primary bg-primary/5 text-gray-900 dark:text-white"
          : "border-gray-200 text-gray-700 hover:border-primary/50 dark:border-gray-700 dark:text-gray-300",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          selected ? "border-primary bg-primary text-white" : "border-gray-300 dark:border-gray-600",
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  );
}

function OptionLabel({ option }: { option: TaxonomyOption }) {
  return (
    <>
      <span className="block font-medium">{option.label}</span>
      {option.hint && (
        <span className="block text-xs text-muted-foreground">{option.hint}</span>
      )}
    </>
  );
}

/**
 * Pick exactly one, with a free-text box that appears only once "Other" is
 * chosen.
 *
 * The escape hatch is not optional politeness. Without it a taxonomy quietly
 * forces people into the nearest wrong box, and then every match made off that
 * value is wrong in the same direction.
 */
export function SingleChoiceField({
  label,
  description,
  options,
  value,
  otherValue,
  onChange,
  onOtherChange,
  otherPlaceholder = "Tell us in your own words",
  required,
  testId,
}: {
  label: string;
  description?: string;
  options: TaxonomyOption[];
  value: string;
  otherValue?: string;
  onChange: (value: string) => void;
  onOtherChange?: (value: string) => void;
  otherPlaceholder?: string;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <Label>
        {label} {required && <span aria-hidden>*</span>}
      </Label>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <Chip
            key={option.id}
            selected={value === option.id}
            onClick={() => onChange(value === option.id ? "" : option.id)}
            testId={testId ? `${testId}-${option.id}` : undefined}
          >
            <OptionLabel option={option} />
          </Chip>
        ))}
      </div>
      {value === OTHER_ID && onOtherChange && (
        <Input
          value={otherValue || ""}
          onChange={(event) => onOtherChange(event.target.value)}
          placeholder={otherPlaceholder}
          data-testid={testId ? `${testId}-other-input` : undefined}
        />
      )}
    </div>
  );
}

/** Pick any number, same escape hatch. */
export function MultiChoiceField({
  label,
  description,
  options,
  values,
  otherValue,
  onChange,
  onOtherChange,
  otherPlaceholder = "Tell us in your own words",
  required,
  testId,
}: {
  label: string;
  description?: string;
  options: TaxonomyOption[];
  values: string[];
  otherValue?: string;
  onChange: (values: string[]) => void;
  onOtherChange?: (value: string) => void;
  otherPlaceholder?: string;
  required?: boolean;
  testId?: string;
}) {
  const toggle = (id: string) => {
    onChange(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <Label>
          {label} {required && <span aria-hidden>*</span>}
        </Label>
        <span className="text-xs text-muted-foreground" data-testid={testId ? `${testId}-count` : undefined}>
          {values.length} selected
        </span>
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <Chip
            key={option.id}
            selected={values.includes(option.id)}
            onClick={() => toggle(option.id)}
            testId={testId ? `${testId}-${option.id}` : undefined}
          >
            <OptionLabel option={option} />
          </Chip>
        ))}
      </div>
      {values.includes(OTHER_ID) && onOtherChange && (
        <Input
          value={otherValue || ""}
          onChange={(event) => onOtherChange(event.target.value)}
          placeholder={otherPlaceholder}
          data-testid={testId ? `${testId}-other-input` : undefined}
        />
      )}
    </div>
  );
}

/**
 * A standing yes/no on how someone likes to deal.
 *
 * Both of the ones this is used for — perks or credits instead of cash, and
 * working with promoters — default to off, because both are things a partner
 * opts into rather than has assumed of them.
 */
export function PreferenceToggle({
  label,
  description,
  checked,
  onChange,
  testId,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 dark:text-white">{label}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}
