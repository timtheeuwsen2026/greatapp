import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookingSuccess from '../pages/booking-success';

// QA V13 Bug 1.1: with a redirect-based payment method (iDEAL, Bancontact,
// full-page 3DS) Stripe unloads the checkout tab, so the booking POST never
// ran. The buyer came back to a captured payment and
// "We couldn't verify this booking". The page must rebuild the booking from
// the PaymentIntent Stripe hands back on the return URL.

const navigate = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/booking-success', navigate],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast, dismiss: vi.fn(), toasts: [] }),
  toast,
}));

vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));
vi.mock('@/components/MVGProgressWidget', () => ({ default: () => <div /> }));
vi.mock('@/components/participant-referral-perk-card', () => ({ default: () => <div /> }));

let mockAuth = { isAuthenticated: true, isLoading: false, user: { id: 'user-1' } as any };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/hooks/usePromoterAttribution', () => ({
  getAttribution: () => ({ promoterId: null, referralCode: 'REF123', shareToken: null }),
  clearAttribution: vi.fn(),
}));

vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => <div>{children}</div>,
  PaymentElement: () => <div />,
  useStripe: () => null,
  useElements: () => null,
}));

const experience = {
  id: 'exp-1',
  title: 'The GREAT Sweat & Social Bootcamp',
  price: 10,
  startDate: new Date(Date.now() + 20 * 86400000).toISOString(),
  endDate: new Date(Date.now() + 20 * 86400000).toISOString(),
  location: 'Barcelona',
  maxParticipants: 20,
  currentParticipants: 1,
  currency: 'EUR',
};

const rebuiltBooking = {
  id: 'bk-1',
  experienceId: 'exp-1',
  userId: 'user-1',
  amount: '10.00',
  totalPrice: '10.00',
  isDepositOnly: false,
  depositAmount: '0.00',
  balanceAmount: '0.00',
  balanceDueDate: null,
  balancePaid: true,
  status: 'fully_paid',
  stripePaymentIntentId: 'pi_123',
  ticketSkuId: 'sku-ga',
  ticketName: 'General Ticket',
  createdAt: new Date().toISOString(),
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const res = await fetch((queryKey as string[]).join('/'));
          if (!res.ok) throw new Error('request failed');
          return res.json();
        },
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BookingSuccess />
    </QueryClientProvider>,
  );
}

