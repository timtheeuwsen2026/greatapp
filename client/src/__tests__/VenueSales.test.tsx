import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VenueSales from '../components/VenueSales';
import type { VenueEventSales } from '@shared/venueSales';

vi.mock('wouter', () => ({ useLocation: () => ['/venue-dashboard', vi.fn()] }));

const sales = (overrides: Partial<VenueEventSales> = {}): VenueEventSales => ({
  experienceId: 'e1', slugOrId: 'bandido-5k', title: 'Good Soles X Bandido', venueName: 'Bandido Cafe',
  startDate: '2026-11-01T07:00:00Z', timing: 'upcoming', currency: 'eur', capacity: 50,
  booked: 3, reserved: 12, expected: 15, checkedIn: 0,
  addons: [{ name: '1 drink (wine, beer, soda)', quantity: 4, venueEarned: 6 }], addonEarned: 6, ...overrides,
});

function renderSales(data: VenueEventSales[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => data } } });
  return render(<QueryClientProvider client={client}><VenueSales /></QueryClientProvider>);
}

describe('the venue Sales tab', () => {
  it('shows who to expect out of the capacity, and the add-ons to prepare', async () => {
    renderSales([sales()]);
    expect(await screen.findByTestId('venue-sales-expected-e1')).toHaveTextContent('15 / 50');
    expect(screen.getByTestId('venue-sales-addons-e1')).toHaveTextContent('1 drink (wine, beer, soda) × 4');
    expect(screen.getByTestId('venue-sales-addons-e1')).toHaveTextContent('Yours from add-ons (paid)');
  });

  it('says so when no event has used the venue yet', async () => {
    renderSales([]);
    expect(await screen.findByTestId('venue-sales-empty')).toBeInTheDocument();
  });
});
