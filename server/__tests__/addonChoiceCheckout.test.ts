import { it, expect, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import * as choices from '@shared/addonChoices';
import { getTicketAddon } from '@shared/ticketAddons';
import { eventFeeRates, feeSnapshotFromMetadata } from '@shared/platformFees';
import { sumBookingTicketQuantity } from '@shared/ticketDeduction';

function harness() {
  const experience = { id: 'run', currency: 'eur', ticketPlatformFeePct: '5', addonPlatformFeePct: '0',
    ticketSkus: [{ id: 'rsvp', pricingMode: 'free_rsvp', pricePerPerson: 0, addonEnabled: true,
      addons: [{ id: 'latte', addonName: 'Latte', addonVenuePrice: 7.45 }, { id: 'matcha', addonName: 'Matcha', addonVenuePrice: 7.75 }] }] };
  const create = vi.fn(async (_data: any) => ({ id: 'pi_quote', client_secret: 'pi_quote_secret' }));
  const route = routeFunction('/api/create-payment-intent', { ...choices, getTicketAddon, eventFeeRates,
    stripe: { paymentIntents: { create } }, storage: { getExperience: async () => experience, getAcceptedVenueContractForExperience: async () => null },
    parseRequestedTicketQuantity: (v: unknown) => Number(v) || 1,
    hasExperiencePassed: () => false, getAvailableTicketQuantity: async () => 80,
    getSoldAddonQuantity: async () => 0, resolveCheckoutDiscount: async () => ({ perTicket: 0, linkId: null }),
    getDepositSchedule: () => ({ available: false }), getStripeMinimumChargeMinorUnits: () => 50,
  }, 'post');
  return { route, create, experience };
}
it('charges two server-priced products while booking only one free entry and freezes both fee rates', async () => {
  const { route, create } = harness(); const response = routeResponse();
  await route({ user: { claims: { sub: 'buyer' } }, body: { experienceId: 'run', ticketSkuId: 'rsvp', ticketQuantity: 1,
    addonSelections: [{ id: 'latte', quantity: 1, unitPrice: 0 }, { id: 'matcha', quantity: 1 }], addonPlatformFeePct: 90 } }, response);
  expect(response.statusCode).toBe(200);
  expect(response.body).toMatchObject({ ticketQuantity: 1, addonQuantity: 2, fullPrice: 15.2 });
  const quote = create.mock.calls[0][0];
  expect(quote.amount).toBe(1520);
  expect(quote.metadata).toMatchObject({ ticketPlatformFeePct: '5', addonPlatformFeePct: '0', ticketQuantity: '1' });
  expect(choices.addonItemsFromMetadata(quote.metadata)).toHaveLength(2);
  expect(Object.keys(quote.metadata).length).toBeLessThanOrEqual(50);
});
it('keeps entry free when all extras are declined', async () => {
  const { route, create } = harness(); const response = routeResponse();
  await route({ body: { experienceId: 'run', ticketSkuId: 'rsvp', ticketQuantity: 1, addonSelections: [] } }, response);
  expect(response.body).toMatchObject({ freeRsvp: true, fullPrice: 0, ticketQuantity: 1 });
  expect(create).not.toHaveBeenCalled();
});
it('rejects a product that is not offered on this ticket before creating a payment', async () => {
  const { route, create } = harness(); const response = routeResponse();
  await route({ body: { experienceId: 'run', ticketSkuId: 'rsvp', ticketQuantity: 1, addonSelections: [{ id: 'other', quantity: 1 }] } }, response);
  expect(response.statusCode).toBe(400); expect(create).not.toHaveBeenCalled();
});

it('finalizes the paid quote and frozen fees after prices and admin rates change', async () => {
  const { route, create, experience } = harness(); const response = routeResponse();
  await route({ user: { claims: { sub: 'buyer' } }, body: { experienceId: 'run', ticketSkuId: 'rsvp', ticketQuantity: 1,
    addonSelections: [{ id: 'latte', quantity: 1 }, { id: 'matcha', quantity: 1 }] } }, response);
  const quote = create.mock.calls[0][0];
  const payment = { id: 'pi_paid', status: 'succeeded', amount: quote.amount, currency: 'eur', metadata: quote.metadata };
  experience.ticketPlatformFeePct = '15'; experience.addonPlatformFeePct = '10';
  experience.ticketSkus[0].addons[0].addonVenuePrice = 99;
  const storage = { getBookingByPaymentIntent: async () => null, getExperience: async () => experience,
    getUser: async () => null, createBooking: vi.fn(async (data: any) => ({ id: 'booking', ...data })),
    getBookingsByExperience: async () => [], createExperienceMessage: async () => {} };
  const finalize = routeFunction('createBookingForUser', { ...choices, eventFeeRates, feeSnapshotFromMetadata, storage,
    ensureBookingAccount: async (id: string) => id, parseRequestedTicketQuantity: () => 1,
    getAvailableTicketQuantity: async () => 80, getSoldAddonQuantity: async () => 0,
    resolveCheckoutDiscount: async () => ({ perTicket: 0, linkId: null }),
    getDepositSchedule: () => ({ available: false }), stripe: { paymentIntents: { retrieve: async () => payment } },
    randomBytes: () => ({ toString: () => 'qr-token' }), sumBookingTicketQuantity,
    sendBookingNotificationsAfterPayment: async () => {},
  });
  const result = await finalize('buyer', { experienceId: 'run', ticketSkuId: 'rsvp', stripePaymentIntentId: 'pi_paid',
    ticketQuantity: 1, paymentType: 'full', addonSelections: [{ id: 'tampered', quantity: 10 }] });
  expect(result.status).toBe(200);
  expect(storage.createBooking).toHaveBeenCalledWith(expect.objectContaining({
    totalPrice: '15.2', ticketQuantity: 1, addonQuantity: 2, addonTotal: '15.20',
    ticketPlatformFeePct: '5', addonPlatformFeePct: '0',
  }), { paymentInFlight: true });
  expect(result.body.booking.addonItems.map((item: any) => item.unitPrice)).toEqual([7.45, 7.75]);
  const foreignResult = await finalize('other-user', { experienceId: 'run', ticketSkuId: 'rsvp', stripePaymentIntentId: 'pi_paid', ticketQuantity: 1, paymentType: 'full' });
  expect(foreignResult.status).toBe(403);
  expect(storage.createBooking).toHaveBeenCalledTimes(1);
});
