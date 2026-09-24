import { describe, expect, it } from 'vitest';
import { promotionDeals, promoterExperiences, discountLinks } from '@shared/schema';
import { connectPartnerPromotion } from '../partnerPromotionStorage';
import { calculateCommission } from '../commissionService';
import { acceptedPartnerCommissionPct } from '@shared/partnerPromotion';

function database() {
  const state = new Map<any, any[]>([[promotionDeals, []], [promoterExperiences, []], [discountLinks, []]]);
  const tx = {
    select: () => ({ from: (table: any) => ({ where: async () => state.get(table) || [] }) }),
    insert: (table: any) => ({ values: (value: any) => ({
      onConflictDoUpdate: async () => {
        const rows = state.get(table)!; const prior = rows.find(row => table === discountLinks ? row.discountId === value.discountId : row.id === value.id);
        if (prior) { const token = prior.token; Object.assign(prior, value); if (token) prior.token = token; } else rows.push(value);
      },
      returning: async () => { const row = { id: 'tracking-id', ...value }; state.get(table)!.push(row); return [row]; },
    }) }),
  };
  return { tx, state };
}

describe('accepted partner to shared commission engine', () => {
  it.each(['community', 'affiliate', 'sponsor_brand', 'service_provider'])('connects %s once and pays only its attributed tickets', async partnerType => {
    const { tx, state } = database();
    const row = { id: 'deal', experienceId: 'event', organizerId: 'creator', partnerUserId: 'partner', partnerType, partnerName: 'Partner', status: 'confirmed', dealType: 'commission_per_ticket', terms: { commissionPct: 15 } };
    const first = await connectPartnerPromotion(tx, row);
    const again = await connectPartnerPromotion(tx, row);
    expect(first.shareToken).toBe(again.shareToken);
    expect(state.get(promoterExperiences)).toHaveLength(1);
    const deal = state.get(promotionDeals)![0];
    const value = acceptedPartnerCommissionPct(deal, 'event', 'partner');
    // Two tickets at €20 attributed to this partner earn €6, regardless of other sales.
    expect(calculateCommission({ mode: 'percent', value, basis: 'per_spot' }, 20, 2, 40)).toBe(6);
    expect(acceptedPartnerCommissionPct(deal, 'event', 'different-partner')).toBe(0);
  });
  it('never connects an unaccepted partner or overwrites another accepted agreement', async () => {
    const { tx, state } = database();
    const row = { id: 'deal', experienceId: 'event', partnerUserId: 'partner', dealType: 'commission_per_ticket', status: 'invited' };
    expect(await connectPartnerPromotion(tx, row)).toBeNull();
    state.get(promoterExperiences)!.push({ id: 'other', promotionDealId: 'other-deal' });
    await expect(connectPartnerPromotion(tx, { ...row, status: 'confirmed' })).rejects.toThrow('different promotion agreement');
    expect(state.get(promotionDeals)).toHaveLength(0);
  });
  it('creates a stable member discount token using the existing checkout link table', async () => {
    const { tx, state } = database();
    const row = { id: 'deal', experienceId: 'event', partnerUserId: 'partner', dealType: 'member_discount', status: 'confirmed', terms: { discountPct: 20 } };
    await connectPartnerPromotion(tx, row);
    const token = state.get(discountLinks)![0].token;
    await connectPartnerPromotion(tx, row);
    expect(state.get(discountLinks)).toHaveLength(1);
    expect(state.get(discountLinks)![0].token).toBe(token);
  });
});
