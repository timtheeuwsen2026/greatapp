import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TravelerBookings from '../pages/TravelerBookings';

// QA V13 Bug 1.3: a fully paid €10 booking showed
// "Deposit Paid $0.00 | Remaining Balance $10.00 | Total Price $10.00" with a
// "Pending — Awaiting confirmation" badge. The balance was invented from
// total - deposit, and every amount was hardcoded to dollars.

vi.mock('wouter', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));

const paidBooking = {
  id: 'bk-1',
  experienceId: 'exp-1',
  userId: 'user-1',
  status: 'fully_paid',
  amount: '10.00',
  isDepositOnly: false,
  balancePaid: true,
  depositAmount: '0.00',
  balanceAmount: '0.00',
  balanceDueDate: null,
  totalPrice: '10.00',
  ticketName: 'General Ticket',
  ticketQuantity: 1,
  createdAt: new Date().toISOString(),
  experience: {
    id: 'exp-1',
    title: 'The GREAT Sweat & Social Bootcamp',
    coverImageUrl: null,
    startDate: new Date(Date.now() + 20 * 86400000).toISOString(),
    endDate: new Date(Date.now() + 20 * 86400000).toISOString(),
    location: 'Barcelona',
    venue: null,
    price: '10.00',
    currency: 'EUR',
    requireMinimumParticipants: false,
    minimumParticipants: 0,
    currentParticipants: 3,
    mvgMet: false,
  },
};

const heldMvgBooking = {
  ...paidBooking,
  id: 'bk-2',
  status: 'pending',
  experience: { ...paidBooking.experience, requireMinimumParticipants: true, minimumParticipants: 10 },
};

function renderBookings(bookings: any[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const url = (queryKey as string[]).join('/');
          if (url.includes('/api/auth/user')) return { id: 'user-1' };
          return bookings;
        },
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TravelerBookings />
    </QueryClientProvider>,
  );
}

describe('My Bookings payment summary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a fully paid booking as paid, in euros, with no phantom balance', async () => {
    const user = userEvent.setup();
    renderBookings([paidBooking]);

    const card = await screen.findByTestId('card-booking-bk-1');
    expect(screen.getByTestId('badge-booking-status-bk-1')).toHaveTextContent('Paid');
    expect(screen.getByTestId('text-booking-deposit-bk-1')).toHaveTextContent('Paid: €10.00');

    await user.click(card);

    expect(await screen.findByTestId('text-detail-deposit')).toHaveTextContent('Amount Paid');
    expect(screen.getByTestId('text-detail-deposit')).toHaveTextContent('€10.00');
    expect(screen.getByTestId('text-detail-total')).toHaveTextContent('€10.00');
    expect(screen.queryByTestId('text-detail-balance')).not.toBeInTheDocument();
    expect(screen.getByTestId('text-detail-no-balance')).toBeInTheDocument();
    expect(screen.queryByText('$10.00')).not.toBeInTheDocument();
  });

  it('explains that a minimum-group booking is held, not awaiting payment', async () => {
    renderBookings([heldMvgBooking]);

    expect(await screen.findByTestId('badge-booking-status-bk-2')).toHaveTextContent('Payment Held');
  });
});
