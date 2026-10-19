import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PartnerPeople from '../components/PartnerPeople';

const apiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({ apiRequest: (...args: any[]) => apiRequest(...args) }));

const summary = (overrides: Record<string, unknown> = {}) => ({
  partnerName: 'AMUNT', currency: 'eur', payoutNote: 'Paid after the event',
  totals: { tickets: 3, checkedIn: 2, dropped: 1, earned: 21, paid: 0 },
  people: [
    { bookingId: 'b1', name: 'Ana L.', tickets: 2, state: 'booked', checkedIn: true, earned: 14, paid: false, bookedAt: null },
    { bookingId: 'b2', name: 'Joan P.', tickets: 1, state: 'cancelled', checkedIn: false, earned: 0, paid: false, bookedAt: null },
  ],
  ...overrides,
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PartnerPeople experienceId="yoga" partnerId="p-amunt" />
    </QueryClientProvider>,
  );
}

describe('the "who they brought" panel', () => {
  beforeEach(() => { apiRequest.mockReset(); });

  it('asks for exactly this partner on this event', async () => {
    apiRequest.mockResolvedValue({ json: async () => summary() });
    renderPanel();
    await screen.findByTestId('partner-people-p-amunt');
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/experiences/yoga/partners/p-amunt/people');
  });

  it('shows booked, checked in and earned, and says it is paid after the event', async () => {
    apiRequest.mockResolvedValue({ json: async () => summary() });
    renderPanel();
    const totals = await screen.findByTestId('partner-people-p-amunt-totals');
    expect(totals).toHaveTextContent('3 booked');
    expect(totals).toHaveTextContent('2 checked in');
    expect(totals).toHaveTextContent('21');
    expect(screen.getByTestId('partner-people-p-amunt-payout-note')).toHaveTextContent('Paid after the event');
    expect(screen.queryByText(/check-in/i)).not.toBeInTheDocument();
  });

  it('lists the people on request, with a cancelled booking marked as such', async () => {
    apiRequest.mockResolvedValue({ json: async () => summary() });
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByTestId('partner-people-p-amunt-toggle'));
    const list = screen.getByTestId('partner-people-p-amunt-list');
    expect(list).toHaveTextContent('Ana L.');
    expect(list).toHaveTextContent('Checked in');
    expect(list).toHaveTextContent('Cancelled');
  });

  it('says what has been paid once it has', async () => {
    apiRequest.mockResolvedValue({ json: async () => summary({ totals: { tickets: 3, checkedIn: 2, dropped: 0, earned: 21, paid: 21 } }) });
    renderPanel();
    expect(await screen.findByTestId('partner-people-p-amunt-payout-note')).toHaveTextContent(/21.*paid/);
  });

  it('says so when nobody has booked yet', async () => {
    apiRequest.mockResolvedValue({ json: async () => summary({ people: [], totals: { tickets: 0, checkedIn: 0, dropped: 0, earned: 0, paid: 0 } }) });
    renderPanel();
    expect(await screen.findByText('Nobody has booked through this link yet.')).toBeInTheDocument();
  });

  it('shows nothing when the server refuses (not the viewer\'s partner)', async () => {
    apiRequest.mockImplementation(() => Promise.reject(new Error('403')));
    const { container } = renderPanel();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
