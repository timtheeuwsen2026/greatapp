import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminPaymentDifferences, { type PaymentDifference } from '../components/AdminPaymentDifferences';

const row = (overrides: Partial<PaymentDifference> = {}): PaymentDifference => ({
  id: 'd1', kind: 'refund_not_recorded', bookingId: 'b1', experienceTitle: 'Juice y Rave', buyerEmail: 'anna@example.com',
  stripePaymentIntentId: 'pi_1', greatStatus: 'pending', stripeStatus: 'succeeded', amountCents: 600, currency: 'eur',
  note: 'Refunded in Stripe but still counted in Great.', autoFixed: false, paymentCreatedAt: '2026-10-15T19:13:00Z',
  firstSeenAt: '2026-11-05T08:00:00Z', resolvedAt: null, ...overrides,
});

function renderList(data: PaymentDifference[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => data } } });
  return render(<QueryClientProvider client={client}><AdminPaymentDifferences /></QueryClientProvider>);
}

describe('the admin Great vs Stripe list', () => {
  it('shows open differences with what is wrong, and leaves fixed ones behind a toggle', async () => {
    renderList([row(), row({ id: 'd2', kind: 'uncollected_hold', autoFixed: true, resolvedAt: '2026-11-05T08:00:00Z' })]);
    expect(await screen.findByTestId('payment-difference-d1')).toHaveTextContent('Refunded in Stripe, not in Great');
    expect(screen.queryByTestId('payment-difference-d2')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-differences-summary')).toHaveTextContent('1 open difference');
    expect(screen.getByTestId('toggle-fixed-differences')).toHaveTextContent('Show 1 fixed or cleared');
  });

  it('says so when Great and Stripe agree', async () => {
    renderList([]);
    expect(await screen.findByText('Nothing open: Great and Stripe agree.')).toBeInTheDocument();
  });
});