describe('Booking confirmation after a redirect payment', () => {
  let finalizeCalls: any[];
  let hasParticipantProfile = true;

  beforeEach(() => {
    finalizeCalls = [];
    hasParticipantProfile = true;
    navigate.mockClear();
    mockAuth = { isAuthenticated: true, isLoading: false, user: { id: 'user-1' } };
    window.history.replaceState(
      {},
      '',
      '/booking-success?experience=exp-1&payment_intent=pi_123&payment_intent_client_secret=pi_123_secret_abc&redirect_status=succeeded',
    );

    let bookingExists = false;
    global.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('/api/bookings/finalize-payment')) {
        finalizeCalls.push(JSON.parse(init.body));
        bookingExists = true;
        return { ok: true, json: async () => ({ booking: rebuiltBooking, message: 'Booking confirmed successfully!' }) } as any;
      }
      if (url.includes('/api/bookings/my-bookings')) {
        return { ok: true, json: async () => (bookingExists ? [rebuiltBooking] : []) } as any;
      }
      if (url.includes('/api/bookings/bk-1')) {
        return { ok: true, json: async () => rebuiltBooking } as any;
      }
      if (url.includes('/api/experiences/exp-1')) {
        return { ok: true, json: async () => experience } as any;
      }
      if (url.includes('/api/participant-profile/status')) {
        return { ok: true, json: async () => ({ hasProfile: hasParticipantProfile }) } as any;
      }
      if (url.includes('/api/me/ensure-referral-code')) {
        return {
          ok: true,
          json: async () => ({ referralCode: 'REF123', referralLink: 'https://app.test/e/exp-1?ref=REF123' }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rebuilds the booking from the PaymentIntent and confirms it', async () => {
    renderPage();

    await waitFor(() => expect(finalizeCalls).toHaveLength(1));
    expect(finalizeCalls[0]).toMatchObject({
      paymentIntentId: 'pi_123',
      clientSecret: 'pi_123_secret_abc',
      referralCode: 'REF123',
    });

    expect(await screen.findByTestId('confirmation-heading')).toHaveTextContent('Booking Confirmed!');
    expect(screen.queryByTestId('booking-required-heading')).not.toBeInTheDocument();
    // The share kit / referral banner is part of the confirmation screen.
    expect(screen.getByText('Invite the Squad')).toBeInTheDocument();
  });

  it('shows the payment amount in the event currency, not dollars', async () => {
    renderPage();

    const paid = await screen.findByTestId('amount-paid');
    expect(paid).toHaveTextContent('€10.00');
  });

  it('offers sign-in with the recovery URL preserved when there is no session', async () => {
    // The redirect from the bank can land in a context where the login has not
    // rehydrated (or was lost). A paid buyer must get a way back in — not
    // "we couldn't verify this booking".
    mockAuth = { isAuthenticated: false, isLoading: false, user: null };

    renderPage();

    expect(await screen.findByTestId('signin-required-heading')).toHaveTextContent(
      'Payment received — sign in to finish',
    );
    expect(screen.getByTestId('signin-required-button')).toBeInTheDocument();
    // Never fires a doomed 401 finalize before the session exists.
    expect(finalizeCalls).toHaveLength(0);
  });

  it('waits for the session to load before deciding anything', async () => {
    mockAuth = { isAuthenticated: false, isLoading: true, user: null };

    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId('booking-required-heading')).not.toBeInTheDocument();
      expect(screen.queryByTestId('signin-required-heading')).not.toBeInTheDocument();
    });
    expect(finalizeCalls).toHaveLength(0);
  });

  it('does not try to rebuild a booking when the bank declined the payment', async () => {
    window.history.replaceState(
      {},
      '',
      '/booking-success?experience=exp-1&payment_intent=pi_123&payment_intent_client_secret=pi_123_secret_abc&redirect_status=failed',
    );

    renderPage();

    expect(await screen.findByTestId('booking-required-heading')).toHaveTextContent(
      "Your payment didn't go through",
    );
    expect(finalizeCalls).toHaveLength(0);
  });

  it('shows the confirmation and share kit to a brand-new buyer instead of forcing onboarding', async () => {
    // V14 #6: a first-time buyer was redirected straight into profile setup and
    // never saw their booking, referral link or share card.
    hasParticipantProfile = false;

    renderPage();

    expect(await screen.findByTestId('confirmation-heading')).toHaveTextContent('Booking Confirmed!');
    expect(screen.getByText('Invite the Squad')).toBeInTheDocument();
    // Never navigated away from the share moment.
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining('/participant-profile-setup'));
  });

  it('raises the profile step over the confirmation so it cannot be scrolled past', async () => {
    hasParticipantProfile = false;

    renderPage();

    // The confirmation lands first...
    expect(await screen.findByTestId('confirmation-heading')).toBeInTheDocument();
    // ...then the ask comes up on top of it a beat later.
    expect(await screen.findByTestId('profile-prompt-dialog', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByTestId('profile-prompt-start')).toBeInTheDocument();
    expect(screen.getByTestId('profile-prompt-later')).toBeInTheDocument();
  });

  it('leaves a pinned reminder when the buyer chooses to do it later', async () => {
    hasParticipantProfile = false;
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByTestId('profile-prompt-later', {}, { timeout: 4000 }));

    // Dialog closes, but the step stays in reach while they use the share kit.
    expect(screen.queryByTestId('profile-prompt-dialog')).not.toBeInTheDocument();
    expect(await screen.findByTestId('profile-prompt-bar')).toBeInTheDocument();
    expect(screen.getByText('Invite the Squad')).toBeInTheDocument();
  });

  it('does not nag a buyer who already has a profile', async () => {
    renderPage();

    await screen.findByTestId('confirmation-heading');
    await waitFor(() => expect(screen.queryByTestId('profile-prompt-dialog')).not.toBeInTheDocument());
    expect(screen.queryByTestId('profile-prompt-bar')).not.toBeInTheDocument();
  });
});

