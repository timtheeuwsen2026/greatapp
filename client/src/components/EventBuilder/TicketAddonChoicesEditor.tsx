import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/money-input';
import { getTicketAddon } from '@shared/ticketAddons';
import { calculateEventEconomics } from '@shared/eventEconomics';
import { formatPriceByCurrency } from '@shared/pricingService';

export default function TicketAddonChoicesEditor({ sku, catalog, currency, platformPct, addonPlatformPct,
  venueDealModel, venueSharePct, onChange }: {
  sku: any; catalog: any[]; currency: string; platformPct: number; addonPlatformPct: number;
  venueDealModel: string | null; venueSharePct: number; onChange: (addons: any[]) => void;
}) {
  const legacy = getTicketAddon(sku);
  const selected: any[] = Array.isArray(sku.addons) ? sku.addons : legacy ? [{
    id: sku.addonCatalogItemId || 'legacy', addonName: legacy.name, addonVenuePrice: legacy.venuePrice,
    addonChargeAmount: legacy.unitPrice, addonGroupRate: legacy.costBasis, addonInventory: sku.addonInventory,
  }] : [];
  const percentage = ['revenue_share', 'commitment_plus_revenue_share'].includes(venueDealModel || '');
  const update = (id: string, field: string, value: unknown) => onChange(selected.map(item => item.id === id ? { ...item, [field]: value } : item));
  return <div className="space-y-4" data-testid="ticket-addon-choices-editor">
    {catalog.length > 0 && <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:bg-emerald-950">
      <p className="font-medium text-sm">Pick from the venue's own list</p>
      <p className="text-xs text-muted-foreground">Select several products for this ticket. Each keeps its own price; participants choose what they want at checkout.</p>
      {catalog.filter(item => item.active !== false).map(item => <label key={item.id} className="flex items-center gap-3 rounded-md bg-white p-2 text-sm dark:bg-gray-900">
        <input type="checkbox" checked={selected.some(option => option.id === item.id)}
          aria-label={`Offer ${item.name}`} onChange={event => onChange(event.target.checked ? [...selected, {
            id: String(item.id), addonName: item.name, addonVenuePrice: Number(item.venuePrice) || 0,
            addonChargeAmount: Number(item.venuePrice) || 0, addonGroupRate: Number(item.groupRate) || 0,
          }].slice(0, 20) : selected.filter(option => option.id !== item.id))} />
        <span className="flex-1">{item.name}</span><span>{formatPriceByCurrency(Number(item.venuePrice) || 0, currency as Parameters<typeof formatPriceByCurrency>[1])}</span>
      </label>)}
    </div>}
    {selected.map(item => {
      const addon = getTicketAddon({ ...item, addonEnabled: true });
      const economics = addon ? calculateEventEconomics({ ticketGross: 0, paidTickets: 0,
        platformPct, addonPlatformPct, venueDealModel, venueDealValue: percentage ? venueSharePct : 0,
        addOnVenueGross: addon.venueAmount, addOnCreatorGross: addon.creatorAmount }) : null;
      return <div key={item.id} className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3"><strong className="text-sm">{item.addonName}</strong>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(selected.filter(option => option.id !== item.id))}>Remove</Button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor={`${sku.id}-${item.id}-price`}>Participant price</Label>
            <MoneyInput id={`${sku.id}-${item.id}-price`} value={item.addonChargeAmount} onValueChange={value => update(item.id, 'addonChargeAmount', value ?? 0)} /></div>
          <div><Label htmlFor={`${sku.id}-${item.id}-stock`}>How many available (optional)</Label>
            <Input id={`${sku.id}-${item.id}-stock`} type="number" min="0" step="1" value={item.addonInventory || ''} placeholder="No limit"
              onChange={event => update(item.id, 'addonInventory', Math.max(0, Number.parseInt(event.target.value) || 0))} /></div>
          {!percentage && <div><Label htmlFor={`${sku.id}-${item.id}-cost`}>Venue cost per item</Label>
            <MoneyInput id={`${sku.id}-${item.id}-cost`} value={item.addonGroupRate || item.addonVenuePrice} onValueChange={value => update(item.id, 'addonGroupRate', value ?? 0)} /></div>}
        </div>
        {economics && <p className="text-xs text-muted-foreground">Per item: venue {formatPriceByCurrency(economics.addOnVenueRevenue, currency as Parameters<typeof formatPriceByCurrency>[1])},
          Great {formatPriceByCurrency(economics.platformFee, currency as Parameters<typeof formatPriceByCurrency>[1])}, you keep <strong>{formatPriceByCurrency(economics.net, currency as Parameters<typeof formatPriceByCurrency>[1])}</strong>.</p>}
      </div>;
    })}
    {!selected.length && <p className="text-sm text-muted-foreground">Choose products above. No duplicate entry tickets are needed.</p>}
  </div>;
}
