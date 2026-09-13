import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Plus, Trash2 } from "lucide-react";

/**
 * A venue's own add-on prices.
 *
 * Path A of venue add-on pricing. Until now the organiser typed a "venue
 * price" for the venue's coffee — a number they were guessing, on behalf of a
 * business they do not run. The whole mechanic depends on that number being
 * the venue's real counter price: an add-on exists so a participant pays no
 * more here than they would at the bar, and a guessed price breaks that in
 * whichever direction the guess went.
 *
 * So the venue states its prices once, and every organiser working with it
 * picks from the list. `venuePrice` is what the venue is paid per unit — the
 * organiser's margin sits on top of it, or comes out of it, decided per event
 * and never here.
 */

export type VenueAddonCatalogItem = {
  id: string;
  name: string;
  description?: string;
  venuePrice: number;
  unit?: string;
  groupDiscountNote?: string;
  active: boolean;
};

function newItem(): VenueAddonCatalogItem {
  return {
    id: `addon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    description: "",
    venuePrice: 0,
    unit: "per person",
    groupDiscountNote: "",
    active: true,
  };
}

export default function VenueAddonCatalogEditor({
  value,
  onChange,
  currencySymbol = "EUR",
}: {
  value: VenueAddonCatalogItem[];
  onChange: (value: VenueAddonCatalogItem[]) => void;
  currencySymbol?: string;
}) {
  const items = Array.isArray(value) ? value : [];

  const update = (index: number, patch: Partial<VenueAddonCatalogItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-4" data-testid="venue-addon-catalog">
      {items.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nothing listed yet. If you skip this, organisers will ask you for a price on the
          first event that wants one.
        </p>
      ) : (
        items.map((item, index) => (
          <div key={item.id} className="space-y-4 rounded-lg border p-4" data-testid={`venue-addon-${index}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-xs font-normal text-muted-foreground">What is it?</Label>
                <Input
                  value={item.name}
                  placeholder="Coffee & medialuna"
                  onChange={(event) => update(index, { name: event.target.value })}
                  data-testid={`venue-addon-name-${index}`}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove add-on"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                data-testid={`venue-addon-remove-${index}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs font-normal text-muted-foreground">
                  Your price ({currencySymbol})
                </Label>
                <MoneyInput
                  value={item.venuePrice}
                  onValueChange={(amount) => update(index, { venuePrice: amount ?? 0 })}
                  data-testid={`venue-addon-price-${index}`}
                />
                <p className="text-xs text-muted-foreground">
                  What you are paid per unit. This is never what the participant is shown —
                  the organiser's margin is applied to it separately.
                </p>
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="text-xs font-normal text-muted-foreground">Per what?</Label>
                <Input
                  value={item.unit || ""}
                  placeholder="per person"
                  onChange={(event) => update(index, { unit: event.target.value })}
                  data-testid={`venue-addon-unit-${index}`}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                Description (optional)
              </Label>
              <Textarea
                value={item.description || ""}
                placeholder="Filter coffee and a pastry, served from 9am."
                className="min-h-16"
                onChange={(event) => update(index, { description: event.target.value })}
                data-testid={`venue-addon-description-${index}`}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-normal text-muted-foreground">
                Group rate or combo (optional)
              </Label>
              <Input
                value={item.groupDiscountNote || ""}
                placeholder="10% off for groups over 20"
                onChange={(event) => update(index, { groupDiscountNote: event.target.value })}
                data-testid={`venue-addon-group-discount-${index}`}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Currently offered</p>
                <p className="text-xs text-muted-foreground">
                  Switch off to keep the price on file without offering it to new events.
                </p>
              </div>
              <Switch
                checked={item.active !== false}
                onCheckedChange={(checked) => update(index, { active: checked })}
                data-testid={`venue-addon-active-${index}`}
              />
            </div>
          </div>
        ))
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, newItem()])}
        data-testid="venue-addon-add"
      >
        <Plus className="mr-1 h-4 w-4" />
        Add an item
      </Button>
    </div>
  );
}
