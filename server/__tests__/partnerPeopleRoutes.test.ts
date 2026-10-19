import { describe, expect, it, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import { partnerRowForViewer, summarisePartnerPeople } from '@shared/partnerPeople';

// Who a partner brought, as the organiser and as the partner see it — and the
// partner list, which handed one community every other community's email.

const experience = { id: 'yoga', creatorId: 'organiser', currency: 'eur', title: 'Yoga' };
const amunt = { id: 'p-amunt', experienceId: 'yoga', partnerName: 'AMUNT', partnerUserId: 'user-amunt', refCode: 'amunt-yoga',
  partnerEmail: 'hello@amunt.example', inviteToken: 'tok-amunt', status: 'confirmed', dealType: 'commission_per_ticket', terms: { commissionPct: 20 } };
const goodsoles = { id: 'p-gs', experienceId: 'yoga', partnerName: 'GoodSoles', partnerUserId: 'user-gs', refCode: 'gs-yoga',
  partnerEmail: 'team@goodsoles.example', inviteToken: 'tok-gs', status: 'confirmed', dealType: 'commission_per_ticket', terms: { commissionPct: 10 } };
const bookingsThroughAmunt = [
  { id: 'b1', firstName: 'Ana', lastName: 'López', ticketQuantity: 2, status: 'fully_paid', attendanceStatus: 'attended',
    commissionAmount: '14.00', commissionStatus: 'estimated', cancelledAt: null, createdAt: '2026-10-20T10:00:00Z' },
  { id: 'b2', firstName: 'Joan', lastName: 'Puig', ticketQuantity: 1, status: 'cancelled', attendanceStatus: 'unknown',
    commissionAmount: '7.00', commissionStatus: 'voided', cancelledAt: '2026-10-21T10:00:00Z', createdAt: '2026-10-19T10:00:00Z' },
];

function peopleRoute(viewer: string | null, { admin = false } = {}) {
  const storage = {
    getExperience: vi.fn(async (id: string) => (id === 'yoga' ? experience : null)),
    getExperiencePartner: vi.fn(async (id: string) => ({ 'p-amunt': amunt, 'p-gs': goodsoles, 'p-other': { ...amunt, id: 'p-other', experienceId: 'rave' } } as any)[id] ?? null),
    getPartnerReferralBookings: vi.fn(async (_experienceId: string, refCode: string) => (refCode === 'amunt-yoga' ? bookingsThroughAmunt : [])),
  };
  const route = routeFunction('/api/experiences/:id/partners/:partnerId/people', {
    storage, summarisePartnerPeople,
    resolveCurrentUserId: () => viewer,
    checkIsAdmin: async () => admin,
  }, 'get');
  return { route, storage };
}

async function ask(viewer: string | null, partnerId: string, options?: { admin?: boolean }) {
  const { route } = peopleRoute(viewer, options);
  const response = routeResponse();
  await route({ params: { id: 'yoga', partnerId } }, response);
  return response;
}

describe('who a partner brought', () => {
  it('shows the organiser full names, totals and the payout note', async () => {
    const response = await ask('organiser', 'p-amunt');
    expect(response.statusCode).toBe(200);
    expect(response.body.people.map((p: any) => p.name)).toEqual(['Ana López', 'Joan Puig']);
    expect(response.body.totals).toEqual({ tickets: 2, checkedIn: 2, dropped: 1, earned: 14, paid: 0 });
    expect(response.body.payoutNote).toBe('Paid after the event');
  });

  it('shows the partner their own people, with initials only', async () => {
    const response = await ask('user-amunt', 'p-amunt');
    expect(response.statusCode).toBe(200);
    expect(response.body.people.map((p: any) => p.name)).toEqual(['Ana L.', 'Joan P.']);
    expect(response.body.totals.earned).toBe(14);
  });

  it("refuses one partner another partner's people", async () => {
    expect((await ask('user-gs', 'p-amunt')).statusCode).toBe(403);
  });

  it('refuses anyone else', async () => {
    expect((await ask('stranger', 'p-amunt')).statusCode).toBe(403);
  });

  it('lets an admin see it as the organiser does', async () => {
    const response = await ask('admin-user', 'p-amunt', { admin: true });
    expect(response.statusCode).toBe(200);
    expect(response.body.people[0].name).toBe('Ana López');
  });

  it('does not answer for a partner who belongs to a different event', async () => {
    expect((await ask('organiser', 'p-other')).statusCode).toBe(404);
  });
});

describe('the partner list', () => {
  function listRoute(viewer: string) {
    return routeFunction('/api/experiences/:id/partners', {
      storage: {
        getExperience: async () => experience,
        getExperiencePartners: async () => [amunt, goodsoles],
        countPartnerReferralJoins: async () => new Map([['amunt-yoga', 2], ['gs-yoga', 1]]),
      },
      resolveCurrentUserId: () => viewer,
      checkIsAdmin: async () => false,
      eventPartnerShareLink: async (row: any) => `https://great/e/yoga?ref=${row.refCode}`,
      getAppBaseUrl: () => 'https://great',
      partnerDealLabel: () => 'Commission', partnerTypeLabel: () => 'Community', partnerTermSummary: () => '20%',
      partnerRowForViewer,
    }, 'get');
  }

  it("no longer gives one community the other community's email, account or link", async () => {
    const response = routeResponse();
    await listRoute('user-amunt')({ params: { id: 'yoga' } }, response);
    const theirs = response.body.find((r: any) => r.id === 'p-gs');
    const mine = response.body.find((r: any) => r.id === 'p-amunt');
    expect(JSON.stringify(theirs)).not.toContain('team@goodsoles.example');
    expect(theirs).not.toHaveProperty('refCode');
    expect(theirs).not.toHaveProperty('shareUrl');
    expect(theirs).toMatchObject({ partnerName: 'GoodSoles', joined: 1 });
    // Their own row keeps their link; no invite tokens for partners at all.
    expect(mine.shareUrl).toBe('https://great/e/yoga?ref=amunt-yoga');
    expect(JSON.stringify(response.body)).not.toContain('tok-');
  });

  it('still gives the organiser everything, invite tokens included', async () => {
    const response = routeResponse();
    await listRoute('organiser')({ params: { id: 'yoga' } }, response);
    expect(response.body.find((r: any) => r.id === 'p-gs')).toMatchObject({
      partnerEmail: 'team@goodsoles.example', inviteToken: 'tok-gs', refCode: 'gs-yoga',
    });
  });
});
