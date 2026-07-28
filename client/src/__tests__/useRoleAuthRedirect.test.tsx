import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useRoleAuth } from '../hooks/useRoleAuth';

// QA V13 Bug 2.2: venue pages "kept refreshing on their own". The session sync
// briefly reports signed-out on every window focus — including when a native
// file picker closes, which happens constantly while filling in the venue form.
// The guard scheduled a hard navigation to login and never cancelled it when the
// session came back, so a signed-in user was bounced out and back again.

let authState = { user: null as any, isAuthenticated: false, isLoading: false };

vi.mock('../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function Guarded() {
  useRoleAuth('venue_provider');
  return <div>venue form</div>;
}

describe('role guard redirect', () => {
  let assignedHref: string;

  beforeEach(() => {
    vi.useFakeTimers();
    assignedHref = '';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/venues/new',
        search: '?venueType=daytime',
        get href() { return assignedHref; },
        set href(value: string) { assignedHref = value; },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not bounce a user whose session comes back before the timer fires', () => {
    authState = { user: null, isAuthenticated: false, isLoading: false };
    const { rerender } = render(<Guarded />);

    // Session revalidates and returns — as it does after every window focus.
    act(() => {
      authState = { user: { id: 'u1', role: 'venue_provider' }, isAuthenticated: true, isLoading: false };
      rerender(<Guarded />);
    });

    act(() => { vi.advanceTimersByTime(10000); });

    expect(assignedHref).toBe('');
  });

  it('sends a genuinely signed-out visitor to login, returning them afterwards', () => {
    authState = { user: null, isAuthenticated: false, isLoading: false };
    render(<Guarded />);

    act(() => { vi.advanceTimersByTime(3000); });

    expect(assignedHref).toContain('/login?returnTo=');
    expect(decodeURIComponent(assignedHref)).toContain('/venues/new?venueType=daytime');
  });

  it('waits while the session is still loading', () => {
    authState = { user: null, isAuthenticated: false, isLoading: true };
    render(<Guarded />);

    act(() => { vi.advanceTimersByTime(10000); });

    expect(assignedHref).toBe('');
  });
});
