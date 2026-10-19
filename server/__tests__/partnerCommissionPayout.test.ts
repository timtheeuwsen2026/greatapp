import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { routeFunction } from '../../tests/routeHarness';
import { eventFeeRates, bookingPlatformFeeCents } from '@shared/platformFees';
import { isExperiencePayoutEligible, resolvePayoutGrossCents, sumBookingPayoutGrossCents, sumVenuePricedAddonCents } from '../payoutRules';
import { sumBookingTicketQuantity, calculateTicketDeductionCents } from '@shared/ticketDeduction';

/**
 * A community sells tickets for an event and is owed its commission after the
 * event. Two things stopped that from happening:
 *
 *  - Commissions were only ever "locked" (made payable) when an event reached
 *    its minimum group. An event without one never locked them, and the payout
 *    pays locked commissions only — so the community was never paid.
 *  - A community without a verified payout account deferred the WHOLE event
 *    payout a day at a time, organiser included, for as long as it never
 *    connected one.
 *
 * Runs the real payout code with storage, the database and Stripe replaced.
 */

const source = 'server/payout-scheduler.ts';
const PAYABLE = ['confirmed', 'fully_paid', 'deposit_paid'];

// Column stand-ins and condition builders that keep their arguments, so a test
// can read back which rows a query or an update was aimed at.
const bookings = { experienceId: 'experienceId', commissionStatus: 'commissionStatus', status: 'status', id: 'id', promoterId: 'promoterId' };
const and = (...parts: any[]) => ({ and: parts });
const eq = (column: string, value: unknown) => ({ eq: [column, value] });
const inArray = (column: string, values: unknown[]) => ({ in: [column, values] });
const flat = (condition: any): any[] => (condition?.and ? condition.and.flatMap(flat) : [condition]);
const has = (condition: any, part: any) => flat(condition).some((p) => JSON.stringify(p) === JSON.stringify(part));

const yoga = {
  id: 'yoga', title: 'Immersive yoga', creatorId: 'organiser', currency: 'eur',
  creatorPct: 85, linkedVenueId: null, venueCompensationModel: null,
  requireMinimumParticipants: false, mvgEnabled: false, status: 'published',
};

/** One €35 ticket bought through AMUNT's link, 20% commission. */
const amuntBooking = {
  id: 'booking-1', experienceId: 'yoga', status: 'fully_paid', amount: '35', totalPrice: '35', ticketQuantity: 1,
  ticketPlatformFeePct: '15', addonPlatformFeePct: '0',
  promoterId: 'amunt', commissionAmount: '7.00', commissionStatus: 'locked',
};

function payoutHarness(promoterProfile: any) {
  const updates: Array<{ values: any; where: any }> = [];
  const selects: any[] = [];
  let selectCount = 0;
  const db = {
    update: () => ({ set: (values: any) => ({ where: async (where: any) => { updates.push({ values, where }); } }) }),
    select: () => ({ from: () => ({
      limit: async () => [{ platformFeePercentage: 15 }],
      where: async (where: any) => {
        selects.push(where);
        selectCount++;
        // 1st: the bookings that went through (gross). 2nd: locked commissions.
        return selectCount <= 2 ? [amuntBooking] : [];
      },
    }) }),
  };
  const storage = {
    getCreatorProfile: vi.fn(async () => ({ stripeAccountId: 'organiser-account' })),
    getExperience: vi.fn(async () => yoga),
    getSplitRecipientsByExperience: vi.fn(async (): Promise<any[]> => []),
    getOtherActivePayoutForExperience: vi.fn(async () => null),
    updateScheduledPayout: vi.fn(async () => {}),
    getUser: vi.fn(async () => null),
    getPromoterProfile: vi.fn(async () => promoterProfile),
  };
  const stripe = { transfers: { create: vi.fn(async (args: any) => ({ id: `tr_${args.destination}` })) } };
  const resolveVenuePayoutAccount = vi.fn(async () => ({ stripeAccountId: null, userId: null }));
  const buildDefaultRecipients = routeFunction('buildDefaultRecipients', { storage, resolveVenuePayoutAccount }, undefined, source);
  const calculateSplitAmount = routeFunction('calculateSplitAmount', {}, undefined, source);
  const execute = routeFunction('executeExperiencePayout', {
    storage, db, stripe, buildDefaultRecipients, calculateSplitAmount, eventFeeRates, bookingPlatformFeeCents,
    isExperiencePayoutEligible, resolvePayoutGrossCents, sumBookingPayoutGrossCents,
    sumVenuePricedAddonCents, resolveVenuePayoutAccount, sumBookingTicketQuantity, calculateTicketDeductionCents,
    bookings, platformSettings: {}, and, eq, inArray, PAYABLE_BOOKING_STATUSES: PAYABLE,
    notificationService: { sendPayoutInitiatedEmail: vi.fn(async () => {}) },
    formatPayoutAmount: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
  }, undefined, source);
  return { execute, db, stripe, storage, updates, selects };
}

