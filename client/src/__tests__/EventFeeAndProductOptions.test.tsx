import { useState } from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminEventFees from '../components/AdminEventFees';
import TicketAddonChoicesEditor from '../components/EventBuilder/TicketAddonChoicesEditor';
import AddonChoicePicker from '../components/AddonChoicePicker';
import type { AddonSelection } from '@shared/addonChoices';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('opens per-event settings with a waived add-on fee and saves both rates', async () => {
  const request = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  const user = userEvent.setup();
  render(<QueryClientProvider client={new QueryClient()}><AdminEventFees event={{ id: 'coffee', title: 'Coffee run' }} /></QueryClientProvider>);
  await user.click(screen.getByRole('button', { name: 'Platform fees' }));
  const ticket = screen.getByLabelText('Entry ticket fee (%)') as HTMLInputElement;
  expect(ticket.value).toBe('15');
  expect((screen.getByLabelText('Add-on fee (%)') as HTMLInputElement).value).toBe('0');
  await user.clear(ticket); await user.type(ticket, '5');
  await user.click(screen.getByRole('button', { name: 'Save event fees' }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(request.mock.calls[0][0]).toBe('/api/admin/experiences/coffee/platform-fees');
  expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toEqual({ ticketPlatformFeePct: 5, addonPlatformFeePct: 0 });
});
it('lets an organizer offer multiple catalog products and a buyer choose both on one RSVP', async () => {
  function Fixture() {
    const [addons, setAddons] = useState<any[]>([]);
    const [selections, setSelections] = useState<AddonSelection[]>([]);
    const sku = { id: 'rsvp', addonEnabled: true, addons };
    return <><TicketAddonChoicesEditor sku={sku} catalog={[
      { id: 'latte', name: 'Latte + loaf', venuePrice: 7.45 },
      { id: 'matcha', name: 'Matcha + loaf', venuePrice: 7.75 },
    ]} currency="eur" platformPct={15} addonPlatformPct={0} venueDealModel="revenue_share" venueSharePct={80} onChange={setAddons} />
      <AddonChoicePicker sku={sku} quantity={1} currency="eur" selections={selections} onChange={setSelections} />
      <output data-testid="selected-items">{JSON.stringify(selections)}</output></>;
  }
  const user = userEvent.setup(); render(<Fixture />);
  await user.click(screen.getByRole('checkbox', { name: 'Offer Latte + loaf' }));
  await user.click(screen.getByRole('checkbox', { name: 'Offer Matcha + loaf' }));
  expect(screen.getByTestId('addon-participant-price-latte').textContent).toContain('7.45');
  expect(screen.getByTestId('addon-participant-price-matcha').textContent).toContain('7.75');
  await user.click(screen.getByRole('checkbox', { name: 'Add Latte + loaf' }));
  await user.click(screen.getByRole('checkbox', { name: 'Add Matcha + loaf' }));
  expect(JSON.parse(screen.getByTestId('selected-items').textContent!)).toEqual([{ id: 'latte', quantity: 1 }, { id: 'matcha', quantity: 1 }]);
});
it('prices a product from the venue\'s retail price and discount, and lets the organizer add only a markup', async () => {
  let saved: any[] = [];
  function Fixture({ catalog }: { catalog: any[] }) {
    const [addons, setAddons] = useState<any[]>(saved);
    saved = addons;
    return <TicketAddonChoicesEditor sku={{ id: 'rsvp', addonEnabled: true, addons }} catalog={catalog}
      currency="eur" platformPct={15} addonPlatformPct={15} venueDealModel="revenue_share" venueSharePct={80} onChange={setAddons} />;
  }
  const user = userEvent.setup();
  const { unmount } = render(<Fixture catalog={[{ id: 'coffee', name: 'Coffee', venuePrice: 6.5, discountPct: 20 }]} />);
  await user.click(screen.getByRole('checkbox', { name: 'Offer Coffee' }));
  expect(screen.getByTestId('addon-participant-price-coffee').textContent).toContain('5.20');
  expect(screen.getByTestId('addon-venue-terms-coffee').textContent).toContain('20% event discount, set by the venue');
  // The venue's cost is the venue's to set: the organizer is not asked for it.
  expect(screen.queryByLabelText('Venue cost per item')).toBeNull();

  await user.type(screen.getByLabelText('Your markup per item (optional)'), '.8');
  expect(screen.getByTestId('addon-participant-price-coffee').textContent).toContain('6.00');
  expect(saved[0]).toMatchObject({ addonVenuePrice: 6.5, addonDiscountPct: 20, addonGroupRate: 5.2, addonMarkup: 0.8, addonChargeAmount: 6 });

  // Everything the organizer needs to see their upside, in one place: the
  // venue keeps its discounted price whole even on an 80% revenue split, and
  // Great's 15% comes out of the 0.80 markup, not out of the 6.00 sale.
  const breakdown = screen.getByTestId('addon-breakdown-coffee').textContent!;
  expect(breakdown).toContain("Venue's event discount (20%)");
  expect(breakdown).toContain("Great's fee (15% of your markup)");
  expect(screen.getByTestId('addon-venue-keeps-coffee').textContent).toContain('5.20');
  expect(screen.getByTestId('addon-fee-coffee').textContent).toContain('0.12');
  expect(screen.getByTestId('addon-you-keep-coffee').textContent).toContain('0.68');

  // The venue raises its retail price: the event follows without being re-entered.
  unmount();
  render(<Fixture catalog={[{ id: 'coffee', name: 'Coffee', venuePrice: 7, discountPct: 20 }]} />);
  await waitFor(() => expect(saved[0]).toMatchObject({ addonVenuePrice: 7, addonGroupRate: 5.6, addonChargeAmount: 6.4 }));
  expect(screen.getByTestId('addon-participant-price-coffee').textContent).toContain('6.40');
});
