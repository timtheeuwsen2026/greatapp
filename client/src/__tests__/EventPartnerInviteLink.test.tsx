import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EventPartnerInvitePage from '../pages/event-partner-invite';

// A community that accepted and opens its invite again is looking for its link.

const navigate = vi.fn();
let authState: any;
vi.mock('wouter', () => ({ useParams: () => ({ token: 'tok' }), useLocation: () => ['/invite/tok', navigate] }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn() }));
vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));

const invite = (partner: Record<string, any>) => ({
  partner: {
    id: 'p-rotd', partnerName: 'Rave Of The Day', partnerType: 'community', typeLabel: 'Community',
    dealType: 'member_discount', dealLabel: 'Member discount', termSummary: '10% off', status: 'confirmed', ...partner,
  },
  event: { id: 'rave', slug: 'juice-y-rave', title: 'Juice y Rave', startDate: null, location: null, coverImageUrl: null },
  organizerName: 'Pedro',
});

function renderPage(data: any) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => data } } });
  return render(<QueryClientProvider client={client}><EventPartnerInvitePage /></QueryClientProvider>);
}

beforeEach(() => {
  navigate.mockReset();
  authState = { user: { id: 'user-rotd' }, isAuthenticated: true, isLoading: false };
});

describe('the invite page after accepting', () => {
  it('shows the partner their link, with a way to copy it', async () => {
    renderPage(invite({ shareUrl: 'https://great/experience/juice-y-rave?ref=rotd&share=s1' }));
    expect(await screen.findByText('https://great/experience/juice-y-rave?ref=rotd&share=s1')).toBeInTheDocument();
    expect(screen.getByText('Your link for this event')).toBeInTheDocument();
  });

  it('takes them to Partner Home in one click', async () => {
    renderPage(invite({ shareUrl: 'https://great/x' }));
    fireEvent.click(await screen.findByTestId('button-open-partner-home'));
    expect(navigate).toHaveBeenCalledWith('/partner');
  });

  it('asks a signed-out visitor to sign in to see their link', async () => {
    authState = { user: null, isAuthenticated: false, isLoading: false };
    renderPage(invite({ shareUrl: null }));
    fireEvent.click(await screen.findByText('Sign in to see your link'));
    expect(navigate).toHaveBeenCalledWith('/login?returnTo=/invite/tok');
  });
});
