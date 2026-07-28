import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Bookings from '../pages/bookings';

// The /bookings page used to read flat `booking.experienceTitle` fields that its
// endpoint never returned, so every row said "Experience Booking / Date TBD /
// Location TBD". It now shares /api/bookings/my-bookings with /my-bookings.

vi.mock('wouter', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));

const enrichedBooking = {
  id: 'bk-1',
  experienceId: 'exp-1',
  status: 'fully_paid',
  amount: '10.00',
  totalPrice: '10.00',
  depositAmount: '0.00',
  balanceAmount: '0.00',
  balancePaid: true,
  balanceDueDate: null,
  bookingDate: new Date('2026-07-20').toISOString(),
  createdAt: new Date('2026-07-20').toISOString(),
  stripePaymentIntentId: 'pi_123',
  experience: {
    id: 'exp-1',
    title: 'The GREAT Sweat & Social Bootcamp',
    shortDescription: 'Bootcamp on the beach',
    coverImageUrl: null,
    startDate: new Date('2026-08-15T09:00:00.000Z').toISOString(),
    endDate: new Date('2026-08-15T12:00:00.000Z').toISOString(),
    location: 'Barcelona',
    venue: '',
    price: '10.00',
    currency: 'eur',
    requireMinimumParticipants: false,
    minimumParticipants: 0,
    currentParticipants: 4,
    mvgMet: false,
  },
};

let requestedKeys: string[];

function renderBookings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const url = (queryKey as string[]).join('/');
          requestedKeys.push(url);
          if (url.includes('/api/auth/user')) return { id: 'user-1', email: 'qa@test.dev' };
          if (url.includes('/api/bookings/my-bookings')) return [enrichedBooking];
          if (url.includes('/api/user/reservations')) return [];
          return [];
        },
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Bookings />
    </QueryClientProvider>,
  );
}

describe('Bookings page event details', () => {
  beforeEach(() => {
    requestedKeys = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the real event title, date and location instead of placeholders', async () => {
    renderBookings();

    expect(await screen.findByTestId('text-booking-title-bk-1')).toHaveTextContent(
      'The GREAT Sweat & Social Bootcamp',
    );
    expect(screen.getByTestId('text-booking-location-bk-1')).toHaveTextContent('Barcelona');
    expect(screen.getByTestId('text-booking-date-bk-1')).not.toHaveTextContent('Date TBD');
    expect(screen.getByTestId('text-booking-description-bk-1')).toHaveTextContent(
      'Bootcamp on the beach',
    );
    expect(screen.queryByText('Experience Booking')).not.toBeInTheDocument();
    expect(screen.queryByText('Location TBD')).not.toBeInTheDocument();
  });

  it('reads the same endpoint as the /my-bookings page', async () => {
    renderBookings();

    await screen.findByTestId('text-booking-title-bk-1');
    expect(requestedKeys).toContain('/api/bookings/my-bookings');
    expect(requestedKeys).not.toContain('/api/user/bookings');
  });

  it('formats the amount in the event currency and reports the paid status', async () => {
    renderBookings();

    expect(await screen.findByTestId('text-booking-amount-bk-1')).toHaveTextContent('€10');
    expect(screen.getByTestId('badge-status-bk-1')).toHaveTextContent('Paid');
  });
});
