import { it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Form } from '../components/ui/form';
import { PricingStep } from '../components/EventBuilder/EventBuilder';
import { formatPriceByCurrency } from '@shared/pricingService';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, isAuthenticated: false }) }));
vi.mock('@/hooks/usePlatformFee', () => ({ usePlatformFee: () => 15 }));

const coffee = { id: 'rsvp', ticketName: 'Sunday RSVP', pricingMode: 'free_rsvp', pricePerPerson: 0,
  ticketCapacity: 80, addonEnabled: true, addons: [
    { id: 'coffee', addonName: 'Coffee and loaf', addonVenuePrice: 7.75, addonChargeAmount: 7.75 },
  ] };

function showPricing(tickets: any[]) {
  function Fixture() {
    const form = useForm({ defaultValues: { type: 'one-day', currency: 'eur', maxParticipants: 80,
      rooms: [], ticketSkus: tickets, venueType: 'catalog', selectedVenueId: '',
      venueCompensationModel: 'revenue_share', venueRevenueSharePct: 80,
      ticketPlatformFeePct: 15, addonPlatformFeePct: 0,
      discounts: [], eventPartners: [], requireMinimumParticipants: false } });
    return <Form {...form}><PricingStep form={form} /></Form>;
  }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Fixture /></QueryClientProvider>);
}

it('includes coffee revenue above the grand total when all entry tickets are free', () => {
  showPricing([coffee]);
  expect(screen.getByTestId('ticket-sku-entry-revenue-0').textContent).toBe(formatPriceByCurrency(0, 'eur'));
  expect(screen.getByTestId('ticket-sku-addon-revenue-0').textContent).toContain('620.00');
  expect(screen.getByTestId('ticket-sku-revenue-0').textContent).toContain('620.00');
  expect(screen.getByTestId('text-total-revenue').textContent).toContain('620.00');
  expect(within(screen.getByTestId('text-economics-ticket_gross')).getByText(formatPriceByCurrency(0, 'eur'))).toBeTruthy();
  expect(screen.getByTestId('text-economics-addon_gross').textContent).toContain('620.00');
  expect(screen.getByTestId('text-economics-addon_platform_fee').textContent).toContain('0.00');
  expect(screen.getByTestId('text-your-payout').textContent).toBe(formatPriceByCurrency(124, 'eur'));
});

it('adds every product once, respects separate stock limits, and keeps attendee capacity unchanged', async () => {
  showPricing([{ ...coffee, ticketCapacity: 20, addons: [
    { ...coffee.addons[0], addonInventory: 10 },
    { id: 'matcha', addonName: 'Matcha', addonVenuePrice: 8, addonChargeAmount: 8, addonInventory: 5 },
  ] }, { id: 'paid', ticketName: 'Paid entry', pricingMode: 'fixed', pricePerPerson: 10, ticketCapacity: 10 }]);
  expect(screen.getByTestId('ticket-sku-revenue-0').textContent).toContain('117.50');
  expect(screen.getByTestId('ticket-sku-revenue-1').textContent).toContain('100.00');
  expect(screen.getByTestId('text-total-revenue').textContent).toContain('217.50');
  expect(screen.getByTestId('text-total-capacity').textContent).toContain('30 people');
  expect(screen.getByTestId('text-economics-ticket_gross').textContent).toContain('100.00');
  expect(screen.getByTestId('text-economics-addon_gross').textContent).toContain('117.50');
  expect(screen.getByTestId('text-your-payout').textContent).toBe(formatPriceByCurrency(28.5, 'eur'));
  const user = userEvent.setup();
  await user.click(screen.getByTestId('checkbox-ticket-addon-enabled-0'));
  await waitFor(() => expect(screen.getByTestId('text-total-revenue').textContent).toContain('100.00'));
  expect(screen.getByTestId('ticket-sku-revenue-0').textContent).toBe(formatPriceByCurrency(0, 'eur'));
  expect(screen.queryByTestId('text-total-addon-revenue')).toBeNull();
});

it('uses the event capacity for a single legacy add-on ticket without its own capacity', () => {
  showPricing([{ id: 'legacy', ticketName: 'Run', pricingMode: 'combi', pricePerPerson: 0, addonName: 'Coffee', addonPrice: 5.5 }]);
  expect(screen.getByTestId('ticket-sku-revenue-0').textContent).toContain('440.00');
  expect(screen.getByTestId('text-total-revenue').textContent).toContain('440.00');
});
