import { getTicketAddon, isAddonEnabled, clampAddonQuantity, type TicketAddonSkuLike, type TicketAddon } from './ticketAddons';

export type AddonSelection = { id: string; quantity: number };
/**
 * `markup` is present only on a product priced from the venue's own discount,
 * and it settles how that sale is divided: the venue keeps `unitPrice − markup`
 * (its discounted price, whole), and the platform fee is charged on the markup
 * alone. A line without it predates that and divides as it always did.
 */
export type BookingAddonItem = { id: string; name: string; unitPrice: number; quantity: number; total: number; venueAmount: number; markup?: number };
export type AddonOption = TicketAddon & { id: string; inventory: number; venuePriced: boolean };
const isSet = (value: unknown) => value !== undefined && value !== null && value !== '';
const round2 = (value: number) => Math.round(value * 100) / 100;
export function getTicketAddons(sku: TicketAddonSkuLike | null | undefined): AddonOption[] {
  if (!sku || !isAddonEnabled(sku)) return [];
  const fromVenueList = Array.isArray(sku.addons);
  const entries = Array.isArray(sku.addons) ? sku.addons : [{ ...sku, id: 'legacy' }];
  return entries.flatMap((entry, index) => {
    const addon = getTicketAddon({ ...entry, addons: undefined, addonEnabled: true });
    // Only a product picked from a venue's list, carrying that venue's
    // discount, is one the platform can pay the venue for directly.
    return addon ? [{ ...addon, id: String(entry.id || `addon-${index}`), inventory: Number(entry.addonInventory) || 0,
      venuePriced: fromVenueList && isSet(entry.addonDiscountPct) }] : [];
  });
}
/**
 * The add-on money on a booking that was priced from a venue's discount, in
 * cents: what was charged, the venue's part of it and the organiser's markup.
 * The three always agree — `venue + markup === gross`.
 */
export function venuePricedAddonCents(addonItems: unknown): { gross: number; venue: number; markup: number } {
  const totals = { gross: 0, venue: 0, markup: 0 };
  if (!Array.isArray(addonItems)) return totals;
  for (const item of addonItems) {
    if (!item || !isSet(item.markup) || !Number.isFinite(Number(item.markup))) continue;
    const gross = Math.max(0, Math.round(Number(item.total) * 100));
    const markup = Math.min(gross, Math.max(0, Math.round(Number(item.markup) * (Number(item.quantity) || 0) * 100)));
    totals.gross += gross; totals.markup += markup; totals.venue += gross - markup;
  }
  return totals;
}
export class AddonSelectionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function quoteAddonChoices(sku: TicketAddonSkuLike | null, selections: unknown, ticketQuantity: number,
  legacyQuantity: unknown = 0, sold: Record<string, number> = {}): BookingAddonItem[] {
  const options = getTicketAddons(sku);
  const legacy = selections === undefined || selections === null;
  const requested: AddonSelection[] = legacy
    ? options.length ? [{ id: options[0].id, quantity: clampAddonQuantity(legacyQuantity, ticketQuantity, sku, sold[options[0].id] || 0) }] : []
    : selections as AddonSelection[];
  if (!Array.isArray(requested) || requested.length > 20) throw new AddonSelectionError('Choose up to 20 available add-ons.');
  const ids = new Set<string>();
  return requested.flatMap(selection => {
    if (!selection || typeof selection.id !== 'string' || ids.has(selection.id)) throw new AddonSelectionError('Invalid or repeated add-on selection.');
    ids.add(selection.id);
    const option = options.find(item => item.id === selection.id);
    if (!option) throw new AddonSelectionError('This add-on is no longer offered on the selected ticket.');
    const quantity = Number(selection.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > ticketQuantity) throw new AddonSelectionError('Choose at most one of each add-on per attendee.');
    if (quantity === 0) return [];
    if (option.inventory > 0 && quantity > Math.max(0, option.inventory - (sold[option.id] || 0))) {
      throw new AddonSelectionError(`${option.name} does not have enough stock for this selection.`, 409);
    }
    return [{ id: option.id, name: option.name, unitPrice: option.unitPrice, quantity,
      total: Math.round(option.unitPrice * quantity * 100) / 100, venueAmount: option.venueAmount,
      ...(option.venuePriced ? { markup: Math.max(0, round2(option.unitPrice - option.venueAmount)) } : {}) }];
  });
}
export function bookingAddonFields(items: BookingAddonItem[]) {
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  return { addonItems: items, addonName: items.length === 1 ? items[0].name : items.length ? items.map(item => `${item.name} × ${item.quantity}`).join(', ') : null,
    addonUnitPrice: (items.length === 1 ? items[0].unitPrice : 0).toFixed(2), addonQuantity: quantity, addonTotal: total.toFixed(2) };
}
// Stripe limits each metadata value to 500 characters. Chunk the immutable
// purchase details; no buyer-provided prices enter this snapshot.
export function addonMetadata(items: BookingAddonItem[]): Record<string, string> {
  // The markup is a seventh entry, and only where there is one, so a quote
  // written before it existed still reads back as exactly what was written.
  const json = JSON.stringify(items.map(item => [item.id, item.name, item.unitPrice, item.quantity, item.total, item.venueAmount,
    ...(isSet(item.markup) ? [item.markup] : [])]));
  const chunks: string[] = [];
  let chunk = '';
  for (const character of json) {
    if (chunk.length + character.length > 450) { chunks.push(chunk); chunk = ''; }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  if (chunks.length > 20) throw new AddonSelectionError('Too many add-on details for one checkout.');
  return { addonItemsCount: String(chunks.length), ...Object.fromEntries(chunks.map((chunk, i) => [`addonItems_${i}`, chunk])) };
}
export function addonItemsFromMetadata(metadata: Record<string, string> = {}): BookingAddonItem[] | null {
  if (!metadata.addonItemsCount) return null;
  const count = Number(metadata.addonItemsCount);
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new AddonSelectionError('Invalid saved add-on details.');
  const entries = JSON.parse(Array.from({ length: count }, (_, i) => metadata[`addonItems_${i}`] || '').join(''));
  if (!Array.isArray(entries) || entries.length > 20) throw new AddonSelectionError('Invalid saved add-on details.');
  return entries.map(([id, name, unitPrice, quantity, total, venueAmount, markup]: any[]) => {
    if (typeof id !== 'string' || typeof name !== 'string' || ![unitPrice, quantity, total, venueAmount].every(Number.isFinite)
      || !Number.isInteger(quantity) || quantity <= 0 || unitPrice < 0 || total < 0
      || Math.round(unitPrice * quantity * 100) !== Math.round(total * 100)) throw new AddonSelectionError('Invalid saved add-on price.');
    if (markup === undefined || markup === null) return { id, name, unitPrice, quantity, total, venueAmount };
    if (!Number.isFinite(markup) || markup < 0 || markup > unitPrice + 0.005) throw new AddonSelectionError('Invalid saved add-on price.');
    return { id, name, unitPrice, quantity, total, venueAmount, markup };
  });
}
export function parseAddonSelections(value: string | null): AddonSelection[] {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter(x => x && typeof x.id === 'string' && Number.isInteger(x.quantity) && x.quantity > 0).slice(0, 20) : []; }
  catch { return []; }
}
