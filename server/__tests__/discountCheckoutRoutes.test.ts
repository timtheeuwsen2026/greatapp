import { describe, expect, it, vi } from 'vitest';
import { routeFunction, routeResponse } from '../../tests/routeHarness';
import * as choices from '@shared/addonChoices';
import { getTicketAddon } from '@shared/ticketAddons';
import { eventFeeRates, feeSnapshotFromMetadata } from '@shared/platformFees';
import { sumBookingTicketQuantity } from '@shared/ticketDeduction';
import {
  depositAfterDiscount,
  discountAmountForUnitPrice,
  resolveDiscountLink,
} from '@shared/discountLinks';

/**
 * A €35 ticket, a link that says "100% off", and €35 charged.
 *
 * Drives the real create-payment-intent and booking code with the database and
 * Stripe replaced. The discount lookup is replaced by the same shared rules the
 * server uses (resolveDiscountLink + discountAmountForUnitPrice) over an
 * in-memory link, so what these check is what the routes do with the answer.
 */

const EARLY = { id: 'sku-early', ticketName: 'Early bird', pricePerPerson: 20, depositPerPerson: 0 };
const FINAL = { id: 'sku-final', ticketName: 'Final ticket', pricePerPerson: 35, depositPerPerson: 0 };

function makeExperience(overrides: Record<string, unknown> = {}) {
  return {
    id: 'yoga', currency: 'eur', ticketPlatformFeePct: '15', addonPlatformFeePct: '0',
    ticketSkus: [EARLY, FINAL], ...overrides,
  };
}

/** The server's resolveCheckoutDiscount, minus the database. */
function resolverFor(
  discount: Record<string, unknown> | null,
  link: Record<string, unknown> = { id: 'link-1', experienceId: 'yoga', discountId: 'd1', token: 'tok', active: true, redemptionCount: 0, maxRedemptions: null },
) {
  return vi.fn(async (_experience: any, token: unknown, ticketSkuId: string | null, unitPrice: number, ticketQuantity = 1) => {
    const raw = String(token ?? '').trim();
    if (!raw) return { linkId: null, perTicket: 0, reason: null };
    if (raw !== link.token || !discount) return { linkId: null, perTicket: 0, reason: 'This discount link is not valid for this event.' };
    const resolution = resolveDiscountLink({ link: link as any, discounts: [discount as any], ticketSkuId, ticketQuantity });
    if (!resolution.ok) return { linkId: null, perTicket: 0, reason: resolution.reason };
    return { linkId: link.id as string, perTicket: discountAmountForUnitPrice(resolution.discount, unitPrice), reason: null };
  });
}

// ── create-payment-intent ───────────────────────────────────────────────────

function intentRoute(experience: any, resolveCheckoutDiscount: any, getDepositSchedule?: any) {
  const create = vi.fn(async (_data: any) => ({ id: 'pi_1', client_secret: 'pi_1_secret' }));
  const depositSchedule = getDepositSchedule ?? vi.fn(() => ({ available: false }));
  const route = routeFunction('/api/create-payment-intent', {
    ...choices, getTicketAddon, eventFeeRates, depositAfterDiscount,
    stripe: { paymentIntents: { create } },
    storage: { getExperience: async () => experience, getAcceptedVenueContractForExperience: async () => null },
    parseRequestedTicketQuantity: (v: unknown) => Number(v) || 1,
    hasExperiencePassed: () => false, getAvailableTicketQuantity: async () => 80,
    getSoldAddonQuantity: async () => 0, resolveCheckoutDiscount,
    getDepositSchedule: depositSchedule, getStripeMinimumChargeMinorUnits: () => 50,
  }, 'post');
  return { route, create, depositSchedule };
}

async function askForPrice(route: any, body: Record<string, unknown>) {
  const response = routeResponse();
  await route({ user: { claims: { sub: 'buyer' } }, body: { experienceId: 'yoga', ticketQuantity: 1, ...body } }, response);
  return response;
}

