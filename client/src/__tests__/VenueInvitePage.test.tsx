import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VenueInvitePage from '../pages/venue-invite';

// QA V13 Bug 2.1: "Invite External Venue" emailed a link to the public event
// page, so an off-platform venue had no way to claim their space, create an
// account or answer the proposed deal.

let mockAuth = { isAuthenticated: false, isLoading: false, user: null as any };

vi.mock('wouter', () => ({
  useRoute: () => [true, { token: 'tok-123' }],
  useLocation: () => ['/venue-invite/tok-123', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockAuth }));

const invite = {
  token: 'tok-123',
  status: 'pending',
  expiresAt: null,
  contactName: 'Maria',
  email: 'maria@casaverde.test',
  venue: {
    name: 'Casa Verde Rooftop',
    address: 'Carrer de Prova 1',
    city: 'Barcelona',
    description: null,
    capacity: 40,
    propertyUrl: null,
  },
  deal: { model: 'revenue_share', value: 50, currency: 'eur' },
  experience: {
    id: 'exp-1',
    slug: 'coastal-retreat',
    title: '3-Day Coastal Wellness Retreat',
    shortDescription: 'Yoga and breathwork on the coast',
    coverImageUrl: null,
    startDate: '2026-08-28T00:00:00.000Z',
    endDate: '2026-08-30T00:00:00.000Z',
    location: 'Barcelona',
    maxParticipants: 16,
    currency: 'eur',
    requireMinimumParticipants: true,
    minimumParticipants: 2,
    capacity: 16,
    ticketTypes: [
      { name: 'The Run & Coffee Pass', price: '€10.00' },
      { name: 'The Run & Smoothie Pass', price: '€12.50' },
    ],
  },
  creator: { firstName: 'Great App', lastName: null },
  claimedVenueId: null,
};

let fetchCalls: Array<{ url: string; method: string }>;

function renderInvite(overrides: Record<string, any> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const res = await fetch((queryKey as string[]).join('/'));
          if (!res.ok) throw new Error('not found');
          return res.json();
        },
      },
    },
  });

  const payload = { ...invite, ...overrides };
  global.fetch = vi.fn(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    fetchCalls.push({ url, method: init?.method || 'GET' });
    if (url.includes('/claim')) {
      return { ok: true, json: async () => ({ success: true, venueId: 'venue-1', experienceId: 'exp-1' }) } as any;
    }
    if (url.includes('/decline')) {
      return { ok: true, json: async () => ({ success: true }) } as any;
    }
    if (url.includes('/api/venue/offers/')) {
      return { ok: true, json: async () => ({ success: true }) } as any;
    }
    if (url.includes('/api/venue-invites/')) {
      return { ok: true, json: async () => payload } as any;
    }
    return { ok: true, json: async () => ({}) } as any;
  }) as any;

  return render(
    <QueryClientProvider client={queryClient}>
      <VenueInvitePage />
    </QueryClientProvider>,
  );
}

describe('Venue invite claim page', () => {
  beforeEach(() => {
    fetchCalls = [];
    mockAuth = { isAuthenticated: false, isLoading: false, user: null };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the event and the proposed deal instead of the public event page', async () => {
    renderInvite();

    expect(await screen.findByTestId('invite-heading')).toHaveTextContent(
      'Great App wants to host at Casa Verde Rooftop',
    );
    expect(screen.getByTestId('invite-deal-summary')).toHaveTextContent('Revenue Split — 50% of ticket sales');
    expect(screen.getByTestId('invite-event-card')).toHaveTextContent('3-Day Coastal Wellness Retreat');
    expect(screen.getByTestId('invite-venue-card')).toHaveTextContent('Casa Verde Rooftop');
  });

  // A venue offered "50%" could not tell what it was 50% of.
  it('shows the capacity and ticket prices the deal is a share of', async () => {
    renderInvite();

    expect(await screen.findByTestId('invite-capacity')).toHaveTextContent('16 spots');

    const tickets = screen.getByTestId('invite-ticket-types');
    expect(tickets).toHaveTextContent('The Run & Coffee Pass');
    expect(tickets).toHaveTextContent('€10.00');
    expect(tickets).toHaveTextContent('The Run & Smoothie Pass');
    expect(tickets).toHaveTextContent('€12.50');
  });

  it('leaves the context out rather than showing an empty block', async () => {
    renderInvite({
      experience: { ...invite.experience, maxParticipants: null, capacity: null, ticketTypes: [] },
    });

    expect(await screen.findByTestId('invite-deal-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-value-context')).not.toBeInTheDocument();
  });

  it('offers account creation to a venue that is not signed in', async () => {
    renderInvite();

    expect(await screen.findByTestId('invite-signin')).toBeInTheDocument();
    expect(screen.queryByTestId('invite-claim')).not.toBeInTheDocument();
  });

  it('claims the venue and accepts the offer once signed in', async () => {
    mockAuth = { isAuthenticated: true, isLoading: false, user: { id: 'user-1' } };
    const user = userEvent.setup();
    renderInvite();

    await user.click(await screen.findByTestId('invite-claim'));

    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url.includes('/claim') && c.method === 'POST')).toBe(true);
      expect(fetchCalls.some((c) => c.url.includes('/api/venue/offers/exp-1/accept'))).toBe(true);
    });
  });

  it('lets the venue decline with a reason', async () => {
    mockAuth = { isAuthenticated: true, isLoading: false, user: { id: 'user-1' } };
    const user = userEvent.setup();
    renderInvite();

    await user.click(await screen.findByTestId('invite-decline'));
    await user.type(screen.getByTestId('invite-decline-reason'), 'Fully booked');
    await user.click(screen.getByTestId('invite-decline-confirm'));

    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url.includes('/decline') && c.method === 'POST')).toBe(true);
    });
  });

  it('explains an expired invitation rather than failing silently', async () => {
    renderInvite({ status: 'expired' });

    expect(await screen.findByTestId('invite-expired')).toBeInTheDocument();
  });

  it('explains an already declined invitation', async () => {
    renderInvite({ status: 'declined' });

    expect(await screen.findByTestId('invite-declined')).toBeInTheDocument();
  });
});
