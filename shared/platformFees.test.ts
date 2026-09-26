import { describe, it, expect } from 'vitest';
import { eventFeeRates, bookingPlatformFeeCents, feeSnapshotFromMetadata, withoutEventFeeOverrides } from './platformFees';
import { calculateEventEconomics } from './eventEconomics';
import { validateExperienceVenueDeal } from './venueDealModels';
import { summarizeCreatorEarnings } from '../server/creatorEarnings';

describe('per-event platform fees', () => {
  it('starts at 15% entry and 0% extras and preserves explicit zero overrides', () => {
    expect(eventFeeRates()).toEqual({ ticketPlatformFeePct: 15, addonPlatformFeePct: 0 });
    expect(eventFeeRates({ ticketPlatformFeePct: '0', addonPlatformFeePct: '5' }))
      .toEqual({ ticketPlatformFeePct: 0, addonPlatformFeePct: 5 });
  });
  it.each([[0, 0, 1.55], [5, 0.39, 1.16], [15, 1.16, 0.39]])('agrees on a coffee sale at %i%%', (pct, fee, net) => {
    const booking = { status: 'fully_paid', totalPrice: '7.75', amount: '7.75', addonTotal: '7.75',
      ticketPlatformFeePct: 15, addonPlatformFeePct: pct,
      experience: { venueCompensationModel: 'revenue_share', venueRevenuePercentage: 80 } };
    const estimated = calculateEventEconomics({ ticketGross: 0, paidTickets: 0, addOnVenueGross: 7.75,
      platformPct: 15, addonPlatformPct: pct, venueDealModel: 'revenue_share', venueDealValue: 80 });
    expect(estimated.platformFee).toBe(fee);
    expect(estimated.net).toBe(net);
    expect(bookingPlatformFeeCents(booking)).toBe(Math.round(fee * 100));
    expect(summarizeCreatorEarnings([booking], { defaultPlatformFeePct: 15 }).summary.totalEarnings).toBe(net);
  });
  it('charges distinct rates on paid entry and extras, including deposits', () => {
    const booking = { totalPrice: 120, amount: 60, addonTotal: 20, ticketPlatformFeePct: 5, addonPlatformFeePct: 0 };
    expect(bookingPlatformFeeCents(booking)).toBe(500);
    expect(bookingPlatformFeeCents({ ...booking, isDepositOnly: true }, 15, true)).toBe(250);
  });
  it('preserves historical gross fees when payment metadata predates the change', () => {
    expect(bookingPlatformFeeCents({ totalPrice: 7.75, addonTotal: 7.75 })).toBe(116);
    expect(feeSnapshotFromMetadata({})).toEqual({ ticketPlatformFeePct: 15, addonPlatformFeePct: 15 });
    expect(feeSnapshotFromMetadata({ ticketPlatformFeePct: '5', addonPlatformFeePct: '0' }))
      .toEqual({ ticketPlatformFeePct: 5, addonPlatformFeePct: 0 });
  });
  it('does not let ordinary event saves set admin rates', () => {
    expect(withoutEventFeeOverrides({ title: 'Run', ticketPlatformFeePct: 0, addonPlatformFeePct: 0,
      platformFeesUpdatedBy: 'attacker', platformFeesUpdatedAt: new Date() })).toEqual({ title: 'Run' });
  });
  it('validates an add-on-only split using its own fee, not the entry fee', () => {
    const input = { venueType: 'catalog', selectedVenueId: 'venue', venueCompensationModel: 'revenue_share',
      venueRevenueSharePct: 90, ticketPlatformFeePct: 15, addonPlatformFeePct: 0,
      ticketSkus: [{ pricingMode: 'free_rsvp', pricePerPerson: 0, ticketCapacity: 10,
        addonEnabled: true, addonName: 'Coffee', addonVenuePrice: 7.75 }] };
    expect(validateExperienceVenueDeal(input)).toEqual([]);
    expect(validateExperienceVenueDeal({ ...input, addonPlatformFeePct: 15 })[0]).toContain('more than');
  });
});