describe('create-payment-intent with a discount link', () => {
  const free = { id: 'd1', type: 'percentage', value: 100, active: true };
  const threeQuarters = { id: 'd1', type: 'percentage', value: 75, active: true };

  it('makes a 100% link free, and says how much came off', async () => {
    const { route, create } = intentRoute(makeExperience(), resolverFor({ ...free, skuId: undefined }));
    const response = await askForPrice(route, { ticketSkuId: 'sku-final', discountToken: 'tok' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      freeRsvp: true, fullPrice: 0, discountPerTicket: 35, discountTotal: 35, discountNotice: null,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('charges 25% of the ticket for a 75% link, and stamps the link on the payment', async () => {
    const { route, create } = intentRoute(makeExperience(), resolverFor({ ...threeQuarters, skuId: undefined }));
    const response = await askForPrice(route, { ticketSkuId: 'sku-final', discountToken: 'tok' });

    expect(response.body).toMatchObject({
      unitPrice: 8.75, fullPrice: 8.75, discountPerTicket: 26.25, discountTotal: 26.25, discountNotice: null,
    });
    expect(create.mock.calls[0][0].amount).toBe(875);
    expect(create.mock.calls[0][0].metadata).toMatchObject({ discountToken: 'tok', discountPerTicket: '26.25' });
  });

  it('refuses the €35 ticket for a link tied to the €20 one, and says why instead of staying silent', async () => {
    // Exactly the reported case: "Aticco Members" 100%, tied to the Early bird.
    const { route, create } = intentRoute(makeExperience(), resolverFor({ ...free, skuId: 'sku-early' }));
    const response = await askForPrice(route, { ticketSkuId: 'sku-final', discountToken: 'tok' });

    expect(response.body).toMatchObject({ fullPrice: 35, discountTotal: 0 });
    expect(response.body.discountNotice).toMatch(/different ticket type/);
    expect(create.mock.calls[0][0].amount).toBe(3500);
  });

  it('gives the same link its discount on the ticket it is tied to', async () => {
    const { route } = intentRoute(makeExperience(), resolverFor({ ...free, skuId: 'sku-early' }));
    const response = await askForPrice(route, { ticketSkuId: 'sku-early', discountToken: 'tok' });
    expect(response.body).toMatchObject({ freeRsvp: true, discountTotal: 20 });
  });

  it('asks the discount rules about the ticket and how many are being bought', async () => {
    const resolver = resolverFor({ ...free, skuId: undefined });
    const { route } = intentRoute(makeExperience(), resolver);
    await askForPrice(route, { ticketSkuId: 'sku-final', ticketQuantity: 3, discountToken: 'tok' });

    expect(resolver).toHaveBeenCalledWith(expect.anything(), 'tok', 'sku-final', 35, 3);
  });

  it('will not let one booking take more places than a limited link has left', async () => {
    const link = { id: 'link-1', experienceId: 'yoga', discountId: 'd1', token: 'tok', active: true, redemptionCount: 3, maxRedemptions: 5 };
    const { route } = intentRoute(makeExperience(), resolverFor({ ...free, skuId: undefined }, link));
    const response = await askForPrice(route, { ticketSkuId: 'sku-final', ticketQuantity: 4, discountToken: 'tok' });

    expect(response.body).toMatchObject({ fullPrice: 140, discountTotal: 0 });
    expect(response.body.discountNotice).toMatch(/Only 2 places are left/);
  });

  it('says nothing about a link when the buyer arrived without one', async () => {
    const { route } = intentRoute(makeExperience(), resolverFor({ ...free, skuId: undefined }));
    const response = await askForPrice(route, { ticketSkuId: 'sku-final' });
    expect(response.body).toMatchObject({ fullPrice: 35, discountTotal: 0, discountNotice: null });
  });

  it('reports a link that is not valid for the event', async () => {
    const { route } = intentRoute(makeExperience(), resolverFor({ ...free, skuId: undefined }));
    const response = await askForPrice(route, { ticketSkuId: 'sku-final', discountToken: 'someone-elses' });
    expect(response.body.discountNotice).toMatch(/not valid/);
    expect(response.body.fullPrice).toBe(35);
  });
});

describe('create-payment-intent with a discount on a ticket that has a deposit', () => {
  const withDeposit = makeExperience({
    ticketSkus: [{ id: 'trip', ticketName: 'Trip', pricePerPerson: 35, depositPerPerson: 10 }],
  });
  const schedule = () => vi.fn((input: any) => ({ available: input.depositAmount > 0, balanceDueDate: null, reason: null }));

  it('lets a 100% link through instead of failing the deposit check', async () => {
    const { route } = intentRoute(withDeposit, resolverFor({ id: 'd1', type: 'percentage', value: 100, active: true }), schedule());
    const response = await askForPrice(route, { ticketSkuId: 'trip', discountToken: 'tok' });
    // This used to be a 400: "Ticket deposit cannot exceed the full ticket price".
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ freeRsvp: true, discountTotal: 35 });
  });

  it('caps the deposit at what a 75% link leaves', async () => {
    const depositSchedule = schedule();
    const { route } = intentRoute(withDeposit, resolverFor({ id: 'd1', type: 'percentage', value: 75, active: true }), depositSchedule);
    const response = await askForPrice(route, { ticketSkuId: 'trip', discountToken: 'tok' });

    expect(response.statusCode).toBe(200);
    expect(depositSchedule).toHaveBeenCalledWith(expect.objectContaining({ depositAmount: 8.75 }));
  });

  it('keeps the full deposit when the discount leaves room for it', async () => {
    const depositSchedule = schedule();
    const { route } = intentRoute(withDeposit, resolverFor({ id: 'd1', type: 'percentage', value: 20, active: true }), depositSchedule);
    await askForPrice(route, { ticketSkuId: 'trip', discountToken: 'tok' });
    expect(depositSchedule).toHaveBeenCalledWith(expect.objectContaining({ depositAmount: 10 }));
  });

  it('still refuses a deposit set above the ticket price', async () => {
    const broken = makeExperience({ ticketSkus: [{ id: 'trip', ticketName: 'Trip', pricePerPerson: 35, depositPerPerson: 50 }] });
    const { route } = intentRoute(broken, resolverFor(null), schedule());
    const response = await askForPrice(route, { ticketSkuId: 'trip' });
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toMatch(/cannot exceed/);
  });
});

// ── the booking ─────────────────────────────────────────────────────────────

function bookingFunction(experience: any, resolveCheckoutDiscount: any) {
  const createBooking = vi.fn(async (data: any) => ({ id: 'booking-1', ...data }));
  const stripe = {
    paymentIntents: {
      create: vi.fn(async () => ({ id: 'pi_new', client_secret: 's' })),
      retrieve: vi.fn(),
    },
  };
  const storage = {
    getBookingByPaymentIntent: async () => null, getExperience: async () => experience,
    getUser: async () => null, createBooking, getBookingsByExperience: async () => [],
    createExperienceMessage: async () => {}, getExperiencePartner: async () => null,
    getPromoterExperienceByShareToken: async () => null, getEventPartnerTracking: async () => null,
    getUserBookings: async () => [], getConfirmedBookings: async () => [],
  };
  const finalize = routeFunction('createBookingForUser', {
    ...choices, eventFeeRates, feeSnapshotFromMetadata, depositAfterDiscount, storage, stripe,
    ensureBookingAccount: async (id: string) => id, parseRequestedTicketQuantity: (v: unknown) => Number(v) || 1,
    getAvailableTicketQuantity: async () => 80, getSoldAddonQuantity: async () => 0,
    resolveCheckoutDiscount, getDepositSchedule: () => ({ available: false }),
    randomBytes: () => ({ toString: () => 'qr-token' }), sumBookingTicketQuantity,
    sendBookingNotificationsAfterPayment: async () => {},
    hasExperiencePassed: () => false,
    db: { update: () => ({ set: () => ({ where: () => ({ catch: () => {} }) }) }) },
    discountLinks: {}, sql: () => ({}), eq: () => ({}),
  });
  return { finalize, createBooking, stripe };
}

describe('a booking made with no payment', () => {
  const free = { id: 'd1', type: 'percentage', value: 100, active: true };
  const experience = makeExperience();
  const base = { experienceId: 'yoga', ticketSkuId: 'sku-early', ticketQuantity: 1, paymentType: 'full', amount: 0 };

  it('is free when it names a 100% link, and records the link and the saving', async () => {
    const { finalize, createBooking, stripe } = bookingFunction(experience, resolverFor({ ...free, skuId: undefined }));
    const result = await finalize('buyer', { ...base, discountToken: 'tok' });

    expect(result.status).toBe(200);
    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ totalPrice: '0', discountLinkId: 'link-1', discountAmount: '20.00' }),
      expect.anything(),
    );
    // Nothing is held on anyone's card for a free ticket.
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('is refused when it names a link the server will not honour, rather than booked at full price', async () => {
    const { finalize, createBooking, stripe } = bookingFunction(
      experience,
      resolverFor({ ...free, skuId: 'sku-early' }),
    );
    const result = await finalize('buyer', { ...base, ticketSkuId: 'sku-final', discountToken: 'tok' });

    expect(result.status).toBe(409);
    expect(result.body.message).toMatch(/different ticket type/);
    expect(result.body.discountRefused).toBe(true);
    expect(createBooking).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('is refused when it claims to be free but the ticket costs money', async () => {
    // The old behaviour: a pending full-price booking and a held card payment,
    // after the buyer was told "RSVP confirmed".
    const { finalize, createBooking, stripe } = bookingFunction(experience, resolverFor(null));
    const result = await finalize('buyer', { ...base, ticketSkuId: 'sku-final' });

    expect(result.status).toBe(409);
    expect(result.body.message).toMatch(/price .* has changed/);
    expect(createBooking).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('still books a ticket that really is free', async () => {
    const freeTicket = makeExperience({ ticketSkus: [{ id: 'rsvp', ticketName: 'RSVP', pricingMode: 'free_rsvp', pricePerPerson: 0 }] });
    const { finalize, createBooking } = bookingFunction(freeTicket, resolverFor(null));
    const result = await finalize('buyer', { ...base, ticketSkuId: 'rsvp' });

    expect(result.status).toBe(200);
    expect(createBooking).toHaveBeenCalled();
  });

  it('counts the places the booking takes when it asks the discount rules', async () => {
    const resolver = resolverFor({ ...free, skuId: undefined });
    const { finalize } = bookingFunction(experience, resolver);
    await finalize('buyer', { ...base, ticketQuantity: 2, discountToken: 'tok' });
    expect(resolver).toHaveBeenCalledWith(expect.anything(), 'tok', 'sku-early', 20, 2);
  });
});
