import { describe, it, expect } from 'vitest';
import { quoteAddonChoices, bookingAddonFields, addonMetadata, addonItemsFromMetadata } from './addonChoices';
import { summariseTicketRevenue } from './ticketRevenue';

const sku = { id: 'free-rsvp', pricingMode: 'free_rsvp', pricePerPerson: 0, ticketCapacity: 80, addonEnabled: true,
  addons: [
    { id: 'latte', addonName: 'Latte + loaf', addonVenuePrice: 7.45, addonChargeAmount: 7.45, addonInventory: 5 },
    { id: 'matcha', addonName: 'Matcha + loaf', addonVenuePrice: 7.75, addonChargeAmount: 8 },
  ] };
describe('several optional products on one RSVP', () => {
  it('prices each item on the server while counting one attendee', () => {
    const items = quoteAddonChoices(sku, [{ id: 'latte', quantity: 1, unitPrice: 0 }, { id: 'matcha', quantity: 1 }], 1);
    expect(items.map(i => i.total)).toEqual([7.45, 8]);
    expect(bookingAddonFields(items)).toMatchObject({ addonQuantity: 2, addonTotal: '15.45', addonItems: items });
    expect(summariseTicketRevenue([sku])).toMatchObject({ totalCapacity: 80, ticketGross: 0, addOnGross: 677.25 });
  });
  it('allows no extras without changing free entry', () => {
    expect(bookingAddonFields(quoteAddonChoices(sku, [], 1))).toMatchObject({ addonTotal: '0.00', addonQuantity: 0 });
  });
  it.each([
    [{ id: 'unknown', quantity: 1 }], [{ id: 'latte', quantity: 1 }, { id: 'latte', quantity: 1 }],
    [{ id: 'latte', quantity: -1 }], [{ id: 'latte', quantity: 2 }], [{ id: 'latte', quantity: 0.5 }],
  ])('rejects invalid selections %j', (...selection) => {
    expect(() => quoteAddonChoices(sku, selection, 1)).toThrow();
  });
  it('checks stock for each selected product', () => {
    expect(() => quoteAddonChoices(sku, [{ id: 'latte', quantity: 1 }], 1, 0, { latte: 5 })).toThrow('enough stock');
    expect(quoteAddonChoices(sku, [{ id: 'matcha', quantity: 1 }], 1, 0, { latte: 5 })).toHaveLength(1);
  });
  it('recovers the purchased lines after the event product list or prices change', () => {
    const items = quoteAddonChoices(sku, [{ id: 'latte', quantity: 1 }, { id: 'matcha', quantity: 1 }], 1);
    expect(addonItemsFromMetadata(addonMetadata(items))).toEqual(items);
    expect(addonItemsFromMetadata({})).toBeNull();
  });
  it('keeps long Unicode metadata within the payment-provider limit', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: 'Coffee ☕🏃'.repeat(10),
      unitPrice: 7.75, quantity: 1, total: 7.75, venueAmount: 7.75 }));
    const metadata = addonMetadata(items);
    expect(Object.values(metadata).every(value => value.length <= 500)).toBe(true);
    expect(addonItemsFromMetadata(metadata)).toEqual(items);
  });
  it('continues to support existing single add-on tickets', () => {
    expect(quoteAddonChoices({ addonEnabled: true, addonName: 'Coffee', addonPrice: 5.5 }, undefined, 1, 1))
      .toMatchObject([{ id: 'legacy', quantity: 1, unitPrice: 5.5 }]);
  });
});
