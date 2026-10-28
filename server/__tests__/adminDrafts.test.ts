import { describe, expect, it, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import { adminDraftItems } from '../adminDrafts';
import { venueSubmitProblems } from '@shared/venueSubmitReadiness';

// Tim could see that people had made an account, never what they had started:
// a draft is invisible until its owner submits it. Admins now see every
// unfinished listing and can finish it for the owner, as the owner.

const completeVenue = {
  id: 'v-saga', name: 'SAGA Coffee', city: 'Barcelona', description: 'd'.repeat(300), capacity: 69,
  location: 'Carrer Villarroel 259, Barcelona', createdBy: 'owner-saga', status: 'draft', updatedAt: '2026-10-22T05:37:00Z',
};

describe('the drafts list', () => {
  const rows = {
    events: [
      { draft: { id: 'd1', title: 'Sunset run', creatorId: 'luca', updatedAt: '2026-10-25T10:00:00Z', concept: { idea: true } },
        ownerFirstName: 'Luca', ownerLastName: 'R', ownerEmail: 'luca@example.test' },
      { draft: { id: 'd2', title: '', creatorId: 'ana', updatedAt: '2026-10-01T10:00:00Z' }, ownerEmail: 'ana@example.test' },
    ],
    venues: [
      { venue: completeVenue, ownerFirstName: 'Marta', ownerLastName: null, ownerEmail: 'marta@saga.test' },
      { venue: { id: 'v2', name: 'Untitled venue', city: '', description: '', capacity: 1, location: '', createdBy: 'x', updatedAt: '2026-10-21T01:14:58Z' } },
    ],
  };
  const items = adminDraftItems(rows as any, (draft) => (draft.title ? ['Please add a cover photo'] : ['Please add a title', 'Please add a date', 'Please add a price']));

  it('lists event and venue drafts together, most recently saved first', () => {
    expect(items.map((item) => item.id)).toEqual(['d1', 'v-saga', 'v2', 'd2']);
  });

  it('says who owns each one', () => {
    expect(items.find((item) => item.id === 'd1')).toMatchObject({ ownerName: 'Luca R', ownerEmail: 'luca@example.test', isIdea: true });
    expect(items.find((item) => item.id === 'd2')!.ownerName).toBe('ana@example.test');
  });

  it('says what is missing, or that it is ready', () => {
    expect(items.find((item) => item.id === 'd1')).toMatchObject({ ready: false, missing: ['Please add a cover photo'] });
    expect(items.find((item) => item.id === 'v-saga')).toMatchObject({ ready: true, missing: [] });
  });

  it('marks drafts with nothing in them, so they can be hidden', () => {
    expect(items.filter((item) => item.isEmpty).map((item) => item.id)).toEqual(['v2', 'd2']);
  });

  it('opens each in the normal builder or venue form', () => {
    expect(items.find((item) => item.id === 'd1')!.openUrl).toBe('/event-builder/d1');
    expect(items.find((item) => item.id === 'v-saga')!.openUrl).toBe('/venue/setup?edit=v-saga');
  });

  it('is for admins only', async () => {
    const route = routeFunction('/api/admin/drafts', {
      storage: { getAdminDrafts: async () => ({ events: [], venues: [] }) },
      checkIsAdmin: async () => false, adminDraftItems, validateDraftForPublication: () => ({ errors: [] }),
    }, 'get');
    const response = routeResponse();
    await route({}, response);
    expect(response.statusCode).toBe(403);
  });
});

describe('an admin finishing someone else\'s event draft', () => {
  const draft = { id: 'd1', creatorId: 'luca', title: 'Sunset run' };

  it('can open it; another organiser cannot', async () => {
    const open = async (admin: boolean) => {
      const route = routeFunction('/api/experience-drafts/:id', {
        storage: { getExperienceDraftById: async () => draft }, checkIsAdmin: async () => admin,
      }, 'get');
      const response = routeResponse();
      await route({ params: { id: 'd1' }, user: { claims: { sub: 'tim' } } }, response);
      return response.statusCode;
    };
    expect(await open(true)).toBe(200);
    expect(await open(false)).toBe(403);
  });

  it('saves it as the owner, so it stays theirs', async () => {
    const updateExperienceDraft = vi.fn(async (_id: string, _owner: string, data: any) => data);
    const route = routeFunction('/api/experience-drafts/:id', {
      storage: { getExperienceDraftById: async () => draft, updateExperienceDraft },
      checkIsAdmin: async () => true,
      normalizeGreatPillarsPayload: (v: any) => v, normalizeTicketSkus: (v: any) => v,
      sanitiseConcept: (v: any) => v, sanitizeDraftNumerics: (v: any) => v,
    }, 'put');
    await route({ params: { id: 'd1' }, user: { claims: { sub: 'tim' } }, body: { title: 'Sunset run 5k' } }, routeResponse());
    expect(updateExperienceDraft.mock.calls[0][1]).toBe('luca');
  });

  it('submits it in the owner\'s name', async () => {
    const buildExperienceFromBuilderPayload = vi.fn((_d: any, owner: string) => ({ title: 'Sunset run', creatorId: owner }));
    const syncPartnersForExperience = vi.fn(async () => {});
    const deleteExperienceDraft = vi.fn(async () => {});
    const route = routeFunction('/api/experience-drafts/:id/publish', {
      storage: {
        getExperienceDraftById: async () => draft,
        createExperience: async (data: any) => ({ id: 'e1', ...data }),
        deleteExperienceDraft,
      },
      resolveCurrentUserId: () => 'tim',
      checkIsAdmin: async () => true,
      validateDraftForPublication: () => ({ isValid: true, errors: [] }),
      buildExperienceFromBuilderPayload,
      resolveUniqueExperienceSlug: async () => 'sunset-run',
      logUntrackedVenueDeal: () => {},
      syncBuilderParticipantRoles: async () => {},
      syncPartnersForExperience,
      notifyCreatorEventSubmittedForReview: async () => {},
      getAppBaseUrl: () => 'https://great',
    }, 'post');
    const response = routeResponse();
    await route({ params: { id: 'd1' }, body: {} }, response);
    expect(response.statusCode).toBe(201);
    expect(buildExperienceFromBuilderPayload.mock.calls[0][1]).toBe('luca');
    expect(syncPartnersForExperience.mock.calls[0][1]).toBe('luca');
    expect(deleteExperienceDraft).toHaveBeenCalledWith('d1', 'luca');
  });

  it('still refuses a non-admin publishing someone else\'s draft', async () => {
    const route = routeFunction('/api/experience-drafts/:id/publish', {
      storage: { getExperienceDraftById: async () => draft },
      resolveCurrentUserId: () => 'someone', checkIsAdmin: async () => false,
    }, 'post');
    const response = routeResponse();
    await route({ params: { id: 'd1' }, body: {} }, response);
    expect(response.statusCode).toBe(403);
  });
});

describe('an admin submitting a venue for its owner', () => {
  it('is allowed for a finished venue', async () => {
    const updateVenue = vi.fn(async (_id: string, data: any) => ({ ...completeVenue, ...data }));
    const route = routeFunction('/api/venues/:id/submit', {
      storage: { getVenue: async () => completeVenue, updateVenue }, venueSubmitProblems, checkIsAdmin: async () => true,
    }, 'patch');
    const response = routeResponse();
    await route({ params: { id: 'v-saga' }, user: { claims: { sub: 'tim' } } }, response);
    expect(response.statusCode).toBe(200);
    expect(updateVenue.mock.calls[0][1]).toMatchObject({ status: 'pending' });
  });
});
