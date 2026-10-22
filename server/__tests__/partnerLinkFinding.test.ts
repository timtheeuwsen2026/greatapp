import { describe, expect, it, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';

// Communities could not find their partner link: the invite page only said
// "Your link is on Partner Home", and the Affiliate Dashboard handed out a
// personal code that carried neither the deal nor the member discount.

const event = { id: 'rave', slug: 'juice-y-rave', title: 'Juice y Rave', startDate: null, location: 'Barcelona', coverImageUrl: null };
const raveOfTheDay = {
  id: 'p-rotd', experienceId: 'rave', organizerId: 'pedro', partnerName: 'Rave Of The Day', partnerType: 'community',
  partnerUserId: 'user-rotd', dealType: 'member_discount', terms: { discountPct: 10 }, status: 'confirmed', refCode: 'raveoftheday-c86a',
};
const partnerLink = 'https://great/experience/juice-y-rave?ref=raveoftheday-c86a&share=s1&discount=d1';

describe('the invite page, opened again after accepting', () => {
  async function open(viewer: string | null, row: Record<string, any> = raveOfTheDay) {
    const eventPartnerShareLink = vi.fn(async () => partnerLink);
    const route = routeFunction('/api/event-partner-invites/:token', {
      storage: {
        getExperiencePartnerByToken: async () => row,
        getExperience: async () => event,
        getUser: async () => ({ firstName: 'Pedro' }),
      },
      partnerTypeLabel: () => 'Community', partnerDealLabel: () => 'Member discount', partnerTermSummary: () => '10% off',
      resolveCurrentUserId: () => viewer,
      eventPartnerShareLink, getAppBaseUrl: () => 'https://great',
    }, 'get');
    const response = routeResponse();
    await route({ params: { token: 'tok' } }, response);
    return response;
  }

  it('gives the partner who accepted their own link', async () => {
    expect((await open('user-rotd')).body.partner.shareUrl).toBe(partnerLink);
  });

  it('does not give it to anyone else holding the invite link', async () => {
    expect((await open('someone-else')).body.partner.shareUrl).toBeNull();
    expect((await open(null)).body.partner.shareUrl).toBeNull();
  });

  it('has no link to give before the invite is accepted', async () => {
    expect((await open('user-rotd', { ...raveOfTheDay, status: 'invited' })).body.partner.shareUrl).toBeNull();
  });
});

describe('the Affiliate Dashboard link for an event partner', () => {
  async function list(promotionDeal: any = undefined) {
    const storage = {
      getUser: async () => ({ promoterCode: 'P7D967509' }),
      ensureUserReferralCode: async () => 'P7D967509',
      getPromoterExperiences: async () => [{
        promoterExperienceId: 'pe1', referralAudience: 'official_partner', promotionDealId: 'p-rotd', shareToken: 's1',
        experience: { ...event, status: 'published', requireMinimumParticipants: false },
      }],
      getPromotionDeal: async () => promotionDeal,
      getExperiencePartner: async (id: string) => (id === 'p-rotd' ? raveOfTheDay : undefined),
      getMVGProgress: async () => null,
    };
    const route = routeFunction('/api/promoter/experiences', {
      storage,
      resolvePromoterUserId: async () => 'user-rotd',
      resolveImpactAudience: async () => 'official_partner',
      getAppBaseUrl: () => 'https://great',
      buildPromoterReferralLink: (_b: string, slug: string, code: string) => `https://great/experience/${slug}?ref=${code}`,
      eventPartnerShareLink: async () => partnerLink,
      computeLifecycleStatus: () => 'live',
    }, 'get');
    const response = routeResponse();
    await route({}, response);
    return response.body;
  }

  it('is the same partner link Partner Home shows, member discount included', async () => {
    const [item] = await list();
    expect(item.referralLink).toBe(partnerLink);
  });

  it('keeps the personal link for an ordinary accepted creator deal', async () => {
    const [item] = await list({ id: 'deal-1', dealType: 'commission', terms: {} });
    expect(item.referralLink).toBe('https://great/experience/juice-y-rave?ref=P7D967509');
  });
});
