import { describe, expect, it, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';

// The Share button's link. Good Soles copied it from their own event and
// pasted it into their WhatsApp community, and every member landed on
// /event/<slug>: a leftover invite page with no photos, itinerary, partners or
// booking box. The link opens the full event page now, and carries a referral
// code that booking actually recognises — not the sharer's user id.

const experience = { id: 'exp-5k', slug: 'good-soles-sunday-social-5k', title: 'Sunday Social 5k', creatorId: 'goodsoles' };

function inviteLink(userId: string) {
  const storage = {
    getExperience: vi.fn(async (id: string) => (id === 'exp-5k' ? experience : null)),
    ensureUserReferralCode: vi.fn(async (id: string) => `P${id.toUpperCase()}`),
  };
  const route = routeFunction('/api/experiences/:id/invite-link', {
    storage,
    getAppBaseUrl: () => 'https://www.greatexperiences.ai',
    publicExperienceSlugOrId: (e: any) => String(e?.slug || e?.id || ''),
  }, 'get');
  return { route, storage };
}

async function ask(userId: string, id = 'exp-5k') {
  const { route, storage } = inviteLink(userId);
  const response = routeResponse();
  await route({ params: { id }, user: { claims: { sub: userId } } }, response);
  return { response, storage };
}

describe("the Share button's link", () => {
  it('opens the full event page, not the old half-page invite', async () => {
    const { response } = await ask('ana');
    expect(response.statusCode).toBe(200);
    expect(response.body.inviteLink).toMatch(/^https:\/\/www\.greatexperiences\.ai\/experience\/good-soles-sunday-social-5k\?/);
    expect(response.body.inviteLink).not.toContain('/event/');
  });

  it('carries a real referral code for a participant who shares it', async () => {
    const { response, storage } = await ask('ana');
    expect(storage.ensureUserReferralCode).toHaveBeenCalledWith('ana');
    expect(response.body.inviteLink).toBe('https://www.greatexperiences.ai/experience/good-soles-sunday-social-5k?ref=PANA');
    expect(response.body.referralCode).toBe('PANA');
  });

  it("gives the organiser a plain link to their own event, with no referral to themselves", async () => {
    const { response, storage } = await ask('goodsoles');
    expect(storage.ensureUserReferralCode).not.toHaveBeenCalled();
    expect(response.body.inviteLink).toBe('https://www.greatexperiences.ai/experience/good-soles-sunday-social-5k');
    expect(response.body.referralCode).toBeNull();
  });

  it('still answers 404 for an event that does not exist', async () => {
    const { response } = await ask('ana', 'nope');
    expect(response.statusCode).toBe(404);
  });
});