const transfersOf = (stripe: any) => stripe.transfers.create.mock.calls.map(([t]: any[]) => [t.destination, t.amount]);

describe('the event payout and partner commissions', () => {
  it('makes commissions payable at payout, on the bookings that went through only', async () => {
    const { execute, updates, selects } = payoutHarness({ stripeAccountId: 'amunt-account', stripeVerificationStatus: 'verified' });
    await execute('yoga', 'payout-1');

    const lock = updates.find((u) => u.values.commissionStatus === 'locked');
    expect(lock).toBeDefined();
    expect(has(lock!.where, eq('commissionStatus', 'estimated'))).toBe(true);
    expect(has(lock!.where, inArray('status', PAYABLE))).toBe(true);
    // And only locked commissions on bookings that are still good are paid.
    expect(has(selects[1], eq('commissionStatus', 'locked'))).toBe(true);
    expect(has(selects[1], inArray('status', PAYABLE))).toBe(true);
  });

  it('pays a community with a verified payout account its commission, and the organiser the rest', async () => {
    const { execute, stripe, storage, updates } = payoutHarness({ stripeAccountId: 'amunt-account', stripeVerificationStatus: 'verified' });
    await execute('yoga', 'payout-1');

    // €35: platform 15% = €5.25, AMUNT 20% = €7.00, organiser €22.75.
    expect(transfersOf(stripe)).toEqual([['organiser-account', 2275], ['amunt-account', 700]]);
    expect(updates.some((u) => u.values.commissionStatus === 'paid')).toBe(true);
    expect(storage.updateScheduledPayout).toHaveBeenLastCalledWith('payout-1', expect.objectContaining({
      status: 'completed', totalGrossAmountCents: 3500, platformFeeAmountCents: 525,
    }));
  });

  it('does not hold up the organiser when a community has no payout account yet', async () => {
    const { execute, stripe, storage, updates } = payoutHarness({ stripeAccountId: null, stripeVerificationStatus: 'pending' });
    await execute('yoga', 'payout-1');

    // The organiser is paid now — the same €22.75, not more: AMUNT's €7 is held.
    expect(transfersOf(stripe)).toEqual([['organiser-account', 2275]]);
    expect(storage.updateScheduledPayout).not.toHaveBeenCalledWith('payout-1', expect.objectContaining({ status: 'pending' }));
    expect(storage.updateScheduledPayout).toHaveBeenLastCalledWith('payout-1', expect.objectContaining({
      status: 'completed',
      stripeTransferIds: expect.objectContaining({ 'held:promoter:amunt': 'awaiting-verified-payout-account' }),
    }));
    // Still locked, so it is paid later rather than forgotten.
    expect(updates.some((u) => u.values.commissionStatus === 'paid')).toBe(false);
  });
});

// ── Held commissions, paid once the partner connects ────────────────────────

function heldHarness(held: any[], profiles: Record<string, any>, failFor?: string) {
  const updates: Array<{ values: any; where: any }> = [];
  const db = {
    select: () => ({ from: () => ({ where: async () => held }) }),
    update: () => ({ set: (values: any) => ({ where: async (where: any) => { updates.push({ values, where }); } }) }),
  };
  const storage = {
    getPromoterProfile: vi.fn(async (id: string) => profiles[id] ?? null),
    getExperience: vi.fn(async (id: string) => ({ id, title: `Event ${id}`, currency: 'eur' })),
    getUser: vi.fn(async () => ({ email: 'partner@example.com' })),
  };
  const stripe = { transfers: { create: vi.fn(async (args: any, _options: any) => {
    if (args.destination === failFor) throw new Error('insufficient balance');
    return { id: `tr_${args.destination}` };
  }) } };
  const sendPayoutInitiatedEmail = vi.fn(async () => {});
  const run = routeFunction('payHeldPartnerCommissions', {
    db, storage, stripe, createHash, bookings, scheduledPayouts: {}, and, eq, inArray,
    sql: (..._parts: any[]) => ({ sql: true }), PAYABLE_BOOKING_STATUSES: PAYABLE,
    notificationService: { sendPayoutInitiatedEmail },
    formatPayoutAmount: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
  }, undefined, source);
  return { run, stripe, updates, sendPayoutInitiatedEmail };
}

