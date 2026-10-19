import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DiscountLinkManager from '../components/DiscountLinkManager';

// "Limit uses" counted bookings, so a link meant for five free places could give
// away ten tickets in one booking. The limit is now places, counted in tickets,
// and the organiser is told so where they set it.

const apiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({ apiRequest: (...args: any[]) => apiRequest(...args) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const link = (changes: Record<string, unknown> = {}) => ({
  id: 'link-1', discountId: 'aticco', token: 't', url: 'https://x/e?discount=t', label: null,
  maxRedemptions: 5, redemptionCount: 2, active: true, discountTitle: 'Aticco Members', discountSummary: '100% off',
  ...changes,
});

function renderManager(links: unknown[]) {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ ok: true, json: async () => links });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DiscountLinkManager experienceId="exp-1" discountId="aticco" discountTitle="Aticco Members" />
    </QueryClientProvider>,
  );
}

describe('the discount link limit', () => {
  beforeEach(() => { apiRequest.mockReset(); });

  it('asks for places, and says they are counted in tickets', async () => {
    renderManager([]);
    expect(await screen.findByText('Limit places (optional)')).toBeInTheDocument();
    expect(screen.getByTestId('hint-discount-link-cap-aticco')).toHaveTextContent(/tickets, not bookings/);
  });

  it('shows how many places a limited link has used', async () => {
    renderManager([link()]);
    expect(await screen.findByText('2 of 5 places used')).toBeInTheDocument();
  });

  it('shows plain ticket use for a link with no limit', async () => {
    const { unmount } = renderManager([link({ maxRedemptions: null, redemptionCount: 1 })]);
    expect(await screen.findByText('1 ticket used')).toBeInTheDocument();
    unmount();
    renderManager([link({ maxRedemptions: null, redemptionCount: 7 })]);
    expect(await screen.findByText('7 tickets used')).toBeInTheDocument();
  });
});
