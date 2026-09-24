import { describe, expect, it, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import { venueInviteTerms } from '@shared/venueInviteTerms';

describe('live builder invitation updates', () => {
  it('refreshes the same venue proposal on each save without sending again', async () => {
    let event: any = { id: 'event', creatorId: 'creator', venueType: 'manual', manualVenueEmail: 'venue@example.test', venueTargetDeal: 'commitment_plus_revenue_share', venueTargetDealValue: 20 };
    const storage = {
      getExperience: vi.fn(async () => event),
      updateExperience: vi.fn(async (_id, updates) => (event = { ...event, ...updates })),
      upsertVenueInvite: vi.fn(async input => ({ ...input, token: 'same-token' })),
    };
    const createVenueInviteForExperience = routeFunction('createVenueInviteForExperience', {
      storage, venueInviteTerms, randomBytes: () => ({ toString: () => 'new-token' }), VENUE_INVITE_TTL_DAYS: 60,
    });
    const notificationService = { sendExternalVenueInvitation: vi.fn(async () => {}) };
    const syncPartnersForExperience = vi.fn(async () => {});
    const run = routeFunction('/api/experiences/:id/builder', {
      storage, createVenueInviteForExperience, notificationService, syncPartnersForExperience,
      resolveCurrentUserId: () => 'creator', checkIsAdmin: async () => false,
      validateDraftForPublication: () => ({ isValid: true }), buildExperienceFromBuilderPayload: (body: any) => body,
      buildAddonRequests: () => [], syncBuilderParticipantRoles: async () => {},
    }, 'put');
    const body = { ...event, venueTargetDeal: 'venue_barter', venueTargetDealValue: null, venueBarterTerms: 'Bag drop and changing, no money' };
    for (let i = 0; i < 2; i++) {
      const res = routeResponse(); await run({ params: { id: 'event' }, body }, res);
      expect(res.statusCode).toBe(200);
    }
    expect(storage.upsertVenueInvite).toHaveBeenCalledTimes(2);
    expect(storage.upsertVenueInvite.mock.calls[1][0]).toMatchObject({ proposedModel: 'venue_barter', proposedValue: null, proposedTerms: { barterTerms: 'Bag drop and changing, no money' } });
    expect(syncPartnersForExperience).toHaveBeenCalledTimes(2);
    expect(notificationService.sendExternalVenueInvitation).not.toHaveBeenCalled();
  });
});

describe('partner invite ownership and repeat responses', () => {
  it('rejects an unrelated account and does not re-notify on repeat acceptance', async () => {
    const row = { id: 'partner', organizerId: 'creator', partnerUserId: 'owner', status: 'confirmed' };
    const storage = { getExperiencePartnerByToken: vi.fn(async () => row), updateExperiencePartnerStatus: vi.fn() };
    for (const user of ['stranger', 'owner']) {
      const res = routeResponse();
      const run = routeFunction('/api/event-partner-invites/:token/respond', { storage, resolveCurrentUserId: () => user }, 'post');
      await run({ params: { token: 'token' }, body: { accept: true } }, res);
      expect(res.statusCode).toBe(user === 'owner' ? 200 : 403);
    }
    expect(storage.updateExperiencePartnerStatus).not.toHaveBeenCalled();
  });
  it('resolves an event partner code through its own accepted tracking record', async () => {
    const tracking = { id: 'tracking', experienceId: 'event', promoterId: 'community', promotionDealId: 'deal', shareToken: 'share' };
    const storage = {
      getExperience: async () => ({ id: 'event' }), getEventPartnerTracking: vi.fn(async () => tracking),
      getExperiencePartner: async () => ({ status: 'confirmed', partnerUserId: 'community', refCode: 'club-link' }),
      getUser: async () => ({ id: 'community', promoterCode: 'personal-code' }), recordReferralClick: vi.fn(async () => {}),
    };
    const run = routeFunction('/api/promoter-attribution', { storage }, 'post');
    const res = routeResponse();
    await run({ body: { referralCode: 'club-link', experienceId: 'event' }, headers: {}, socket: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ promoterId: 'community', shareToken: 'share', referralCode: 'club-link' });
    expect(storage.recordReferralClick).toHaveBeenCalledWith(expect.objectContaining({ promoterExperienceId: 'tracking', experienceId: 'event', promoterCode: 'club-link' }));
  });
});
