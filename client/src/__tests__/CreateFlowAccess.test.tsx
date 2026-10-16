import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import EventBuilderPage from '../pages/event-builder';
import { useRoleAuth } from '../hooks/useRoleAuth';
import { IdeaPeriodCard, IdeaSummaryCard } from '../components/CreateFlow/IdeaSummaryCard';

// Every event now starts in Create experience, so the role picked at sign-up can
// no longer decide who gets in. The access gate (approval, onboarding) is
// untouched; only the "must be a Creator" test in front of it is gone.

let authState: any;
const apiRequest = vi.fn();
const profileRequests: string[] = [];

vi.mock('../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: (...a: any[]) => apiRequest(...a) }));
vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));
vi.mock('@/components/PartnerToolingGate', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('@/components/EventBuilder', () => ({ default: () => <div data-testid="event-builder">builder</div> }));

let routeParams: any = {};
let search = '';
vi.mock('wouter', () => ({
  useRoute: () => [true, routeParams],
  useLocation: () => ['/event-builder', vi.fn()],
  useSearch: () => search,
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          profileRequests.push(String(queryKey[0]));
          return authState.creatorProfile ?? null;
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <EventBuilderPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  profileRequests.length = 0;
  routeParams = {};
  search = '';
  apiRequest.mockReset();
});

describe('the builder is open to any signed-in role', () => {
  it.each(['venue_provider', 'promoter', 'service_provider', 'creator'])(
    'lets a %s start choosing what to create',
    async (role) => {
      authState = { user: { id: 'u1', role }, isAuthenticated: true, isLoading: false, creatorProfile: { completed: true } };
      renderPage();
      expect(await screen.findByText('What are you creating?')).toBeInTheDocument();
      expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    },
  );

  it('lets a venue open the builder on its draft without a creator profile', async () => {
    authState = { user: { id: 'u1', role: 'venue_provider' }, isAuthenticated: true, isLoading: false, creatorProfile: null };
    routeParams = { draftId: 'draft-9' };
    renderPage();

    expect(await screen.findByTestId('event-builder')).toBeInTheDocument();
    expect(screen.queryByText('Complete Your Creator Profile')).not.toBeInTheDocument();
    // A venue has no creator profile to look up, so none is requested.
    expect(profileRequests).not.toContain('/api/creator-profile');
  });

  it('still asks a creator to finish their own profile before building', async () => {
    authState = { user: { id: 'u1', role: 'creator' }, isAuthenticated: true, isLoading: false, creatorProfile: { completed: false } };
    routeParams = { draftId: 'draft-9' };
    renderPage();

    expect(await screen.findByText('Complete Your Creator Profile')).toBeInTheDocument();
    expect(screen.queryByTestId('event-builder')).not.toBeInTheDocument();
  });

  it('lets a creator with a finished profile build', async () => {
    authState = { user: { id: 'u1', role: 'creator' }, isAuthenticated: true, isLoading: false, creatorProfile: { completed: true } };
    routeParams = { draftId: 'draft-9' };
    renderPage();
    expect(await screen.findByTestId('event-builder')).toBeInTheDocument();
  });
});

describe('useRoleAuth("any")', () => {
  it('authorises any signed-in account, whatever its role', () => {
    authState = { user: { id: 'u1', role: 'participant' }, isAuthenticated: true, isLoading: false };
    const { result } = renderHook(() => useRoleAuth('any'));
    expect(result.current.isAuthorized).toBe(true);
  });

  it('still refuses a signed-out visitor', () => {
    authState = { user: null, isAuthenticated: false, isLoading: false };
    const { result } = renderHook(() => useRoleAuth('any'));
    expect(result.current.isAuthorized).toBe(false);
  });

  it('keeps a specific role specific', () => {
    authState = { user: { id: 'u1', role: 'venue_provider' }, isAuthenticated: true, isLoading: false };
    expect(renderHook(() => useRoleAuth('creator')).result.current.isAuthorized).toBe(false);
    expect(renderHook(() => useRoleAuth('venue_provider')).result.current.isAuthorized).toBe(true);
  });
});

describe('the builder shows what the idea already said', () => {
  const period = {
    stage: 'concept', dateMode: 'period', periodStart: '2026-10-25', periodEnd: '2026-11-01',
    dayPreference: 'weekends', audience: 'Runners', groupSizeMin: 10, groupSizeMax: 60,
  } as const;

  it('shows the period and asks for the exact date until one is picked', () => {
    const { rerender } = render(<IdeaPeriodCard concept={period} startDate={null} />);
    expect(screen.getByTestId('idea-period-card')).toHaveTextContent('Period: 25 Oct to 1 Nov, weekends');
    expect(screen.getByTestId('idea-period-card')).toHaveTextContent(/required to publish/);

    rerender(<IdeaPeriodCard concept={period} startDate="2026-10-31T12:00:00.000Z" />);
    expect(screen.getByTestId('idea-period-card')).toHaveTextContent(/picked the exact date/);
  });

  it('says there is no date when the idea left it open', () => {
    render(<IdeaPeriodCard concept={{ stage: 'concept', dateMode: 'open' }} startDate={null} />);
    expect(screen.getByTestId('idea-period-card')).toHaveTextContent('No date picked yet');
  });

  it('shows nothing for an idea that already had an exact date, or for no idea at all', () => {
    const { container, rerender } = render(<IdeaPeriodCard concept={{ stage: 'concept', dateMode: 'exact' }} startDate="2026-10-31" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<IdeaPeriodCard concept={null} startDate={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises audience and group size', () => {
    render(<IdeaSummaryCard concept={period} />);
    expect(screen.getByTestId('idea-summary-card')).toHaveTextContent('For Runners · 10 to 60 people');
  });

  it('copes with a half-answered audience screen', () => {
    const { rerender } = render(<IdeaSummaryCard concept={{ stage: 'concept', dateMode: 'open', groupSizeMax: 60 }} />);
    expect(screen.getByTestId('idea-summary-card')).toHaveTextContent('Up to 60 people');
    rerender(<IdeaSummaryCard concept={{ stage: 'concept', dateMode: 'open', audience: 'Everyone' }} />);
    expect(screen.getByTestId('idea-summary-card')).toHaveTextContent('For Everyone');
  });

  it('shows nothing when the idea answered nothing, or the event did not start as one', () => {
    const { container, rerender } = render(<IdeaSummaryCard concept={{ stage: 'concept', dateMode: 'open' }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<IdeaSummaryCard concept={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
