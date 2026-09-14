import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PartnerToolingGate from '../components/PartnerToolingGate';

/**
 * The gate must not decide before it knows who is asking.
 *
 * QA N-1: a signed-in Creator opening /collab-opportunities or
 * /tutorials/partners by URL was told "Sign in to see this" and stayed told.
 * The access token lives in a module variable that AuthContext fills in once
 * Supabase returns a session, so a query fired on mount went out with no
 * Authorization header and came back 401 — and with the app's `retry: false`
 * and `staleTime: Infinity`, that 401 was permanent. Two shipped features were
 * dark to the exact roles they were built for.
 */

let mockAuth: { user: any; isAuthenticated: boolean; isLoading: boolean };

vi.mock('wouter', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockAuth }));

let requestCount = 0;

function renderGate() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // The app's own defaults, which are what made the 401 permanent.
        retry: false,
        staleTime: Infinity,
        queryFn: async ({ queryKey }) => {
          requestCount += 1;
          const res = await fetch((queryKey as string[]).join('/'));
          if (!res.ok) throw new Error(`${res.status}: unauthorized`);
          return res.json();
        },
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PartnerToolingGate>
        <div data-testid="tooling">The commercial model</div>
      </PartnerToolingGate>
    </QueryClientProvider>,
  );
}

function respondWith(body: any, ok = true, status = 200) {
  global.fetch = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as any;
}

beforeEach(() => {
  requestCount = 0;
  mockAuth = { user: null, isAuthenticated: false, isLoading: true };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PartnerToolingGate — waiting for the session', () => {
  it('asks nothing while the session is still being restored', async () => {
    respondWith({}, false, 401);
    renderGate();

    expect(await screen.findByText(/checking access/i)).toBeTruthy();
    // The request that used to go out unauthenticated and poison the cache.
    expect(requestCount).toBe(0);
  });

  it('does not tell a loading visitor to sign in', () => {
    respondWith({}, false, 401);
    renderGate();

    expect(screen.queryByText(/sign in to see this/i)).toBeNull();
  });

  it('opens for an approved partner once the session has landed', async () => {
    mockAuth = { user: { id: 'u1', role: 'creator' }, isAuthenticated: true, isLoading: false };
    respondWith({
      state: 'approved',
      canUseTooling: true,
      onboardingHref: null,
      title: '',
      message: '',
    });

    renderGate();
    expect(await screen.findByTestId('tooling')).toBeTruthy();
  });

  it('still refuses a partner who has not been approved yet', async () => {
    mockAuth = { user: { id: 'u1', role: 'creator' }, isAuthenticated: true, isLoading: false };
    respondWith({
      state: 'pending_review',
      canUseTooling: false,
      onboardingHref: null,
      title: 'Your profile is with our team',
      message: 'We review every new creator before opening the deal tooling.',
    });

    renderGate();
    expect(await screen.findByText(/your profile is with our team/i)).toBeTruthy();
    expect(screen.queryByTestId('tooling')).toBeNull();
  });

  it('tells a genuinely signed-out visitor to sign in', async () => {
    mockAuth = { user: null, isAuthenticated: false, isLoading: false };
    respondWith({}, false, 401);

    renderGate();
    expect(await screen.findByText(/sign in to see this/i)).toBeTruthy();
    // Nothing to ask: there is no session to check.
    expect(requestCount).toBe(0);
  });

  it('reads a 401 after the session settled as an expired session, not a glitch', async () => {
    mockAuth = { user: { id: 'u1', role: 'creator' }, isAuthenticated: true, isLoading: false };
    respondWith({}, false, 401);

    renderGate();
    expect(await screen.findByText(/sign in to see this/i)).toBeTruthy();
  });

  it('says the check failed — not "sign in" — when the server errors', async () => {
    mockAuth = { user: { id: 'u1', role: 'creator' }, isAuthenticated: true, isLoading: false };
    respondWith({}, false, 500);

    renderGate();
    await waitFor(() => expect(screen.getByText(/couldn't check your access/i)).toBeTruthy());
    expect(screen.queryByTestId('tooling')).toBeNull();
  });
});
