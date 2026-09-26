import { getTicketAddon, isAddonEnabled, clampAddonQuantity, type TicketAddonSkuLike, type TicketAddon } from './ticketAddons';

export type AddonSelection = { id: string; quantity: number };
export type BookingAddonItem = { id: string; name: string; unitPrice: number; quantity: number; total: number; venueAmount: number };
export type AddonOption = TicketAddon & { id: string; inventory: number };
export function getTicketAddons(sku: TicketAddonSkuLike | null | undefined): AddonOption[] {
  if (!sku || !isAddonEnabled(sku)) return [];
  const entries = Array.isArray(sku.addons) ? sku.addons : [{ ...sku, id: 'legacy' }];
  return entries.flatMap((entry, index) => {
    const addon = getTicketAddon({ ...entry, addons: undefined, addonEnabled: true });
    return addon ? [{ ...addon, id: String(entry.id || `addon-${index}`), inventory: Number(entry.addonInventory) || 0 }] : [];
  });
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
      total: Math.round(option.unitPrice * quantity * 100) / 100, venueAmount: option.venueAmount }];
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
  const json = JSON.stringify(items.map(item => [item.id, item.name, item.unitPrice, item.quantity, item.total, item.venueAmount]));
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
  return entries.map(([id, name, unitPrice, quantity, total, venueAmount]: any[]) => {
    if (typeof id !== 'string' || typeof name !== 'string' || ![unitPrice, quantity, total, venueAmount].every(Number.isFinite)
      || !Number.isInteger(quantity) || quantity <= 0 || unitPrice < 0 || total < 0
      || Math.round(unitPrice * quantity * 100) !== Math.round(total * 100)) throw new AddonSelectionError('Invalid saved add-on price.');
    return { id, name, unitPrice, quantity, total, venueAmount };
  });
}
export function parseAddonSelections(value: string | null): AddonSelection[] {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter(x => x && typeof x.id === 'string' && Number.isInteger(x.quantity) && x.quantity > 0).slice(0, 20) : []; }
  catch { return []; }
}
