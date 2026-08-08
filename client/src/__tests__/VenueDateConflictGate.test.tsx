import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VenueDateConflictNotice } from '@/components/VenueDateConflictNotice';
import { setAccessToken } from '@/lib/authToken';

// UAT feedback: the creator picks dates on step 3 and a venue on step 4. If
// the venue is booked on those dates, the clash has to surface on step 4 —
// the screen they are actually on — not at the final submit.

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const originalFetch = global.fetch;

beforeEach(() => setAccessToken('test-token'));
afterEach(() => {
  global.fetch = originalFetch;
  setAccessToken(null);
  vi.restoreAllMocks();
});

function respond(body: unknown, status = 200) {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  ) as any;
}

const BOOKED = {
  available: false,
  conflicts: [{
    startDate: '2026-10-12T00:00:00.000Z',
    endDate: '2026-10-16T00:00:00.000Z',
    source: 'ical_import',
  }],
};

describe('Venue date conflict notice', () => {
  it('names the clash and how to fix it from the venue step', async () => {
    respond(BOOKED);
    renderWithClient(
      <VenueDateConflictNotice
        venueId="venue-1"
        startDate="2026-10-14T00:00:00.000Z"
        endDate="2026-10-18T00:00:00.000Z"
        resolution="venue"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('venue-dates-conflict')).toBeInTheDocument();
    });
    expect(screen.getByText(/this venue is booked on your selected dates/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a different venue, or go back to the dates step/i)).toBeInTheDocument();
    expect(screen.getByText(/won't be able to continue/i)).toBeInTheDocument();
  });

  it('points at the venue instead when shown on the dates step', async () => {
    respond(BOOKED);
    renderWithClient(
      <VenueDateConflictNotice
        venueId="venue-1"
        startDate="2026-10-14T00:00:00.000Z"
        endDate="2026-10-18T00:00:00.000Z"
        resolution="dates"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/go back to the dates step to change your dates/i)).toBeInTheDocument();
    });
  });

  it('says where the block came from', async () => {
    respond(BOOKED);
    renderWithClient(
      <VenueDateConflictNotice venueId="venue-1" startDate="2026-10-14T00:00:00.000Z" endDate="2026-10-18T00:00:00.000Z" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('venue-date-conflict-0')).toBeInTheDocument();
    });
    expect(screen.getByText(/booked on the venue's own calendar/i)).toBeInTheDocument();
  });

  it('confirms free dates rather than staying silent', async () => {
    respond({ available: true, conflicts: [] });
    renderWithClient(
      <VenueDateConflictNotice venueId="venue-1" startDate="2026-12-01T00:00:00.000Z" endDate="2026-12-05T00:00:00.000Z" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('venue-dates-available')).toBeInTheDocument();
    });
  });

  it('shows nothing until a venue and dates are both chosen', () => {
    respond({ available: true, conflicts: [] });
    const { container } = renderWithClient(
      <VenueDateConflictNotice venueId={null} startDate="2026-12-01T00:00:00.000Z" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('does not block on a failed check', async () => {
    // A check we could not run must not masquerade as a clash. The handshake
    // routes verify again before anything is agreed.
    respond({ message: 'boom' }, 500);
    const { container } = renderWithClient(
      <VenueDateConflictNotice venueId="venue-1" startDate="2026-10-14T00:00:00.000Z" endDate="2026-10-18T00:00:00.000Z" />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByTestId('venue-dates-conflict')).not.toBeInTheDocument();
  });
});
