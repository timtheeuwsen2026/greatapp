import { describe, expect, it, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import { summariseVenueSales } from '@shared/venueSales';

// A venue sees what sold for the events at its own venues, and nobody else's.

describe('the venue sales route', () => {
  function route(venues: any[]) {
    const storage = {
      getVenuesByCreator: vi.fn(async () => venues),
      getExperiencesByVenueIds: vi.fn(async (ids: string[]) => (ids.includes('v-bandido')
        ? [{ id: 'e1', title: 'Bandido 5k', linkedVenueId: 'v-bandido', startDate: '2099-11-01T07:00:00Z', status: 'published' }]
        : [])),
      getBookingsByVenueIds: vi.fn(async () => [{ experienceId: 'e1', status: 'fully_paid', ticketQuantity: 3 }]),
    };
    return { storage, run: routeFunction('/api/venue/sales', { storage, summariseVenueSales }, 'get') };
  }

  it('reports the events at the venue owner\'s own venues', async () => {
    const { storage, run } = route([{ id: 'v-bandido', name: 'Bandido Cafe' }]);
    const response = routeResponse();
    await run({ user: { claims: { sub: 'bandido-owner' } } }, response);
    expect(storage.getVenuesByCreator).toHaveBeenCalledWith('bandido-owner');
    expect(response.body).toEqual([expect.objectContaining({ experienceId: 'e1', venueName: 'Bandido Cafe', booked: 3, expected: 3 })]);
  });

  it('has nothing to show someone without a venue', async () => {
    const { storage, run } = route([]);
    const response = routeResponse();
    await run({ user: { claims: { sub: 'someone' } } }, response);
    expect(response.body).toEqual([]);
    expect(storage.getBookingsByVenueIds).not.toHaveBeenCalled();
  });
});
