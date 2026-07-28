import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookingSuccess from '../pages/booking-success';

// QA V13 Bug 1.1: with a redirect-based payment method (iDEAL, Bancontact,
// full-page 3DS) Stripe unloads the checkout tab, so the booking POST never
// ran. The buyer came back to a captured payment and
// "We couldn't verify this booking". The page must rebuild the booking from
// the PaymentIntent Stripe hands back on the return URL.

vi.mock('wouter', () => ({
  useLocation: () => ['/booking-success', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));
vi.mock('@/components/MVGProgressWidget', () => ({ default: () => <div /> }));
vi.mock('@/components/participant-referral-perk-card', () => ({ default: () => <div /> }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 'user-1' } }),
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

  beforeEach(() => {
    finalizeCalls = [];
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
        return { ok: true, json: async () => ({ hasProfile: true }) } as any;
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
});
