import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VenueDashboard from '../pages/venue-dashboard';

// Two reports from the Venue Dashboard:
//
//  1. "Offer to Host" and "Counter Offer" were taller than the screen with no
//     way to scroll, so the Submit button sat off-screen and the venue could
//     not answer at all.
//  2. The Commercial Model dropdown must match the creator's allowed list,
//     including sponsorship while excluding the disabled Pay-at-Counter deal.

vi.mock('wouter', () => ({
  useLocation: () => ['/venue-dashboard', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));
vi.mock('@/components/ProtectedRoute', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('@/components/Breadcrumb', () => ({ default: () => <div /> }));
vi.mock('@/hooks/useBreadcrumbs', () => ({ useBreadcrumbs: () => [] }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useRoleAuth', () => ({
  useVenueAuth: () => ({
    user: { id: 'user-1', role: 'venue_provider' },
    isAuthenticated: true,
    hasRequiredRole: true,
    isLoading: false,
  }),
}));

const approvedVenue = { id: 'venue-1', name: 'Bandido Cafe', status: 'approved', city: 'Barcelona' };

const dayEvent = {
  id: 'exp-day',
  title: 'The Saturday Social Sweat',
  slug: 'saturday-social-sweat',
  experienceType: 'one-day',
  startDate: '2026-08-29T00:00:00.000Z',
  endDate: '2026-08-29T00:00:00.000Z',
  location: 'Barcelona',
  maxParticipants: 50,
  price: '10.00',
  currency: 'eur',
  venueTargetDeal: 'revenue_share',
  venueRelationshipStatus: 'open',
  requestedContract: null,
};

const multiDayEvent = {
  ...dayEvent,
  id: 'exp-trip',
  title: '3-Day Coastal Retreat',
  experienceType: 'multi-day',
  startDate: '2026-09-04T00:00:00.000Z',
  endDate: '2026-09-07T00:00:00.000Z',
};

function renderDashboard(openEvents: any[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const res = await fetch(String((queryKey as unknown[])[0]));
          return res.json();
        },
      },
      mutations: { retry: false },
    },
  });

  global.fetch = vi.fn(async (input: any) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const body = url.includes('/api/user/venues')
      ? [approvedVenue]
      : url.includes('/api/venue/open-events')
        ? openEvents
        : url.includes('/api/venue/ledger')
          ? { totalSales: 0, myShare: 0, bookingsCount: 0 }
          : url.includes('/api/venue/analytics')
            ? {}
            : [];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;

  return render(
    <QueryClientProvider client={queryClient}>
      <VenueDashboard />
    </QueryClientProvider>,
  );
}

async function openOfferModal(openEvents: any[]) {
  const user = userEvent.setup();
  renderDashboard(openEvents);

  await user.click(await screen.findByRole('tab', { name: /open events/i }));
  await user.click(await screen.findByRole('button', { name: /offer to host/i }));

  return { user, dialog: await screen.findByRole('dialog') };
}

describe('Venue "Offer to Host" modal', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Radix Select drives its listbox through pointer capture and scrolling,
    // neither of which jsdom implements.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.scrollIntoView = () => {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrolls, so the submit button stays reachable on a short screen', async () => {
    const { dialog } = await openOfferModal([dayEvent]);

    // Bounded height plus a y-scroll is what keeps the tail of a long modal —
    // including Submit — inside the viewport.
    expect(dialog.className).toMatch(/overflow-y-auto/);
    expect(dialog.className).toMatch(/max-h-\[90vh\]/);
    expect(within(dialog).getByRole('button', { name: /submit offer to creator/i })).toBeInTheDocument();
  });

  it('offers a day event every deal the creator could have proposed', async () => {
    const { user, dialog } = await openOfferModal([dayEvent]);

    await user.click(within(dialog).getByTestId('select-venue-offer-model'));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /venue sponsorship/i })).toBeInTheDocument();
    });
    expect(screen.getAllByRole('option')).toHaveLength(4);
    for (const label of [
      /revenue split/i,
      /ticket deduction/i,
      /upfront rental/i,
      /venue sponsorship/i,
    ]) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('option', { name: /access-only|pay-at-counter/i })).not.toBeInTheDocument();
  });

  it('never lands a multi-day event on a deal it cannot be offered', async () => {
    // The form used to default to Access-Only, which a retreat is never
    // offered — it appeared as a fifth, invalid option in the venue's list.
    const { user, dialog } = await openOfferModal([multiDayEvent]);

    await user.click(within(dialog).getByTestId('select-venue-offer-model'));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /per room \/ per night/i })).toBeInTheDocument();
    });
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.queryByRole('option', { name: /access-only/i })).not.toBeInTheDocument();
  });
});
