import { it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddPartnerModal from '../components/AddPartnerModal';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn(async () => ({ json: async () => [] })) }));
function modal(paidTicketsConfigured = true, initialPartnerType: any = 'affiliate') {
  const save = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => [], gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AddPartnerModal open onOpenChange={() => {}} onSave={save} initialPartnerType={initialPartnerType} paidTicketsConfigured={paidTicketsConfigured} /></QueryClientProvider>);
  return save;
}
// Tim, 66.33 (14 Nov): the price is set after Partners, so Commission per
// Ticket always stays on offer, with the line that it applies once priced.
it('keeps Commission per Ticket on offer while every ticket is still free', async () => {
  modal(false);
  expect(await screen.findByTestId('input-partner-commission')).toBeTruthy();
  expect(screen.getByTestId('text-commission-needs-price').textContent).toBe('Applies once you set a ticket price.');
  expect(screen.queryByTestId('text-no-paid-ticket')).toBeNull();
});
it('offers Commission per Ticket for every partner type on a free event', async () => {
  for (const type of ['community', 'sponsor_brand', 'service_provider']) {
    modal(false, type);
    expect(await screen.findByTestId('partner-deal-commission_per_ticket')).toBeTruthy();
    cleanup();
  }
});
it('drops the price line once a ticket has a price', async () => {
  modal(true);
  expect(await screen.findByTestId('input-partner-commission')).toBeTruthy();
  expect(screen.queryByTestId('text-commission-needs-price')).toBeNull();
  expect(screen.getByTestId('text-commission-from-your-share').textContent).toContain("not the venue's");
});
it('uses the deal names decided on 14 Nov, with an example', async () => {
  modal(true, 'community'); const user = userEvent.setup();
  expect(await screen.findByTestId('partner-deal-milestone_barter')).toBeTruthy();
  expect(screen.getByTestId('partner-deal-milestone_barter').textContent).toContain('Bring people, get a reward');
  await user.click(screen.getByText('Commission per Ticket'));
  expect(screen.getByTestId('partner-deal-example-commission_per_ticket').textContent).toContain('on a €10.00 ticket they earn €1.00');
});
it('switches the visible terms with the selected deal', async () => {
  modal(); const user = userEvent.setup();
  expect(await screen.findByTestId('input-partner-commission')).toBeTruthy();
  await user.click(screen.getByText('Discount for their members'));
  expect(await screen.findByTestId('input-partner-member-discount')).toBeTruthy();
  expect(screen.queryByTestId('input-partner-commission')).toBeNull();
  await user.click(screen.getByText('Commission per Ticket'));
  expect(await screen.findByTestId('input-partner-commission')).toBeTruthy();
  expect(screen.queryByTestId('input-partner-member-discount')).toBeNull();
});
