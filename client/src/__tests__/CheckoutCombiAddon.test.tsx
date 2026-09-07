import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Checkout from '../pages/checkout';

// The Combi-Ticket format has existed in the builder since it was added — a
// creator could name and price an add-on, and the ticket-level subtotal counted
// it. Nothing on the participant side ever rendered it: a combi showed as a
// plain free RSVP, so the add-on could never be chosen, never charged, and
// never reached the Commercial Model.

vi.mock('wouter', () => ({
  useRoute: () => [true, { id: 'exp-run' }],
  useLocation: () => ['/checkout/exp-run', vi.fn()],
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

// A run club: free to turn up, with the venue's collab coffee on offer.
const combiExperience = {
  id: 'exp-run',
  title: 'Thursday Run Club',
  description: 'Run',
  price: 0,
  pricePerPerson: 0,
  startDate: new Date(Date.now() + 10 * 86400000).toISOString(),
  endDate: new Date(Date.now() + 10 * 86400000).toISOString(),
  location: 'Barcelona',
  maxParticipants: 32,
  currentParticipants: 0,
  currency: 'EUR',
  ticketSkus: [
    {
      id: 'sku-run',
      ticketName: 'Run Club RSVP',
      pricingMode: 'combi',
      pricePerPerson: 0,
      addonName: 'Coffee + Medialuna',
      addonPrice: 5.5,
      ticketCapacity: 32,
      soldCount: 0,
    },
  ],
};

function intentBodies() {
  return (global.fetch as any).mock.calls
    .filter((call: any[]) => {
      const url = typeof call[0] === 'string' ? call[0] : call[0].url;
      return url.includes('/api/create-payment-intent');
    })
    .map((call: any[]) => JSON.parse(call[1].body));
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

describe('Combi-Ticket add-on at checkout', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/checkout/exp-run?ticketSkuId=sku-run&quantity=1');
    vi.stubEnv('VITE_STRIPE_PUBLIC_KEY', 'pk_test_dummy');

    global.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/experiences/exp-run')) {
        return { ok: true, json: async () => combiExperience } as any;
      }
      if (url.includes('/api/create-payment-intent')) {
        const body = init?.body ? JSON.parse(init.body) : {};
        const addonQuantity = Number(body.addonQuantity || 0);
        // Mirrors the server: entry is free, so only a chosen add-on is charged.
        if (addonQuantity <= 0) {
          return {
            ok: true,
            json: async () => ({
              freeRsvp: true,
              clientSecret: null,
              fullPrice: 0,
              ticketQuantity: 1,
              ticketName: 'Run Club RSVP',
              ticketSkuId: 'sku-run',
              addonName: 'Coffee + Medialuna',
              addonUnitPrice: 5.5,
              addonQuantity: 0,
              addonTotal: 0,
            }),
          } as any;
        }
        return {
          ok: true,
          json: async () => ({
            clientSecret: 'pi_test_secret',
            fullPrice: 5.5 * addonQuantity,
            unitPrice: 0,
            ticketQuantity: 1,
            ticketName: 'Run Club RSVP',
            ticketSkuId: 'sku-run',
            addonName: 'Coffee + Medialuna',
            addonUnitPrice: 5.5,
            addonQuantity,
            addonTotal: 5.5 * addonQuantity,
            hasDeposit: false,
            paymentMode: 'full',
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('offers the add-on instead of sending a free RSVP straight through', async () => {
    renderCheckout();

    // The buyer must see the extra before confirming — this screen used to hold
    // only "Confirm RSVP", which is how the add-on became unsellable.
    expect(await screen.findByTestId('free-rsvp-addon-offer')).toBeInTheDocument();
    expect(screen.getByText(/Add Coffee \+ Medialuna\?/i)).toBeInTheDocument();
    expect(screen.getByTestId('button-add-addon')).toHaveTextContent('5.50');
    expect(screen.getByTestId('button-confirm-free-rsvp')).toHaveTextContent(/just RSVP/i);
  });

  it('re-prices through Stripe once the buyer takes the add-on', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByTestId('button-add-addon'));

    await waitFor(() => {
      expect(intentBodies().some((body) => body.addonQuantity === 1)).toBe(true);
    });

    // A free RSVP that took the coffee is a payment, so the free-confirmation
    // screen must give way to the card form.
    await waitFor(() => {
      expect(screen.queryByTestId('free-rsvp-addon-offer')).not.toBeInTheDocument();
    });
    expect(await screen.findByTestId('stripe-elements')).toBeInTheDocument();
  });

  it('bills the add-on on its own line, so a free RSVP never reads as a paid ticket', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByTestId('button-add-addon'));

    const line = await screen.findByTestId('summary-addon-line');
    expect(line).toHaveTextContent('Coffee + Medialuna');
    expect(line).toHaveTextContent('5.50');
  });

  it('asks the server for nothing extra when the buyer declines', async () => {
    renderCheckout();

    await screen.findByTestId('free-rsvp-addon-offer');

    expect(intentBodies().length).toBeGreaterThan(0);
    expect(intentBodies().every((body) => (body.addonQuantity || 0) === 0)).toBe(true);
  });
});
