import { Input } from '@/components/ui/input';
import { getTicketAddons, type AddonSelection } from '@shared/addonChoices';
import { type TicketAddonSkuLike } from '@shared/ticketAddons';
import { formatPriceByCurrency } from '@shared/pricingService';

export default function AddonChoicePicker({ sku, quantity, currency, selections, onChange, disabled = false }: {
  sku: TicketAddonSkuLike; quantity: number; currency: string; selections: AddonSelection[];
  onChange: (items: AddonSelection[]) => void; disabled?: boolean;
}) {
  const choose = (id: string, count: number) => onChange([
    ...selections.filter(item => item.id !== id), ...(count > 0 ? [{ id, quantity: count }] : []),
  ]);
  return <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3" data-testid="addon-choice-picker">
    <div><p className="text-sm font-semibold">Optional extras</p>
      <p className="text-xs text-muted-foreground">Choose any combination. Your entry ticket is counted once.</p></div>
    {getTicketAddons(sku).map(addon => {
      const max = addon.inventory > 0 ? Math.min(quantity, addon.inventory) : quantity;
      const count = Math.min(max, selections.find(item => item.id === addon.id)?.quantity || 0);
      return <div key={addon.id} className="rounded-md border bg-white p-3 text-left dark:bg-gray-900">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 accent-indigo-600" checked={count > 0} disabled={disabled}
            onChange={event => choose(addon.id, event.target.checked ? max : 0)} aria-label={`Add ${addon.name}`} />
          <span className="flex-1"><span className="block text-sm font-medium">{addon.name}</span>
            <span className="text-xs text-muted-foreground">{formatPriceByCurrency(addon.unitPrice, currency as Parameters<typeof formatPriceByCurrency>[1])} each</span></span>
        </label>
        {count > 0 && quantity > 1 && <div className="mt-2 flex items-center justify-between">
          <label className="text-xs" htmlFor={`addon-count-${addon.id}`}>How many?</label>
          <Input id={`addon-count-${addon.id}`} type="number" min="0" max={max} value={count} disabled={disabled} className="w-20"
            onChange={event => choose(addon.id, Math.min(max, Math.max(0, Number.parseInt(event.target.value) || 0)))} />
        </div>}
      </div>;
    })}
  </div>;
}
