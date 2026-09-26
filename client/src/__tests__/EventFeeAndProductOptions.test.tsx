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
  expect(screen.getAllByLabelText('Participant price').map(input => (input as HTMLInputElement).value)).toEqual(['7.45', '7.75']);
  await user.click(screen.getByRole('checkbox', { name: 'Add Latte + loaf' }));
  await user.click(screen.getByRole('checkbox', { name: 'Add Matcha + loaf' }));
  expect(JSON.parse(screen.getByTestId('selected-items').textContent!)).toEqual([{ id: 'latte', quantity: 1 }, { id: 'matcha', quantity: 1 }]);
});
