import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Checkout from '../pages/checkout';

// A discount link that said "100% off" and then charged the full €35.
//
// Two things were wrong at checkout. A booking that is free *because of* the
// link was posted without naming the link, so the server priced it on its own at
// the full amount. And a link the server refused (for a different ticket, or out
// of places) took nothing off with no word of why, so the buyer simply saw the
// ordinary price.

vi.mock('wouter', () => ({
  useRoute: () => [true, { id: 'exp-yoga' }],
  useLocation: () => ['/checkout/exp-yoga', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));
vi.mock('@/components/MVGProgressWidget', () => ({ default: () => <div /> }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 'user-1' } }),
}));
vi.mock('@/hooks/usePromoterAttribution', () => ({
  getAttribution: () => ({ promoterId: null, referralCode: null, shareToken: null }),
  clearAttribution: vi.fn(),
}));
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: any) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => null,
  useElements: () => null,
}));

const experience = {
  id: 'exp-yoga',
  title: 'Immersive yoga and breathwork',
  description: 'Rooftop',
  price: 35,
  pricePerPerson: 35,
  startDate: new Date(Date.now() + 10 * 86400000).toISOString(),
  endDate: new Date(Date.now() + 10 * 86400000).toISOString(),
  location: 'Barcelona',
  maxParticipants: 40,
  currentParticipants: 0,
  currency: 'EUR',
  ticketSkus: [
    { id: 'sku-early', ticketName: 'Early bird', pricePerPerson: 35, ticketCapacity: 20, soldCount: 0 },
    { id: 'sku-general', ticketName: 'General', pricePerPerson: 35, ticketCapacity: 20, soldCount: 0 },
  ],
};

const paid = (extra: Record<string, unknown> = {}) => ({
  clientSecret: 'pi_test_secret',
  fullPrice: 35,
  unitPrice: 35,
  discountPerTicket: 0,
  discountTotal: 0,
  discountNotice: null,
  ticketQuantity: 1,
  ticketName: 'General',
  ticketSkuId: 'sku-general',
  hasDeposit: false,
  paymentMode: 'full',
  ...extra,
});

const freeByDiscount = {
  freeRsvp: true,
  clientSecret: null,
  fullPrice: 0,
  unitPrice: 0,
  discountPerTicket: 35,
  discountTotal: 35,
  discountNotice: null,
  ticketQuantity: 1,
  ticketName: 'Early bird',
  ticketSkuId: 'sku-early',
};

let intentReply: Record<string, unknown>;
let bookingReply: { ok: boolean; status?: number; body: unknown };

function callsTo(path: string, method?: string) {
  return (global.fetch as any).mock.calls
    .filter((call: any[]) => {
      const url = typeof call[0] === 'string' ? call[0] : call[0].url;
      return url.includes(path) && (!method || (call[1]?.method || 'GET') === method);
    })
    .map((call: any[]) => (call[1]?.body ? JSON.parse(call[1].body) : null));
}

function renderCheckout() {
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
      <Checkout />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_STRIPE_PUBLIC_KEY', 'pk_test_dummy');
  window.history.replaceState({}, '', '/checkout/exp-yoga?ticketSkuId=sku-early&quantity=1&discount=aticco-token');
  intentReply = paid();
  bookingReply = { ok: true, body: { booking: { id: 'booking-1' }, message: 'Confirmed' } };

  global.fetch = vi.fn(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/api/create-payment-intent')) return { ok: true, json: async () => intentReply } as any;
    if (url.includes('/api/bookings') && init?.method === 'POST') {
      return {
        ok: bookingReply.ok,
        status: bookingReply.status ?? 200,
        json: async () => bookingReply.body,
        text: async () => JSON.stringify(bookingReply.body),
      } as any;
    }
    if (url.includes('/api/experiences/exp-yoga')) return { ok: true, json: async () => experience } as any;
    return { ok: true, json: async () => ({}) } as any;
  }) as any;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('a 100% discount link', () => {
  it('sends the link with the free booking, so the server does not price it at €35', async () => {
    intentReply = freeByDiscount;
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByTestId('button-confirm-free-rsvp'));

    await waitFor(() => expect(callsTo('/api/bookings', 'POST').length).toBe(1));
    expect(callsTo('/api/bookings', 'POST')[0]).toMatchObject({
      experienceId: 'exp-yoga',
      amount: 0,
      ticketSkuId: 'sku-early',
      discountToken: 'aticco-token',
    });
  });

  it('also names the link when asking for the price', async () => {
    intentReply = freeByDiscount;
    renderCheckout();
    await screen.findByTestId('button-confirm-free-rsvp');
    expect(callsTo('/api/create-payment-intent', 'POST')[0]).toMatchObject({ discountToken: 'aticco-token' });
  });

  it('tells the buyer when the server turns the booking down', async () => {
    intentReply = freeByDiscount;
    bookingReply = {
      ok: false,
      status: 409,
      body: { message: 'Only 1 place is left on this discount link. Choose 1 ticket to use it.' },
    };
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByTestId('button-confirm-free-rsvp'));

    expect(await screen.findByText(/Only 1 place is left/)).toBeInTheDocument();
  });

  it('sends no token when the buyer did not arrive through a link', async () => {
    window.history.replaceState({}, '', '/checkout/exp-yoga?ticketSkuId=sku-early&quantity=1');
    intentReply = { ...freeByDiscount, discountPerTicket: 0, discountTotal: 0 };
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByTestId('button-confirm-free-rsvp'));
    await waitFor(() => expect(callsTo('/api/bookings', 'POST').length).toBe(1));
    expect(callsTo('/api/bookings', 'POST')[0].discountToken).toBeUndefined();
  });
});

describe('a discount link at checkout', () => {
  it('shows the saving on its own line when the server applied it', async () => {
    intentReply = paid({ unitPrice: 8.75, fullPrice: 8.75, discountPerTicket: 26.25, discountTotal: 26.25 });
    renderCheckout();

    expect(await screen.findByTestId('summary-discount-line')).toHaveTextContent('26.25');
    expect(screen.queryByTestId('notice-discount-refused')).not.toBeInTheDocument();
  });

  it('says why when the server refused it, instead of quietly charging the full price', async () => {
    intentReply = paid({ discountNotice: 'This discount is for a different ticket type.' });
    renderCheckout();

    const notice = await screen.findByTestId('notice-discount-refused');
    expect(notice).toHaveTextContent('This discount is for a different ticket type.');
    expect(screen.queryByTestId('summary-discount-line')).not.toBeInTheDocument();
  });

  it('says nothing about a link when there was none', async () => {
    window.history.replaceState({}, '', '/checkout/exp-yoga?ticketSkuId=sku-early&quantity=1');
    renderCheckout();
    await screen.findByTestId('stripe-elements');
    expect(screen.queryByTestId('notice-discount-refused')).not.toBeInTheDocument();
  });
});
