import { it, expect, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import { calculateVenueEarnings, getVenueDealTermsKey, formatVenueDealSummary } from '@shared/venueDealModels';
import { isExperiencePayoutEligible, resolvePayoutGrossCents, sumBookingPayoutGrossCents } from '../payoutRules';
import { sumBookingTicketQuantity, calculateTicketDeductionCents } from '@shared/ticketDeduction';

// Execute the real payout functions with all storage, email and transfer
// boundaries replaced. No server startup or payment credentials are involved.
const source = 'server/payout-scheduler.ts';
function harness(venueAccount: string | null = 'venue-account', model = 'revenue_share') {
  const experience = { id: 'coffee-event', title: 'Coffee run', creatorId: 'organizer',
    linkedVenueId: 'coffee-shop', venueCompensationModel: model, venueRevenueSharePct: 80,
    creatorPct: 85, currency: 'eur' };
  const storage = {
    getCreatorProfile: vi.fn(async () => ({ stripeAccountId: 'creator-account' })),
    getExperience: vi.fn(async () => experience),
    getSplitRecipientsByExperience: vi.fn(async () => []),
    getOtherActivePayoutForExperience: vi.fn(async () => null),
    updateScheduledPayout: vi.fn(async () => {}),
    getUser: vi.fn(async () => null),
  };
  const buildDefaultRecipients = routeFunction('buildDefaultRecipients', {
    storage, resolveVenuePayoutAccount: vi.fn(async () => ({ stripeAccountId: venueAccount, userId: 'venue-owner' })),
  }, undefined, source);
  const calculateSplitAmount = routeFunction('calculateSplitAmount', {}, undefined, source);
  let whereCount = 0;
  const db = { select: () => ({ from: () => ({
    limit: async () => [{ platformFeePercentage: 15 }],
    where: async () => ++whereCount === 1
      ? [{ status: 'fully_paid', amount: '7.75', totalPrice: '7.75', ticketQuantity: 1, addonTotal: '7.75' }]
      : [],
  }) }) };
  const stripe = { transfers: { create: vi.fn(async () => ({ id: 'test-transfer' })) } };
  const execute = routeFunction('executeExperiencePayout', {
    storage, db, stripe, buildDefaultRecipients, calculateSplitAmount,
    isExperiencePayoutEligible, resolvePayoutGrossCents, sumBookingPayoutGrossCents,
    sumBookingTicketQuantity, calculateTicketDeductionCents,
    bookings: {}, platformSettings: {}, and: vi.fn(), eq: vi.fn(), inArray: vi.fn(),
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

it('halts instead of silently retaining an owed venue share when its account is missing', async () => {
  const { execute, stripe } = harness(null);
  await expect(execute('coffee-event', 'payout')).rejects.toThrow('has no connected Stripe account');
  expect(stripe.transfers.create).not.toHaveBeenCalled();
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
    sumBookingTicketQuantity, calculateVenueEarnings, getVenueDealTermsKey, formatVenueDealSummary,
  }, 'get');
  const response = routeResponse();
  await ledger({}, response);
  expect(response.statusCode).toBe(200);
  expect(response.body.earned).toBe(6.2);
  expect(response.body.events[0]).toMatchObject({ paidAttendees: 0, attendees: 1, addOnRevenue: 7.75 });
});
