import { it, expect, vi } from 'vitest';
import { routeFunction } from '../../tests/routeHarness';
import { syncSkuAddonsWithCatalog } from '@shared/venueAddonPricing';
import { quoteAddonChoices } from '@shared/addonChoices';

const coffee = { id: 'coffee', addonName: 'Coffee', addonVenuePrice: 6.5, addonDiscountPct: 20,
  addonGroupRate: 5.2, addonMarkup: 0, addonChargeAmount: 5.2 };
const tickets = () => [{ id: 'rsvp', pricingMode: 'free_rsvp', pricePerPerson: 0, addonEnabled: true, addons: [{ ...coffee }] }];
const day = 24 * 60 * 60 * 1000;

function harness() {
  const events = [
    { id: 'upcoming', status: 'published', startDate: new Date(Date.now() + day), endDate: new Date(Date.now() + 2 * day), ticketSkus: tickets() },
    { id: 'finished', status: 'published', startDate: new Date(Date.now() - 2 * day), endDate: new Date(Date.now() - day), ticketSkus: tickets() },
    { id: 'called-off', status: 'cancelled', startDate: new Date(Date.now() + day), endDate: new Date(Date.now() + 2 * day), ticketSkus: tickets() },
    { id: 'no-addons', status: 'published', startDate: new Date(Date.now() + day), endDate: new Date(Date.now() + 2 * day),
      ticketSkus: [{ id: 'entry', pricePerPerson: 20 }] },
  ];
  const drafts = [{ id: 'draft', creatorId: 'organiser', ticketSkus: tickets() }];
  const storage = {
    getExperiencesByVenueIds: vi.fn(async () => events),
    getExperienceDraftsByVenue: vi.fn(async () => drafts),
    updateExperience: vi.fn(async (_id: string, _updates: any) => ({})),
    updateExperienceDraft: vi.fn(async (_id: string, _creatorId: string, _updates: any) => ({})),
  };
  return { storage, reprice: routeFunction('repriceAddonsFromVenueCatalog', { storage, syncSkuAddonsWithCatalog }) };
}

it('reprices upcoming events and drafts when a venue changes its retail price, and nothing else', async () => {
  const { storage, reprice } = harness();
  await reprice('venue', [{ id: 'coffee', name: 'Coffee', venuePrice: 7, discountPct: 20, active: true }]);

  expect(storage.getExperiencesByVenueIds).toHaveBeenCalledWith(['venue']);
  expect(storage.updateExperience).toHaveBeenCalledTimes(1);
  const [eventId, updates] = storage.updateExperience.mock.calls[0];
  expect(eventId).toBe('upcoming');
  // Only the tickets are written, so nothing else on a live event is disturbed.
  expect(Object.keys(updates)).toEqual(['ticketSkus']);
  // Checkout prices from the ticket, so this is what the next buyer is charged.
  expect(quoteAddonChoices(updates.ticketSkus[0], [{ id: 'coffee', quantity: 1 }], 1)[0])
    .toMatchObject({ unitPrice: 5.6, venueAmount: 5.6 });

  expect(storage.updateExperienceDraft).toHaveBeenCalledTimes(1);
  expect(storage.updateExperienceDraft.mock.calls[0].slice(0, 2)).toEqual(['draft', 'organiser']);
  expect(storage.updateExperienceDraft.mock.calls[0][2].ticketSkus[0].addons[0]).toMatchObject({ addonChargeAmount: 5.6 });
});

it('writes nothing when the venue saves its profile without changing a price', async () => {
  const { storage, reprice } = harness();
  await reprice('venue', [{ id: 'coffee', name: 'Coffee', venuePrice: 6.5, discountPct: 20, active: true }]);

  expect(storage.updateExperience).not.toHaveBeenCalled();
  expect(storage.updateExperienceDraft).not.toHaveBeenCalled();
});
