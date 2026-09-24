import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddPartnerModal from '../components/AddPartnerModal';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn(async () => ({ json: async () => [] })) }));
function modal(paidTicketsConfigured = true) {
  const save = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => [], gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AddPartnerModal open onOpenChange={() => {}} onSave={save} initialPartnerType="affiliate" paidTicketsConfigured={paidTicketsConfigured} /></QueryClientProvider>);
  return save;
}
it('never renders an unselected commission field on a free event', async () => {
  modal(false);
  expect(await screen.findByTestId('text-no-paid-ticket')).toBeTruthy();
  expect(screen.queryByTestId('input-partner-commission')).toBeNull();
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
