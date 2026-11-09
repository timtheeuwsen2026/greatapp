import { eventFeeRates, bookingPlatformFeeCents } from "@shared/platformFees";
import { describe, expect, it, vi } from 'vitest';
import { routeFunction } from '../../tests/routeHarness';
import { isExperiencePayoutEligible, resolvePayoutGrossCents, sumBookingPayoutGrossCents, sumVenuePricedAddonCents, createChargeAllocator } from '../payoutRules';
import { sumBookingTicketQuantity, calculateTicketDeductionCents } from '@shared/ticketDeduction';

// Step 2 (Nov 2026): partners are paid from the event's own charges, nobody is
// paid twice, and the per-event list is the same arithmetic with no money moved.

const source = 'server/payout-scheduler.ts';
function harness(opts: { charges?: any[]; existing?: Record<string, string>; venueAccount?: string | null } = {}) {
  const experience = { id: 'coffee-event', title: 'Coffee run', creatorId: 'organizer',
    linkedVenueId: 'coffee-shop', venueCompensationModel: 'revenue_share', venueRevenueSharePct: 80,
    creatorPct: 85, currency: 'eur' };
  const storage = {
    getCreatorProfile: vi.fn(async () => ({ stripeAccountId: 'creator-account' })),
    getExperience: vi.fn(async () => experience),
    getSplitRecipientsByExperience: vi.fn(async (): Promise<any[]> => []),
    getOtherActivePayoutForExperience: vi.fn(async () => null),
    updateScheduledPayout: vi.fn(async () => {}),
    getScheduledPayoutById: vi.fn(async () => ({ stripeTransferIds: opts.existing ?? {} })),
    getUser: vi.fn(async () => null),
  };
  const venueAccount = opts.venueAccount === undefined ? 'venue-account' : opts.venueAccount;
  const resolveVenuePayoutAccount = vi.fn(async () => ({ stripeAccountId: venueAccount, userId: 'venue-owner' }));
  const buildDefaultRecipients = routeFunction('buildDefaultRecipients', { storage, resolveVenuePayoutAccount }, undefined, source);
  const calculateSplitAmount = routeFunction('calculateSplitAmount', {}, undefined, source);
  let whereCount = 0;
  const dbUpdate = vi.fn(() => ({ set: () => ({ where: async () => {} }) }));
  const db = { update: dbUpdate, select: () => ({ from: () => ({
    limit: async () => [{ platformFeePercentage: 15 }],
    where: async () => ++whereCount === 1
      ? [{ status: 'fully_paid', amount: '7.75', totalPrice: '7.75', ticketQuantity: 1, addonTotal: '7.75' }]
      : [],
  }) }) };
  const stripe = { transfers: { create: vi.fn(async (..._args: any[]) => ({ id: `tr_${Math.random().toString(36).slice(2, 6)}` })) } };
  const execute = routeFunction('executeExperiencePayout', {
    storage, db, stripe, buildDefaultRecipients, calculateSplitAmount, eventFeeRates, bookingPlatformFeeCents,
    isExperiencePayoutEligible, resolvePayoutGrossCents, sumBookingPayoutGrossCents,
    sumVenuePricedAddonCents, resolveVenuePayoutAccount, sumBookingTicketQuantity, calculateTicketDeductionCents,
    createChargeAllocator, chargeSourcesFor: async () => opts.charges ?? [], transferredForPayout: async () => 0,
    bookings: {}, platformSettings: {}, and: vi.fn(), eq: vi.fn(), inArray: vi.fn(), or: vi.fn(), isNull: vi.fn(),
    PAYABLE_BOOKING_STATUSES: ['confirmed', 'fully_paid', 'deposit_paid'],
    notificationService: { sendPayoutInitiatedEmail: vi.fn() },
  }, undefined, source);
  return { execute, storage, stripe, dbUpdate };
}

describe('Step 2 payouts', () => {
  it("links each transfer to the event's own charge, so the platform balance does not matter", async () => {
    const { execute, stripe } = harness({ charges: [{ chargeId: 'ch_ticket', availableCents: 775 }] });
    await execute('coffee-event', 'payout');
    expect(stripe.transfers.create.mock.calls.map(([t]: any[]) => [t.destination, t.amount, t.source_transaction]))
      .toEqual([['venue-account', 620, 'ch_ticket'], ['creator-account', 39, 'ch_ticket']]);
  });

  it('skips a share an admin marked paid manually, and still pays the others', async () => {
    const { execute, stripe, storage } = harness({ existing: { venue: 'manual: bank transfer 6 Nov' }, venueAccount: null });
    await execute('coffee-event', 'payout');
    expect(stripe.transfers.create.mock.calls.map(([t]: any[]) => t.destination)).toEqual(['creator-account']);
    expect(storage.updateScheduledPayout).toHaveBeenLastCalledWith('payout', expect.objectContaining({
      status: 'completed',
      stripeTransferIds: expect.objectContaining({ venue: 'manual: bank transfer 6 Nov' }),
    }));
  });

  it('works out who gets what without moving money or writing anything', async () => {
    const { execute, stripe, storage, dbUpdate } = harness({ venueAccount: null });
    const plan = await execute('coffee-event', 'payout', 0, 0, { dryRun: true });
    expect(plan).toMatchObject({ eligible: true, grossCents: 775, platformFeeCents: 116 });
    expect(plan.lines.map((line: any) => [line.recipientType, line.amountCents, line.accountReady]))
      .toEqual([['venue', 620, false], ['creator', 39, true]]);
    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(storage.updateScheduledPayout).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
  });
});