// A deposit booking's page offered "Pay Remaining Balance" after the booking
// had been cancelled or refunded. The pay-balance endpoints refuse those with a
// 409, so every click ended in a toast reading `Error: 409: {"message":...}`.
describe('Balance payment on a booking that is no longer active', () => {
  const depositBooking = {
    ...rebuiltBooking,
    id: 'bk-2',
    amount: '20.00',
    totalPrice: '100.00',
    isDepositOnly: true,
    depositAmount: '20.00',
    balanceAmount: '80.00',
    balancePaid: false,
    status: 'deposit_paid',
    cancelledAt: null as string | null,
  };
  let booking: typeof depositBooking;
  let createIntentCalls: number;

  beforeEach(() => {
    toast.mockClear();
    createIntentCalls = 0;
    booking = { ...depositBooking };
    mockAuth = { isAuthenticated: true, isLoading: false, user: { id: 'user-1' } };
    window.history.replaceState({}, '', '/booking-success?experience=exp-1&booking=bk-2');

    global.fetch = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/pay-balance/create-intent')) {
        createIntentCalls += 1;
        const body = JSON.stringify({ message: 'This booking is no longer active, so there is no balance to pay.' });
        return { ok: false, status: 409, statusText: 'Conflict', text: async () => body, json: async () => JSON.parse(body) } as any;
      }
      if (url.includes('/api/bookings/bk-2')) {
        return { ok: true, json: async () => booking } as any;
      }
      if (url.includes('/api/experiences/exp-1')) {
        return { ok: true, json: async () => ({ ...experience, status: 'approved' }) } as any;
      }
      if (url.includes('/api/participant-profile/status')) {
        return { ok: true, json: async () => ({ hasProfile: true }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['refunded', { status: 'refunded' }],
    ['cancelled', { status: 'cancelled', cancelledAt: new Date().toISOString() }],
    ['stamped cancelled before its status caught up', { status: 'deposit_paid', cancelledAt: new Date().toISOString() }],
  ])('does not offer the balance on a %s booking', async (_label, state) => {
    booking = { ...depositBooking, ...state };

    renderPage();

    // Plain matchers: tsc does not see the jest-dom ones in this project.
    expect((await screen.findByTestId('cancelled-heading')).textContent).toContain('This booking is no longer active');
    expect(screen.getByTestId('cancelled-message').textContent).toContain('no balance left to pay');
    expect(screen.queryByTestId('pay-balance-button')).toBeNull();
    expect(screen.queryByTestId('balance-payment-section')).toBeNull();
    expect(screen.queryByText(/Pay Remaining Balance/)).toBeNull();
    // The event is still on, so nothing is said about a failed group.
    expect(screen.queryByText(/minimum group size/)).toBeNull();
  });

  it('still offers the balance on a live deposit booking, and words a refusal as a sentence', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByTestId('pay-balance-button'));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(createIntentCalls).toBe(1);
    const [{ description }] = toast.mock.calls.at(-1)!;
    expect(description).toBe('This booking is no longer active, so there is no balance to pay.');
    expect(description).not.toMatch(/409|\{/);
  });
});

// Attendees can now cancel and book the same event again. Returning from a
// redirect payment with no booking id, the newest row for the event can be the
// cancelled one while the new booking is still being written — the page must
// recover the new payment instead of announcing "no longer active".
describe('Returning from a payment after cancelling an earlier booking', () => {
  let finalizeCalls: number;

  beforeEach(() => {
    finalizeCalls = 0;
    mockAuth = { isAuthenticated: true, isLoading: false, user: { id: 'user-1' } };
    window.history.replaceState(
      {},
      '',
      '/booking-success?experience=exp-1&payment_intent=pi_new&payment_intent_client_secret=pi_new_secret&redirect_status=succeeded',
    );
    const oldCancelled = {
      ...rebuiltBooking,
      id: 'bk-old',
      stripePaymentIntentId: 'pi_old',
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const fresh = { ...rebuiltBooking, id: 'bk-new', stripePaymentIntentId: 'pi_new' };
    let rebuilt = false;
    global.fetch = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/bookings/finalize-payment')) {
        finalizeCalls += 1;
        rebuilt = true;
        return { ok: true, json: async () => ({ booking: fresh }) } as any;
      }
      if (url.includes('/api/bookings/my-bookings')) {
        return { ok: true, json: async () => (rebuilt ? [fresh, oldCancelled] : [oldCancelled]) } as any;
      }
      if (url.includes('/api/experiences/exp-1')) {
        return { ok: true, json: async () => experience } as any;
      }
      if (url.includes('/api/participant-profile/status')) {
        return { ok: true, json: async () => ({ hasProfile: true }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recovers the new payment rather than showing the cancelled booking', async () => {
    renderPage();

    await waitFor(() => expect(finalizeCalls).toBe(1));
    expect((await screen.findByTestId('confirmation-heading')).textContent).toContain('Booking Confirmed!');
    expect(screen.queryByTestId('cancelled-heading')).toBeNull();
  });
});

// "You were not charged anything" used to show for every called-off event. An
// organiser or admin archiving an event moves no money, and a deposit taken
// upfront is not returned by the group-failure run, so the page now says only
// what the records show.
describe('A called-off event', () => {
  let booking: any;
  let event: any;

  beforeEach(() => {
    mockAuth = { isAuthenticated: true, isLoading: false, user: { id: 'user-1' } };
    window.history.replaceState({}, '', '/booking-success?experience=exp-1&booking=bk-3');
    booking = { ...rebuiltBooking, id: 'bk-3' };
    event = { ...experience, status: 'cancelled', lifecycleStatus: 'cancelled', mvgStatus: 'pending' };
    global.fetch = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/bookings/bk-3')) return { ok: true, json: async () => booking } as any;
      if (url.includes('/api/experiences/exp-1')) return { ok: true, json: async () => event } as any;
      if (url.includes('/api/participant-profile/status')) return { ok: true, json: async () => ({ hasProfile: true }) } as any;
      return { ok: true, json: async () => ({}) } as any;
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not blame the group or promise a release when the organiser archived a paid event', async () => {
    renderPage();

    expect((await screen.findByTestId('cancelled-message')).textContent).toContain('cancelled by the organiser');
    expect(screen.queryByText(/minimum group size/)).toBeNull();
    expect(screen.queryByText(/not charged/)).toBeNull();
    expect(screen.getByTestId('refund-info').textContent).toContain('contact the organiser');
  });

  it('says the group failed and the payment came back only when both are recorded', async () => {
    event = { ...event, mvgStatus: 'failed' };
    booking = { ...booking, depositStatus: 'refunded' };

    renderPage();

    expect((await screen.findByTestId('cancelled-message')).textContent).toContain('minimum group size');
    expect(screen.getByTestId('refund-info').textContent).toContain('has been returned');
  });

  it('says nothing about money for a free RSVP', async () => {
    booking = { ...booking, amount: '0.00', totalPrice: '0.00', stripePaymentIntentId: null };

    renderPage();

    await screen.findByTestId('cancelled-message');
    expect(screen.queryByTestId('refund-info')).toBeNull();
  });
});
