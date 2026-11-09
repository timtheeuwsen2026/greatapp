import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminPayoutOverview, { overviewCsv, type PayoutOverview } from '../components/AdminPayoutOverview';

const overview: PayoutOverview = {
  balance: { currency: 'eur', availableCents: 13464, incomingCents: 2500 },
  balanceError: null,
  owedCents: 4600,
  events: [{
    payoutId: 'p1', experienceId: 'e1', title: 'Juice y Rave - Halloween Edition', currency: 'eur',
    payoutStatus: 'pending', scheduledFor: '2026-11-08T23:00:00Z', processedAt: null, errorMessage: null,
    grossCents: 6000, platformFeeCents: 900, owedCents: 4600, planError: null,
    lines: [
      { key: 'venue', role: 'venue', name: 'Bandido Cafe', email: 'hi@bandido.example', amountCents: 1200, stripeConnected: false, settled: null },
      { key: 'creator', role: 'organiser', name: 'Juice y Rave', email: 'jr@example.com', amountCents: 3400, stripeConnected: true, settled: null },
    ],
  }],
};

function renderOverview(data: PayoutOverview) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => data } } });
  return render(<QueryClientProvider client={client}><AdminPayoutOverview /></QueryClientProvider>);
}

describe('the admin payouts per event', () => {
  it('shows who gets how much and who still needs a Stripe account, with Pay now', async () => {
    renderOverview(overview);
    expect(await screen.findByTestId('payout-line-p1-venue')).toHaveTextContent('No Stripe account');
    expect(screen.getByTestId('payout-line-p1-creator')).toHaveTextContent('Stripe connected');
    expect(screen.getByTestId('payout-owed')).toHaveTextContent('46');
    expect(screen.getByTestId('button-pay-now-p1')).toBeInTheDocument();
  });

  it('downloads the same list as a spreadsheet', () => {
    const csv = overviewCsv(overview);
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv).toContain('"Bandido Cafe","Venue","hi@bandido.example","12.00","no"');
  });
});
