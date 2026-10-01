import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/money-input';
import { getTicketAddon } from '@shared/ticketAddons';
import { discountedVenuePrice, normalizeAddonDiscountPct, priceAddonFromCatalog, syncSkuAddonsWithCatalog } from '@shared/venueAddonPricing';
import { calculateEventEconomics } from '@shared/eventEconomics';
import { formatPriceByCurrency } from '@shared/pricingService';

export default function TicketAddonChoicesEditor({ sku, catalog, currency, platformPct, addonPlatformPct,
  venueDealModel, venueSharePct, onChange }: {
  sku: any; catalog: any[]; currency: string; platformPct: number; addonPlatformPct: number;
  venueDealModel: string | null; venueSharePct: number; onChange: (addons: any[]) => void;
}) {
  const money = (amount: number) => formatPriceByCurrency(amount, currency as Parameters<typeof formatPriceByCurrency>[1]);
  const legacy = getTicketAddon(sku);
  const stored: any[] = Array.isArray(sku.addons) ? sku.addons : legacy ? [{
    id: sku.addonCatalogItemId || 'legacy', addonName: legacy.name, addonVenuePrice: legacy.venuePrice,
    addonChargeAmount: legacy.unitPrice, addonGroupRate: legacy.costBasis, addonInventory: sku.addonInventory,
  }] : [];
  // The venue may have changed a price or a discount since these were saved.
  // Its own save reprices the events it is linked to; this covers the one open
  // in front of the organiser, and writes the result back so it is what saves.
  const { skus: [{ addons: selected }], changed: repriced } = syncSkuAddonsWithCatalog([{ addons: stored }], catalog);
  useEffect(() => {
    if (repriced) onChange(selected);
    // Only when a repricing appears — `selected` is a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repriced]);

  const percentage = ['revenue_share', 'commitment_plus_revenue_share'].includes(venueDealModel || '');
  const update = (id: string, field: string, value: unknown) => onChange(selected.map(item => item.id === id ? { ...item, [field]: value } : item));
  const replace = (id: string, next: unknown) => onChange(selected.map(item => item.id === id ? next : item));
  return <div className="space-y-4" data-testid="ticket-addon-choices-editor">
    {catalog.length > 0 && <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:bg-emerald-950">
      <p className="font-medium text-sm">Pick from the venue's own list</p>
      <p className="text-xs text-muted-foreground">Select several products for this ticket. The venue sets each price and its event discount; participants choose what they want at checkout.</p>
      {catalog.filter(item => item.active !== false).map(item => {
        const retail = Number(item.venuePrice) || 0;
        const discounted = discountedVenuePrice(retail, item.discountPct);
        return <label key={item.id} className="flex items-center gap-3 rounded-md bg-white p-2 text-sm dark:bg-gray-900">
          <input type="checkbox" checked={selected.some(option => option.id === item.id)}
            aria-label={`Offer ${item.name}`} onChange={event => onChange(event.target.checked ? [...selected, priceAddonFromCatalog({
              id: String(item.id), addonName: item.name, addonVenuePrice: retail, addonChargeAmount: retail,
              addonDiscountPct: normalizeAddonDiscountPct(item.discountPct), addonMarkup: 0,
            }, item)].slice(0, 20) : selected.filter(option => option.id !== item.id))} />
          <span className="flex-1">{item.name}</span>
          {discounted < retail && <span className="text-xs text-muted-foreground line-through">{money(retail)}</span>}
          <span>{money(discounted)}</span>
        </label>;
      })}
    </div>}
    {selected.map(item => {
      const addon = getTicketAddon({ ...item, addonEnabled: true });
      const product = catalog.find(entry => String(entry.id) === String(item.id));
      // Priced from the venue's own discount: the venue keeps its discounted
      // price whole and Great's fee is charged on the markup alone, under any
      // deal. The same rule the checkout records and the payout divides by.
      const venuePriced = !!product && item.addonDiscountPct !== undefined && item.addonDiscountPct !== null;
      const economics = addon ? calculateEventEconomics({ ticketGross: 0, paidTickets: 0,
        platformPct, addonPlatformPct, venueDealModel, venueDealValue: percentage ? venueSharePct : 0,
        addOnVenueGross: addon.venueAmount, addOnCreatorGross: addon.creatorAmount,
        venuePricedAddOnVenueGross: venuePriced ? addon.venueAmount : 0,
        venuePricedAddOnCreatorGross: venuePriced ? addon.creatorAmount : 0 }) : null;
      const stock = <div><Label htmlFor={`${sku.id}-${item.id}-stock`}>How many available (optional)</Label>
        <Input id={`${sku.id}-${item.id}-stock`} type="number" min="0" step="1" value={item.addonInventory || ''} placeholder="No limit"
          onChange={event => update(item.id, 'addonInventory', Math.max(0, Number.parseInt(event.target.value) || 0))} /></div>;
      // The venue's discount, where it has set one. Below the counter price
      // without one, the cost is a rate the organiser agreed by hand before
      // venues could set a discount themselves.
      const discountPct = normalizeAddonDiscountPct(item.addonDiscountPct);
      const markup = item.addonMarkup ?? (addon ? Math.max(0, Math.round((addon.unitPrice - addon.costBasis) * 100) / 100) : 0);
      return <div key={item.id} className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3"><strong className="text-sm">{item.addonName}</strong>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(selected.filter(option => option.id !== item.id))}>Remove</Button></div>
        {product && addon ? <>
          {/* Priced from the venue's catalog: the venue's two numbers are
              shown, not entered, and the organiser's one decision is how much
              to add on top. */}
          <p className="text-xs text-muted-foreground" data-testid={`addon-venue-terms-${item.id}`}>
            Venue's retail price {money(addon.venuePrice)}.{' '}
            {discountPct > 0
              ? `${discountPct}% event discount, set by the venue: ${money(addon.costBasis)}.`
              : addon.costBasis < addon.venuePrice - 0.005
                ? `${money(addon.costBasis)} per item was agreed earlier. It is replaced when the venue sets an event discount on its products.`
                : 'The venue has not set an event discount on this product.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor={`${sku.id}-${item.id}-markup`}>Your markup per item (optional)</Label>
              <MoneyInput id={`${sku.id}-${item.id}-markup`} value={markup} placeholder="0.00"
                onValueChange={value => replace(item.id, priceAddonFromCatalog({ ...item, addonMarkup: value ?? 0 }, product))} /></div>
            {stock}
          </div>
          {venuePriced && economics ? <>
            {/* Where the money on one sale goes, top to bottom: the venue's
                price, what the organiser adds, what the participant pays, and
                what is left of the markup once Great's fee has come out of it.
                Every row is from the calculation the payout uses. */}
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md bg-muted/40 p-3 text-sm" data-testid={`addon-breakdown-${item.id}`}>
              <dt className="text-muted-foreground">Venue's retail price</dt><dd className="text-right">{money(addon.venuePrice)}</dd>
              <dt className="text-muted-foreground">Venue's event discount ({discountPct}%)</dt><dd className="text-right">−{money(addon.venuePrice - addon.costBasis)}</dd>
              <dt className="font-medium">Venue keeps</dt><dd className="text-right font-medium" data-testid={`addon-venue-keeps-${item.id}`}>{money(economics.addOnVenueRevenue)}</dd>
              <dt className="text-muted-foreground">Your markup</dt><dd className="text-right">+{money(addon.creatorAmount)}</dd>
              <dt className="border-t pt-1 font-medium">Participant pays</dt><dd className="border-t pt-1 text-right font-medium" data-testid={`addon-participant-price-${item.id}`}>{money(addon.unitPrice)}</dd>
              <dt className="pt-2 text-muted-foreground">Great's fee ({addonPlatformPct}% of your markup)</dt><dd className="pt-2 text-right" data-testid={`addon-fee-${item.id}`}>−{money(economics.platformFee)}</dd>
              <dt className="font-medium">You keep per item</dt><dd className="text-right font-medium" data-testid={`addon-you-keep-${item.id}`}>{money(economics.net)}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              The venue always receives its discounted price in full. Great's fee comes out of your markup only.
              {addon.costBasis + Number(markup) > addon.venuePrice + 0.005 && " Your markup is capped so the participant never pays more here than at the venue's counter."}
            </p>
          </> : <p className="text-sm">Participant price: <strong data-testid={`addon-participant-price-${item.id}`}>{money(addon.unitPrice)}</strong>
            {addon.costBasis + Number(markup) > addon.venuePrice + 0.005 && <span className="text-xs text-muted-foreground"> — capped at the venue's retail price, so nobody pays more here than at the counter.</span>}</p>}
        </> : <div className="grid gap-3 sm:grid-cols-2">
          {/* No longer on the venue's list, so there is nothing to price it
              from — it keeps the amounts it was saved with. */}
          <div><Label htmlFor={`${sku.id}-${item.id}-price`}>Participant price</Label>
            <MoneyInput id={`${sku.id}-${item.id}-price`} value={item.addonChargeAmount} onValueChange={value => update(item.id, 'addonChargeAmount', value ?? 0)} /></div>
          {stock}
          {!percentage && <div><Label htmlFor={`${sku.id}-${item.id}-cost`}>Venue cost per item</Label>
            <MoneyInput id={`${sku.id}-${item.id}-cost`} value={item.addonGroupRate || item.addonVenuePrice} onValueChange={value => update(item.id, 'addonGroupRate', value ?? 0)} /></div>}
        </div>}
        {economics && !venuePriced && <p className="text-xs text-muted-foreground">Per item: venue {money(economics.addOnVenueRevenue)},
          Great {money(economics.platformFee)}, you keep <strong>{money(economics.net)}</strong>.</p>}
      </div>;
    })}
    {!selected.length && <p className="text-sm text-muted-foreground">Choose products above. No duplicate entry tickets are needed.</p>}
  </div>;
}
