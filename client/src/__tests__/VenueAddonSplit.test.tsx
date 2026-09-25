import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VenueDealEditor from '../components/EventBuilder/VenueDealEditor';

function editor(paidTickets = false, addons = true, model = 'revenue_share') {
  const values: Record<string, unknown> = {
    venueCompensationModel: model, venueRevenueSharePct: 80, venueOpenSpaceType: 'coffee_shop',
    ticketSkus: [{ pricingMode: paidTickets ? 'paid' : 'free_rsvp', pricePerPerson: paidTickets ? 10 : 0,
      addonEnabled: addons, addonVenuePrice: 7.75, addonChargeAmount: 7.75 }],
  };
  const setValue = vi.fn();
  render(<VenueDealEditor form={{ watch: (key: string) => values[key], setValue }} currencySymbol="€" isDaytime paidTicketsConfigured={paidTickets} />);
  return setValue;
}
it('explains an 80% coffee share without applying a ticket benchmark', () => {
  editor();
  expect((screen.getByLabelText('Venue share of add-on sales (%)') as HTMLInputElement).value).toBe('80');
  expect(screen.queryByTestId('text-venue-deal-benchmark-outlier')).toBeNull();
  expect(screen.queryByTestId('text-venue-no-paid-ticket')).toBeNull();
  expect(screen.getByTestId('text-addon-share-basis').textContent).toContain('benchmarks do not apply');
});
it('offers Revenue Split for a free event with a paid extra', async () => {
  const save = editor(false, true, 'venue_barter');
  await userEvent.setup().click(screen.getByTestId('venue-deal-revenue_share'));
  expect(save).toHaveBeenCalledWith('venueCompensationModel', 'revenue_share', { shouldDirty: true });
});
it('keeps the ticket benchmark for paid entry with no add-ons', () => {
  editor(true, false);
  expect(screen.getByTestId('text-venue-deal-benchmark-outlier')).toBeTruthy();
});
