import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CreatorDashboard from '../pages/creator-dashboard';

// Bandido Cafe never received their invitation and the creator had no way to
// send it again short of rebuilding the whole event.

const toast = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/creator-dashboard?tab=venue-offers', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));
vi.mock('@/components/ProtectedRoute', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('@/components/DashboardGuard', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('@/components/Breadcrumb', () => ({ default: () => <div /> }));
vi.mock('@/components/CreatorFlashDealFeed', () => ({ CreatorFlashDealFeed: () => <div /> }));
vi.mock('@/components/embedded-pricing-calculator', () => ({ default: () => <div /> }));
vi.mock('@/hooks/useBreadcrumbs', () => ({ useBreadcrumbs: () => [] }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/hooks/useRoleAuth', () => ({
  useCreatorAuth: () => ({
    user: { id: 'creator-1', role: 'creator' },
    isAuthenticated: true,
    hasRequiredRole: true,
    isLoading: false,
  }),
}));

const sentInvite = {
  id: 'invite-1',
  experienceId: 'exp-1',
  experienceTitle: 'The Saturday Social Sweat',
  venueName: 'Bandido Cafe',
  email: 'hello@bandido.test',
  proposedModel: 'revenue_share',
  proposedValue: 40,
  currency: 'eur',
  status: 'pending',
  sentAt: '2026-08-09T18:46:43.653Z',
  lastSentAt: '2026-08-09T18:46:43.653Z',
};

let resendResponse: { status: number; body: any };
let requests: Array<{ url: string; method: string }>;

function renderDashboard() {
  requests = [];
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

  global.fetch = vi.fn(async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input.url);
    requests.push({ url, method: init?.method || 'GET' });

    if (url.includes('/resend')) {
      return new Response(JSON.stringify(resendResponse.body), {
        status: resendResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = url.includes('/api/creator/venue-invites')
      ? [sentInvite]
      : url.includes('/api/creator-profile')
        ? { id: 'profile-1', completed: true }
        : url.includes('/api/creator/onboard')
          ? { completed: true }
          : [];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;

  return render(
    <QueryClientProvider client={queryClient}>
      <CreatorDashboard />
    </QueryClientProvider>,
  );
}

/** The sent-invitations list lives on the Venue Offers tab. */
async function openVenueOffers() {
  const user = userEvent.setup();
  renderDashboard();
  await user.click(await screen.findByRole('tab', { name: /venue offers/i }));
  return user;
}

describe('Resending a venue invitation', () => {
  beforeEach(() => {
    toast.mockClear();
    resendResponse = { status: 200, body: { success: true, email: 'hello@bandido.test' } };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers a resend on an invitation still waiting on the venue', async () => {
    await openVenueOffers();

    const card = await screen.findByTestId('sent-venue-invite-invite-1');
    expect(card).toHaveTextContent('Bandido Cafe');
    expect(within(card).getByTestId('button-resend-venue-invite-invite-1')).toBeInTheDocument();
  });

  it('asks the server to send it again and says so', async () => {
    const user = await openVenueOffers();

    await user.click(await screen.findByTestId('button-resend-venue-invite-invite-1'));

    await waitFor(() => {
      expect(requests.some((r) =>
        r.method === 'POST' && r.url.includes('/api/creator/venue-invites/invite-1/resend'),
      )).toBe(true);
    });
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Invitation resent' }));
    });
  });

  it('passes the cooldown back to the creator rather than claiming it sent', async () => {
    resendResponse = {
      status: 429,
      body: { message: 'An invitation already went to hello@bandido.test moments ago. You can send it again in 4 minutes.' },
    };
    const user = await openVenueOffers();

    await user.click(await screen.findByTestId('button-resend-venue-invite-invite-1'));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Could not resend',
        description: expect.stringContaining('send it again in 4 minutes'),
        variant: 'destructive',
      }));
    });
  });
});
