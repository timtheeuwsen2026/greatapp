import { describe, expect, it } from 'vitest';
import { acceptedPartnerCommissionPct, maximumPartnerCommissionPct, partnerMemberDiscount, partnerShareUrl } from './partnerPromotion';
import { sanitisePartnerEntry, validatePartnerEntry, dealTypesForPartnerType } from './eventPartners';
import { discountAmountForUnitPrice } from './discountLinks';
import { newExternalVenueFields, savedVenueInviteTerms, venueInviteTerms } from './venueInviteTerms';
import { formatVenueDealSummary } from './venueDealModels';

describe('partner-specific deals', () => {
  it.each(['community', 'affiliate', 'sponsor_brand', 'service_provider'])('offers and pays commission for %s', partnerType => {
    expect(dealTypesForPartnerType(partnerType).map(d => d.id)).toContain('commission_per_ticket');
    const deal = { partnerType, dealType: 'commission_per_ticket', status: 'accepted', experienceId: 'event', partnerId: 'partner', terms: { commissionPct: 12 } };
    expect(acceptedPartnerCommissionPct(deal, 'event', 'partner')).toBe(12);
    expect(acceptedPartnerCommissionPct(deal, 'other-event', 'partner')).toBe(0);
    expect(acceptedPartnerCommissionPct(deal, 'event', 'other-partner')).toBe(0);
    expect(acceptedPartnerCommissionPct({ ...deal, status: 'pending' }, 'event', 'partner')).toBe(0);
  });
  it('never sums mutually exclusive referral rates in forecasts', () => {
    expect(maximumPartnerCommissionPct([10, 20, 30].map(commissionPct => ({ dealType: 'commission_per_ticket', terms: { commissionPct } })))).toBe(30);
  });
  it('gives all partner types a real member discount after acceptance', () => {
    for (const partnerType of ['community', 'affiliate', 'sponsor_brand', 'service_provider']) {
      const entry = sanitisePartnerEntry({ id: 'club', name: 'Club', partnerType, dealType: 'member_discount', terms: { discountPct: 20, commissionPct: 99 } })!;
      expect(validatePartnerEntry(entry)).toEqual([]);
      expect(entry.terms.commissionPct).toBeUndefined();
      expect(partnerMemberDiscount({ ...entry, status: 'invited' })).toBeNull();
      const discount = partnerMemberDiscount({ ...entry, partnerName: 'Club', status: 'confirmed' });
      expect(discountAmountForUnitPrice(discount, 25)).toBe(5);
      expect(acceptedPartnerCommissionPct({ ...entry, status: 'accepted' }, 'event', 'partner')).toBe(0);
    }
  });
  it('combines attribution and member discount in one shareable link', () => {
    const url = new URL(partnerShareUrl('https://great.test', 'run-swim-run', 'club', 'private-share', 'member-token')!);
    expect(Object.fromEntries(url.searchParams)).toEqual({ ref: 'club', share: 'private-share', discount: 'member-token' });
    expect(partnerShareUrl('https://great.test', 'event', 'club', null)).toBeNull();
  });
});

describe('external venue proposal', () => {
  it('starts a different venue with empty identity, contact and address fields', () => {
    const next = { manualVenueName: 'Boga', manualVenueAddress: 'Old address', manualVenueEmail: 'old@example.test', venueTargetDeal: 'venue_barter', ...newExternalVenueFields() };
    expect(next.manualVenueName).toBe(''); expect(next.manualVenueAddress).toBe(''); expect(next.manualVenueEmail).toBe('');
    expect(next.venueTargetDeal).toBe('venue_barter');
  });
  it('carries the barter description without an old monetary value', () => {
    const terms = venueInviteTerms({ venueTargetDeal: 'venue_barter', venueTargetDealValue: 20, venueBarterTerms: 'Bag drop and changing space', currency: 'eur' });
    expect(terms).toEqual({ currency: 'eur', barterTerms: 'Bag drop and changing space' });
    expect(formatVenueDealSummary('venue_barter', terms)).toBe('Barter — no money exchanged · Bag drop and changing space');
  });
  it('preserves both commitment fee and revenue share in the saved proposal', () => {
    const terms = venueInviteTerms({ venueTargetDeal: 'commitment_plus_revenue_share', venueTargetDealValue: 20, venueCommitmentFee: 100 });
    expect(savedVenueInviteTerms({ proposedModel: 'commitment_plus_revenue_share', proposedTerms: terms })).toEqual({ currency: 'eur', revenueSharePct: 20, commitmentFee: 100 });
  });
});
