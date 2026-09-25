import { describe, it, expect } from 'vitest';
import { summariseTicketRevenue } from './ticketRevenue';
import { calculateEventEconomics, economicsAsFreeRsvp } from './eventEconomics';
import { summarizeCreatorEarnings } from '../server/creatorEarnings';
import { routeFunction } from '../tests/routeHarness';
import { validateExperienceVenueDeal } from './venueDealModels';

const coffee = {
  id: 'coffee', pricingMode: 'free_rsvp', pricePerPerson: 0, ticketCapacity: 80,
  addonEnabled: true, addonName: 'Iced Latte + Banana Loaf', addonVenuePrice: 7.75,
  addonChargeAmount: 7.75,
};
const inputFor = (skus = [coffee]) => {
  const summary = summariseTicketRevenue(skus);
  return {
    ticketGross: summary.ticketGross, paidTickets: summary.paidCapacity,
    addOnVenueGross: summary.addOnVenueGross, addOnCreatorGross: summary.addOnCreatorGross,
    platformPct: 15, venueDealModel: 'revenue_share', venueDealValue: 80,
  };
};

describe('free entry with a venue share of add-on sales', () => {
  it('shows gross sales even with no markup and agrees with existing earnings', () => {
    const result = calculateEventEconomics(inputFor());
    expect(result.lines.find(line => line.key === 'ticket_gross')?.amount).toBe(0);
    expect(result.lines.find(line => line.key === 'addon_gross')?.amount).toBe(620);
    expect(result.lines.find(line => line.key === 'addon_venue_payout')?.amount).toBe(-496);
    expect(result.platformFee).toBe(93);
    expect(result.net).toBe(31);
    expect(result.venueTicketCost).toBe(0);
    const actual = summarizeCreatorEarnings([{
      status: 'fully_paid', amount: '620', totalPrice: '620', ticketQuantity: 80,
      experience: { platformPct: 15, venueRevenuePercentage: 80, venueCompensationModel: 'revenue_share' },
    }], { defaultPlatformFeePct: 15 });
    expect(actual.summary.totalEarnings).toBe(result.net);
    expect(actual.summary.totalSpaceShare).toBe(result.addOnVenueRevenue);
  });

  it('increases the venue share when the selling price increases, without double charging unit costs', () => {
    const result = calculateEventEconomics(inputFor([{ ...coffee, addonChargeAmount: 10 }]));
    expect(result.addOnVenueRevenue).toBe(640);
    expect(result.net).toBe(40);
  });

  it('caps estimated add-on uptake at inventory, independently of free RSVPs', () => {
    const summary = summariseTicketRevenue([{ ...coffee, addonInventory: 32 }]);
    expect(summary.totalCapacity).toBe(80);
    expect(summary.addOnCapacity).toBe(32);
    expect(summary.addOnGross).toBe(248);
  });

  it('keeps percentage shares of add-ons when previewing paid tickets as free', () => {
    const input = { ...inputFor(), ticketGross: 400, paidTickets: 80 };
    const paid = calculateEventEconomics(input);
    const free = economicsAsFreeRsvp(input, 80, 80);
    expect(paid.venueTicketCost).toBe(320);
    expect(paid.addOnVenueRevenue).toBe(496);
    expect(free.venueTicketCost).toBe(0);
    expect(free.addOnVenueRevenue).toBe(496);
    expect(free.net).toBe(31);
  });

  it('keeps referral commission scoped to paid entry', () => {
    const result = calculateEventEconomics({ ...inputFor(), promoterCommissionPct: 10 });
    expect(result.lines.some(line => line.key === 'promoter_bounty')).toBe(false);
    expect(result.net).toBe(31);
  });

  it('preserves a below-cost loss for a unit-cost arrangement', () => {
    const result = calculateEventEconomics({ ...inputFor(), venueDealModel: 'fixed_fee', addOnVenueGross: 100, addOnCreatorGross: -20 });
    expect(result.lines.find(line => line.key === 'addon_gross')?.amount).toBe(80);
    expect(result.net).toBe(-20);
  });

  it('preserves add-on configuration when saving a free RSVP ticket', () => {
    const normalize = routeFunction('normalizeTicketSkus', {});
    expect(normalize([{ ...coffee, pricePerPerson: 10 }])[0]).toMatchObject(coffee);
  });

  it('validates affordability against paid extras even when entry is free', () => {
    const event = { venueType: 'catalog', selectedVenueId: 'coffee-shop',
      venueCompensationModel: 'revenue_share', venueRevenueSharePct: 80,
      platformPct: 15, ticketSkus: [coffee], maxParticipants: 80 };
    expect(validateExperienceVenueDeal(event)).toEqual([]);
    expect(validateExperienceVenueDeal({ ...event, venueRevenueSharePct: 90 })[0])
      .toContain('more than the event takes');
  });
});
