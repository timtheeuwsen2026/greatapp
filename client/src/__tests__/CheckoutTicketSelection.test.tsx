import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Checkout from '../pages/checkout';

// QA V13 Bug 1.2: "Complete Checkout" threw
// `Payment setup failed 400: {"message":"Select a ticket before checkout"}`
// whenever the buyer reached /checkout/:id without a ticketSkuId — which every
// entry point except the ticket list on the event page does.

vi.mock('wouter', () => ({
  useRoute: () => [true, { id: 'exp-multi' }],
  useLocation: () => ['/checkout/exp-multi', vi.fn()],
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

const multiTicketExperience = {
  id: 'exp-multi',
  title: 'The GREAT Sweat & Social Bootcamp',
  description: 'Bootcamp',
  price: 10,
  pricePerPerson: 10,
  startDate: new Date(Date.now() + 20 * 86400000).toISOString(),
  endDate: new Date(Date.now() + 20 * 86400000).toISOString(),
  location: 'Barcelona',
  maxParticipants: 20,
  currentParticipants: 0,
  currency: 'EUR',
  ticketSkus: [
    { id: 'sku-ga', ticketName: 'General Ticket', pricePerPerson: 10, ticketCapacity: 20, soldCount: 0 },
    { id: 'sku-coffee', ticketName: 'Ticket + Coffee', pricePerPerson: 12, ticketCapacity: 10, soldCount: 0 },
  ],
};

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

describe('Checkout ticket selection', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/checkout/exp-multi');
    vi.stubEnv('VITE_STRIPE_PUBLIC_KEY', 'pk_test_dummy');
    global.fetch = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/experiences/exp-multi')) {
        return { ok: true, json: async () => multiTicketExperience } as any;
      }
      if (url.includes('/api/create-payment-intent')) {
        return {
          ok: true,
          json: async () => ({
            clientSecret: 'pi_test_secret',
            fullPrice: 10,
            unitPrice: 10,
            ticketQuantity: 1,
            ticketName: 'General Ticket',
            ticketSkuId: 'sku-ga',
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

  it('asks which ticket to buy instead of failing payment setup', async () => {
    renderCheckout();

    expect(await screen.findByText('Choose your ticket')).toBeInTheDocument();
    expect(screen.getByText('General Ticket')).toBeInTheDocument();
    expect(screen.getByText('Ticket + Coffee')).toBeInTheDocument();
    expect(screen.queryByText('Payment setup failed')).not.toBeInTheDocument();

    const calledUrls = (global.fetch as any).mock.calls.map((call: any[]) =>
      typeof call[0] === 'string' ? call[0] : call[0].url,
    );
    expect(calledUrls.some((url: string) => url.includes('/api/create-payment-intent'))).toBe(false);
  });

  it('creates the PaymentIntent for the ticket the buyer picks', async () => {
    const user = userEvent.setup();
    renderCheckout();

    await screen.findByText('Choose your ticket');
    await user.click(screen.getByTestId('checkout-select-ticket-0'));

    await waitFor(() => {
      const intentCall = (global.fetch as any).mock.calls.find((call: any[]) => {
        const url = typeof call[0] === 'string' ? call[0] : call[0].url;
        return url.includes('/api/create-payment-intent');
      });
      expect(intentCall).toBeDefined();
      expect(JSON.parse(intentCall[1].body)).toMatchObject({
        experienceId: 'exp-multi',
        ticketSkuId: 'sku-ga',
        ticketQuantity: 1,
      });
    });
  });
});