const held = (id: string, promoterId: string, amount: string, experienceId = 'yoga') =>
  ({ id, experienceId, promoterId, commissionAmount: amount, status: 'fully_paid', commissionStatus: 'locked' });

describe('commissions held for a partner who had no payout account', () => {
  it('pays them in one transfer per event once the partner has connected', async () => {
    const { run, stripe, updates, sendPayoutInitiatedEmail } = heldHarness(
      [held('b1', 'amunt', '7.00'), held('b2', 'amunt', '4.00')],
      { amunt: { stripeAccountId: 'amunt-account', stripeVerificationStatus: 'verified' } },
    );
    const result = await run();

    expect(result).toEqual({ paid: 1, waiting: 0, failed: 0 });
    expect(transfersOf(stripe)).toEqual([['amunt-account', 1100]]);
    const paid = updates.find((u) => u.values.commissionStatus === 'paid')!;
    expect(paid.values.commissionTransferId).toBe('tr_amunt-account');
    expect(paid.where).toEqual(inArray('id', ['b1', 'b2']));
    expect(sendPayoutInitiatedEmail).toHaveBeenCalledOnce();
  });

  it('keeps waiting, without moving money, while the partner is still not verified', async () => {
    const { run, stripe, updates } = heldHarness(
      [held('b1', 'amunt', '7.00')],
      { amunt: { stripeAccountId: 'acct', stripeVerificationStatus: 'pending' } },
    );
    expect(await run()).toEqual({ paid: 0, waiting: 1, failed: 0 });
    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('cannot pay the same commission twice: the transfer is keyed on exactly those bookings', async () => {
    const profiles = { amunt: { stripeAccountId: 'amunt-account', stripeVerificationStatus: 'verified' } };
    const first = heldHarness([held('b2', 'amunt', '4.00'), held('b1', 'amunt', '7.00')], profiles);
    const second = heldHarness([held('b1', 'amunt', '7.00'), held('b2', 'amunt', '4.00')], profiles);
    await first.run();
    await second.run();
    const keyOf = (h: any) => h.stripe.transfers.create.mock.calls[0][1].idempotencyKey;
    expect(keyOf(first)).toBe(keyOf(second));
    expect(keyOf(first)).toMatch(/^held-commission:yoga:amunt:[0-9a-f]{32}$/);
  });

  it('keeps going for the other partners when one transfer fails', async () => {
    const { run, stripe } = heldHarness(
      [held('b1', 'amunt', '7.00'), held('b2', 'runclub', '3.00')],
      {
        amunt: { stripeAccountId: 'amunt-account', stripeVerificationStatus: 'verified' },
        runclub: { stripeAccountId: 'runclub-account', stripeVerificationStatus: 'verified' },
      },
      'amunt-account',
    );
    expect(await run()).toEqual({ paid: 1, waiting: 0, failed: 1 });
    expect(transfersOf(stripe)).toEqual([['amunt-account', 700], ['runclub-account', 300]]);
  });

  it('pays per event, not one lump across events', async () => {
    const { run, stripe } = heldHarness(
      [held('b1', 'amunt', '7.00', 'yoga'), held('b2', 'amunt', '2.00', 'rave')],
      { amunt: { stripeAccountId: 'amunt-account', stripeVerificationStatus: 'verified' } },
    );
    await run();
    expect(transfersOf(stripe)).toEqual([['amunt-account', 700], ['amunt-account', 200]]);
  });

  it('skips a commission of nothing', async () => {
    const { run, stripe } = heldHarness(
      [held('b1', 'amunt', '0.00')],
      { amunt: { stripeAccountId: 'amunt-account', stripeVerificationStatus: 'verified' } },
    );
    await run();
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });
});
