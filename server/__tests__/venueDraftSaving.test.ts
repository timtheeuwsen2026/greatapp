import { describe, expect, it, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import { extendedInsertVenueSchema } from '@shared/schema';
import { venueSubmitProblems } from '@shared/venueSubmitReadiness';
import { venueDraftUpdate } from '../venueDraftSave';

// Venues reported that the listing form "saved nothing" after the first save:
// every later save of an unfinished listing failed the full venue schema and
// was refused, and Submit never sent what had been typed.

const draftVenue = {
  id: 'v1', status: 'draft', createdBy: 'owner', slug: 'untitled-venue', name: 'Untitled venue', city: '',
  description: '', venueType: 'daytime', capacity: 1, location: '', standingCapacity: null, seatedCapacity: null,
};

function putRoute(existing: Record<string, any>) {
  const storage = {
    getVenue: vi.fn(async () => existing),
    updateVenue: vi.fn(async (_id: string, data: any) => ({ ...existing, ...data })),
  };
  const route = routeFunction('/api/venues/:id', {
    storage, extendedInsertVenueSchema, venueDraftUpdate,
    checkIsAdmin: async () => false,
    repriceAddonsFromVenueCatalog: vi.fn(),
  }, 'put');
  return { route, storage };
}

async function put(existing: Record<string, any>, body: Record<string, any>) {
  const { route, storage } = putRoute(existing);
  const response = routeResponse();
  await route({ params: { id: 'v1' }, user: { claims: { sub: 'owner' } }, body }, response);
  return { response, storage };
}

describe('saving an unfinished venue listing', () => {
  it('saves a draft whose description and address are not finished yet', async () => {
    const { response, storage } = await put(draftVenue, {
      name: '  Casa Bonita ', city: 'Barcelona', description: 'Cosy cafe', location: '', capacity: 40, website: '',
    });
    expect(response.statusCode).toBe(200);
    const saved = storage.updateVenue.mock.calls[0][1];
    expect(saved).toMatchObject({ city: 'Barcelona', description: 'Cosy cafe', location: '', capacity: 40 });
    // Fields that pass still get the schema's clean-up.
    expect(saved.name).toBe('Casa Bonita');
  });

  it('keeps a draft savable while it still has no name', async () => {
    const { response, storage } = await put(draftVenue, { name: '', description: 'x' });
    expect(response.statusCode).toBe(200);
    expect(storage.updateVenue.mock.calls[0][1].name).toBe('Untitled venue');
  });

  it('saves a rejected venue being fixed the same way', async () => {
    const { response } = await put({ ...draftVenue, status: 'rejected' }, { description: 'Shorter now' });
    expect(response.statusCode).toBe(200);
  });

  it('still refuses to blank out a listed venue, and says why in words', async () => {
    const listed = { ...draftVenue, status: 'approved', name: 'Casa', city: 'Barcelona', description: 'd'.repeat(60), location: 'Carrer 1, Barcelona', capacity: 40 };
    const { response, storage } = await put(listed, { description: 'too short' });
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain('Description must be at least 50 characters');
    expect(storage.updateVenue).not.toHaveBeenCalled();
  });
});

describe('the draft update itself', () => {
  it('drops an invalid non-text value instead of failing the whole save', () => {
    const payload = { name: 'Casa', city: 'Barcelona', description: 'short', location: '', capacity: '30', website: 'not a url' };
    const parsed = extendedInsertVenueSchema.partial().safeParse(payload);
    expect(parsed.success).toBe(false);
    const data = venueDraftUpdate(payload, (parsed as any).error.issues);
    expect(data.description).toBe('short');
    expect(data.location).toBe('');
    expect(data.capacity).toBe(30);
    expect(data).not.toHaveProperty('website');
  });

  it('falls back to 0 people when capacity is blank, as the first save does', () => {
    const payload = { capacity: '' };
    const parsed = extendedInsertVenueSchema.partial().safeParse(payload);
    expect(venueDraftUpdate(payload, (parsed as any).error.issues).capacity).toBe(0);
  });
});

describe('submitting a venue for review', () => {
  function submitRoute(venue: Record<string, any>) {
    const storage = {
      getVenue: vi.fn(async () => venue),
      updateVenue: vi.fn(async (_id: string, data: any) => ({ ...venue, ...data })),
    };
    return { storage, route: routeFunction('/api/venues/:id/submit', { storage, venueSubmitProblems }, 'patch') };
  }

  it('refuses an unfinished venue with a list of what is missing', async () => {
    const { route, storage } = submitRoute(draftVenue);
    const response = routeResponse();
    await route({ params: { id: 'v1' }, user: { claims: { sub: 'owner' } } }, response);
    expect(response.statusCode).toBe(400);
    expect(response.body.errors).toEqual([
      "Add your venue's name.", 'Add the city.', 'Write a description of at least 50 characters.', 'Add the full address.',
    ]);
    expect(storage.updateVenue).not.toHaveBeenCalled();
  });

  it('submits a complete venue', async () => {
    const complete = { ...draftVenue, name: 'Casa', city: 'Barcelona', description: 'd'.repeat(60), location: 'Carrer 1, Barcelona', capacity: 40 };
    const { route, storage } = submitRoute(complete);
    const response = routeResponse();
    await route({ params: { id: 'v1' }, user: { claims: { sub: 'owner' } } }, response);
    expect(response.statusCode).toBe(200);
    expect(storage.updateVenue.mock.calls[0][1]).toMatchObject({ status: 'pending' });
  });
});

describe('what a venue needs before review', () => {
  it('treats the draft placeholder name as no name', () => {
    expect(venueSubmitProblems({ name: 'Untitled venue', city: 'B', description: 'd'.repeat(50), capacity: 5, location: 'Street 1' }))
      .toEqual(["Add your venue's name."]);
  });

  it('needs at least one person of capacity', () => {
    expect(venueSubmitProblems({ name: 'Casa', city: 'B', description: 'd'.repeat(50), capacity: 0, location: 'Street 1' }))
      .toEqual(['Add how many people fit.']);
  });
});

describe('an admin approving a venue', () => {
  function adminRoute(venue: Record<string, any>) {
    const storage = {
      getVenue: vi.fn(async () => venue),
      approveVenue: vi.fn(async () => ({ ...venue, status: 'approved' })),
      rejectVenue: vi.fn(),
    };
    const route = routeFunction('/api/admin/venues/:id', {
      storage, venueSubmitProblems, checkIsAdmin: async () => true, stripVenuePricing: (v: any) => v,
    }, 'patch');
    return { route, storage };
  }
  const complete = { ...draftVenue, name: 'SAGA Coffee', city: 'Barcelona', description: 'd'.repeat(300), location: 'Carrer Villarroel 259, Barcelona', capacity: 69 };

  it('approves a finished draft the owner could not submit', async () => {
    const { route, storage } = adminRoute(complete);
    const response = routeResponse();
    await route({ params: { id: 'v1' }, body: { status: 'approved' } }, response);
    expect(response.statusCode).toBe(200);
    expect(storage.approveVenue).toHaveBeenCalledWith('v1');
  });

  it('will not approve an unfinished draft, and says what is missing', async () => {
    const { route, storage } = adminRoute(draftVenue);
    const response = routeResponse();
    await route({ params: { id: 'v1' }, body: { status: 'approved' } }, response);
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain('Add the city.');
    expect(storage.approveVenue).not.toHaveBeenCalled();
  });

  it('approves a submitted venue as before', async () => {
    const { route, storage } = adminRoute({ ...draftVenue, status: 'pending' });
    const response = routeResponse();
    await route({ params: { id: 'v1' }, body: { status: 'approved' } }, response);
    expect(storage.approveVenue).toHaveBeenCalled();
  });
});
