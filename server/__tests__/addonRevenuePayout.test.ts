import { eventFeeRates, bookingPlatformFeeCents } from "@shared/platformFees";
import { it, expect, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import { calculateVenueEarnings, getVenueDealTermsKey, formatVenueDealSummary } from '@shared/venueDealModels';
import { isExperiencePayoutEligible, resolvePayoutGrossCents, sumBookingPayoutGrossCents, sumVenuePricedAddonCents, createChargeAllocator } from '../payoutRules';
import { sumBookingTicketQuantity, calculateTicketDeductionCents } from '@shared/ticketDeduction';
import { venuePricedAddonCents } from '@shared/addonChoices';

// Execute the real payout functions with all storage, email and transfer
// boundaries replaced. No server startup or payment credentials are involved.
const source = 'server/payout-scheduler.ts';
function harness(venueAccount: string | null = 'venue-account', model = 'revenue_share', feeOverrides = {}, paidBookings?: any[]) {
  const experience = { id: 'coffee-event', title: 'Coffee run', creatorId: 'organizer',
    linkedVenueId: 'coffee-shop', venueCompensationModel: model, venueRevenueSharePct: 80,
    creatorPct: 85, currency: 'eur' };
  const storage = {
    getCreatorProfile: vi.fn(async () => ({ stripeAccountId: 'creator-account' })),
    getExperience: vi.fn(async () => experience),
    getSplitRecipientsByExperience: vi.fn(async (): Promise<any[]> => []),
    getOtherActivePayoutForExperience: vi.fn(async () => null),
    updateScheduledPayout: vi.fn(async () => {}),
    getScheduledPayoutById: vi.fn(async () => undefined),
    getUser: vi.fn(async () => null),
  };
  const resolveVenuePayoutAccount = vi.fn(async () => ({ stripeAccountId: venueAccount, userId: 'venue-owner' }));
  const buildDefaultRecipients = routeFunction('buildDefaultRecipients', {
    storage, resolveVenuePayoutAccount,
  }, undefined, source);
  const calculateSplitAmount = routeFunction('calculateSplitAmount', {}, undefined, source);
  let whereCount = 0;
  const db = { update: () => ({ set: () => ({ where: async () => {} }) }), select: () => ({ from: () => ({
    limit: async () => [{ platformFeePercentage: 15 }],
    where: async () => ++whereCount === 1
      ? paidBookings ?? [{ status: 'fully_paid', amount: '7.75', totalPrice: '7.75', ticketQuantity: 1, addonTotal: '7.75', ...feeOverrides }]
      : [],
  }) }) };
  const stripe = { transfers: { create: vi.fn(async (..._args: any[]) => ({ id: 'test-transfer' })) } };
  const execute = routeFunction('executeExperiencePayout', {
    resolvePartnerPayoutAccount: async (_id: string, profile?: any) => profile,
    payoutEmailTarget: async () => null,
    formatPayoutAmount: (cents: number) => `€${(cents / 100).toFixed(2)}`, createChargeAllocator, chargeSourcesFor: async () => [], transferredForPayout: async () => 0,
    storage, db, stripe, buildDefaultRecipients, calculateSplitAmount, eventFeeRates, bookingPlatformFeeCents,
    isExperiencePayoutEligible, resolvePayoutGrossCents, sumBookingPayoutGrossCents,
    sumVenuePricedAddonCents, resolveVenuePayoutAccount,
    sumBookingTicketQuantity, calculateTicketDeductionCents,
    bookings: {}, platformSettings: {}, and: vi.fn(), eq: vi.fn(), inArray: vi.fn(), or: vi.fn(), isNull: vi.fn(),
    PAYABLE_BOOKING_STATUSES: ['confirmed', 'fully_paid', 'deposit_paid'],
    notificationService: { sendPayoutInitiatedEmail: vi.fn() },
  }, undefined, source);
  return { execute, storage, stripe, buildDefaultRecipients, experience };
}

it('routes the 80% add-on share to the venue and leaves the organizer the remainder', async () => {
  const { execute, stripe, storage } = harness();
  await execute('coffee-event', 'payout');
  expect(stripe.transfers.create.mock.calls.map(([transfer]: any[]) => [transfer.destination, transfer.amount]))
    .toEqual([['venue-account', 620], ['creator-account', 39]]);
  expect(storage.updateScheduledPayout).toHaveBeenLastCalledWith('payout', expect.objectContaining({
    status: 'completed', totalGrossAmountCents: 775, platformFeeAmountCents: 116,
  }));
});

it('holds only the venue share when the venue has no Stripe account, and pays the organiser (66.12)', async () => {
  const { execute, stripe, storage } = harness(null);
  await execute('coffee-event', 'payout');
  // The organiser still gets only their own part; the venue's €6.20 is kept back, not given to anyone.
  expect(stripe.transfers.create.mock.calls.map(([transfer]: any[]) => [transfer.destination, transfer.amount]))
    .toEqual([['creator-account', 39]]);
  expect(storage.updateScheduledPayout).toHaveBeenLastCalledWith('payout', expect.objectContaining({
    status: 'completed',
    stripeTransferIds: expect.objectContaining({ 'held:venue': 'awaiting-payout-account' }),
    errorMessage: expect.stringMatching(/^Partly paid: held until they connect Stripe: venue €6\.20/),
  }));
});

it('does not apply stale percentage terms after switching the venue to barter', async () => {
  const { buildDefaultRecipients, experience } = harness('venue-account', 'venue_barter');
  const recipients = await buildDefaultRecipients(experience, 15);
  expect(recipients.some((recipient: any) => recipient.recipientType === 'venue')).toBe(false);
  expect(recipients.find((recipient: any) => recipient.recipientType === 'creator').splitValue).toBe('85');
});

it('includes the same add-on share on the venue ledger', async () => {
  const ledger = routeFunction('/api/venue/ledger', {
    resolveCurrentUserId: () => 'venue-owner',
    storage: {
      getVenuesByCreator: async () => [{ id: 'coffee-shop' }],
      getVenueContractsByVenueIds: async () => [{ id: 'coffee-event', currency: 'eur',
        contract: { model: 'revenue_share', terms: { revenueSharePct: 80 } } }],
      getBookingsByExperience: async () => [
        { status: 'fully_paid', amount: '7.75', addonTotal: '7.75', ticketQuantity: 1 },
        { status: 'cancelled', amount: '7.75', addonTotal: '7.75', ticketQuantity: 1 },
      ],
    },
    isActiveParticipantBooking: (status: string) => status === 'fully_paid',
    numberOrZero: (value: unknown) => Number(value) || 0,
    sumBookingTicketQuantity, calculateVenueEarnings, getVenueDealTermsKey, formatVenueDealSummary, venuePricedAddonCents,
  }, 'get');
  const response = routeResponse();
  await ledger({}, response);
  expect(response.statusCode).toBe(200);
  expect(response.body.earned).toBe(6.2);
  expect(response.body.events[0]).toMatchObject({ paidAttendees: 0, attendees: 1, addOnRevenue: 7.75, addOnEarned: 0 });
});

// ── Products priced from the venue's own discount ───────────────────────────
// Retail 7.75, the venue's discount 20% (6.20), the organizer's markup 1.55,
// Great's add-on fee 15%. One coffee on a free RSVP.
const discountedCoffee = { status: 'fully_paid', amount: '7.75', totalPrice: '7.75', ticketQuantity: 1,
  addonTotal: '7.75', ticketPlatformFeePct: '15', addonPlatformFeePct: '15',
  addonItems: [{ id: 'coffee', name: 'Coffee', unitPrice: 7.75, quantity: 1, total: 7.75, venueAmount: 6.2, markup: 1.55 }] };

it('pays the venue its full discounted price and takes the fee from the markup only', async () => {
  const { execute, stripe, storage } = harness('venue-account', 'venue_barter', {}, [discountedCoffee]);
  await execute('coffee-event', 'discount-payout');
  // 15% of the 1.55 markup is 0.23. The venue's 6.20 is untouched by it.
  expect(stripe.transfers.create.mock.calls.map(([transfer]: any[]) => [transfer.destination, transfer.amount]))
    .toEqual([['venue-account', 620], ['creator-account', 132]]);
  expect(storage.updateScheduledPayout).toHaveBeenLastCalledWith('discount-payout', expect.objectContaining({
    status: 'completed', totalGrossAmountCents: 775, platformFeeAmountCents: 23,
  }));
});

it('does not also take a revenue share out of a product the venue already discounted', async () => {
  // An 80% split on top of the discount would pay the venue 6.20 and then
  // 80% of the same sale again. The split applies to ticket money only.
  const paidEntry = { status: 'fully_paid', amount: '10', totalPrice: '10', ticketQuantity: 1,
    ticketPlatformFeePct: '15', addonPlatformFeePct: '15' };
  const { execute, stripe } = harness('venue-account', 'revenue_share', {}, [discountedCoffee, paidEntry]);
  await execute('coffee-event', 'mixed-payout');
  // Venue: 80% of the 10.00 ticket, and 6.20 for the coffee. Fee: 1.50 + 0.23.
  const transfers = stripe.transfers.create.mock.calls.map(([transfer, options]: any[]) =>
    [transfer.destination, transfer.amount, options.idempotencyKey]);
  expect(transfers).toEqual([
    ['venue-account', 620, 'event-payout:mixed-payout:recipient:venue-addons'],
    ['venue-account', 800, 'event-payout:mixed-payout:recipient:venue-account'],
    ['creator-account', 182, 'event-payout:mixed-payout:recipient:creator-account'],
  ]);
  expect(transfers.reduce((sum, [, amount]) => sum + amount, 0) + 173).toBe(1775);
});

it('holds the venue\'s add-on money for a venue without a payout account, never paying it to the organiser', async () => {
  const { execute, storage } = harness(null, 'venue_barter', {}, [discountedCoffee]);
  await execute('coffee-event', 'payout');
  expect(storage.updateScheduledPayout).toHaveBeenLastCalledWith('payout', expect.objectContaining({
    stripeTransferIds: expect.objectContaining({ 'held:venue_addons': 'awaiting-payout-account' }),
  }));
});

it('pays the venue its own price for an add-on whatever the deal, and the organiser only the margin (point 56)', async () => {
  // No catalog markup on the line, only the venue's price per unit: the venue is
  // still paid that price whole, it is kept out of the revenue share, and no fee
  // is taken from it. Here the venue's price is the whole €7.75.
  const venueOnly = { ...discountedCoffee, addonItems: [{ id: 'coffee', name: 'Coffee', unitPrice: 7.75, quantity: 1, total: 7.75, venueAmount: 7.75 }] };
  const { execute, stripe, storage } = harness('venue-account', 'revenue_share', {}, [venueOnly]);
  await execute('coffee-event', 'legacy-payout');
  expect(stripe.transfers.create.mock.calls.map(([transfer]: any[]) => [transfer.destination, transfer.amount]))
    .toEqual([['venue-account', 775]]);
  expect(storage.updateScheduledPayout).toHaveBeenLastCalledWith('legacy-payout', expect.objectContaining({ platformFeeAmountCents: 0 }));
});

it('splits a coffee sold at €1.25 into €1.00 for the venue and €0.25 for the organiser (TEST 1)', async () => {
  const coffee = { status: 'fully_paid', amount: '2.25', totalPrice: '2.25', ticketQuantity: 1, addonTotal: '1.25',
    ticketPlatformFeePct: '15', addonPlatformFeePct: '0',
    addonItems: [{ id: 'coffee', name: 'Coffee', unitPrice: 1.25, quantity: 1, total: 1.25, venueAmount: 1 }] };
  const { execute, stripe } = harness('venue-account', 'venue_barter', {}, [coffee]);
  await execute('coffee-event', 'test-1');
  // Ticket €1.00 − 15% fee €0.15 + margin €0.25 = €1.10 for the organiser.
  expect(stripe.transfers.create.mock.calls.map(([transfer]: any[]) => [transfer.destination, transfer.amount]))
    .toEqual([['venue-account', 100], ['creator-account', 110]]);
});

it('pays the organizer the full 20% margin when the add-on fee is waived', async () => {
  const { execute, stripe, storage } = harness('venue-account', 'revenue_share', { ticketPlatformFeePct: '15', addonPlatformFeePct: '0' });
  await execute('coffee-event', 'waived-payout');
  expect(stripe.transfers.create.mock.calls.map(([transfer]: any[]) => [transfer.destination, transfer.amount]))
    .toEqual([['venue-account', 620], ['creator-account', 155]]);
  expect(storage.updateScheduledPayout).toHaveBeenLastCalledWith('waived-payout', expect.objectContaining({ platformFeeAmountCents: 0 }));
});

it('gives a fee waiver to the organizer when the event has stored split recipients', async () => {
  const { execute, stripe, storage } = harness('venue-account', 'revenue_share', { ticketPlatformFeePct: '15', addonPlatformFeePct: '0' });
  storage.getSplitRecipientsByExperience.mockResolvedValue([
    { recipientType: 'creator', stripeAccountId: 'creator-account', splitMode: 'percentage', splitValue: '5', isActive: true },
    { recipientType: 'venue', stripeAccountId: 'venue-account', splitMode: 'percentage', splitValue: '80', isActive: true },
    { recipientType: 'platform', splitMode: 'percentage', splitValue: '15', isActive: true },
  ]);
  await execute('coffee-event', 'stored-split-payout');
  expect(stripe.transfers.create.mock.calls.map(([transfer]: any[]) => [transfer.destination, transfer.amount]))
    .toEqual([['venue-account', 620], ['creator-account', 155]]);
});
