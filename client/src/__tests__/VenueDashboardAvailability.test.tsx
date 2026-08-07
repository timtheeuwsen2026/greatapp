import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VenueAvailabilityManager } from '@/components/VenueAvailabilityManager';
import { VenueIcalSync } from '@/components/VenueIcalSync';
import { setAccessToken } from '@/lib/authToken';

// Live bug, reported from production: opening the venue dashboard's
// Availability tab replaced the whole page with "Something went wrong —
// u.map is not a function".
//
// Both components fetched an owner-only endpoint with a bare fetch(), which
// carries no Authorization header. The server answered 401 with a JSON error
// body, `.json()` parsed it into an object, and the render then called .map
// on it. The throw escaped to the error boundary and took the dashboard with
// it — so a venue owner could not reach their own calendar at all.

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const originalFetch = global.fetch;

beforeEach(() => {
  setAccessToken(null);
});

afterEach(() => {
  global.fetch = originalFetch;
  setAccessToken(null);
  vi.restoreAllMocks();
});

/** Answers every request the way the server does for an unauthenticated caller. */
function respondUnauthorized() {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as any;
}

/** Answers with a real availability list. */
function respondWithBlocks() {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify([
      {
        id: 'block-1',
        venueId: 'venue-1',
        startDate: '2026-10-12T00:00:00.000Z',
        endDate: '2026-10-16T00:00:00.000Z',
        status: 'blocked',
        source: 'ical_import',
        notes: 'Imported from your calendar — Reserved',
      },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  ) as any;
}

describe('Venue dashboard availability', () => {
  it('does not crash when the availability request is refused', async () => {
    respondUnauthorized();
    renderWithClient(<VenueAvailabilityManager venueId="venue-1" />);

    // The page survives and explains itself instead of throwing.
    await waitFor(() => {
      expect(screen.getByText(/could not load your availability/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId('availability-manager')).toBeInTheDocument();
  });

  it('sends the auth token so the owner actually gets their blocks', async () => {
    setAccessToken('test-token');
    respondWithBlocks();

    renderWithClient(<VenueAvailabilityManager venueId="venue-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('availability-block-block-1')).toBeInTheDocument();
    });
    expect(screen.getByText(/imported from your calendar/i)).toBeInTheDocument();

    const [, init] = (global.fetch as any).mock.calls.find(
      ([url]: [string]) => String(url).includes('/availability'),
    );
    expect(init?.headers?.Authorization).toBeTruthy();
  });

  it('renders a list even if the server sends something that is not one', async () => {
    // No shape of response should be able to white-screen the dashboard again.
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'unexpected' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as any;

    renderWithClient(<VenueAvailabilityManager venueId="venue-1" />);

    // The list falls back to empty rather than throwing on a bad shape.
    await waitFor(() => {
      expect(screen.getByText(/no availability blocks set/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId('availability-manager')).toBeInTheDocument();
  });
});

describe('Venue calendar sync panel', () => {
  it('sends the auth token so the owner sees their calendar links', async () => {
    setAccessToken('test-token');
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        importUrls: ['https://www.airbnb.com/calendar/ical/1.ics'],
        exportUrl: 'https://app.example/api/venues/venue-1/ical/tok.ics',
        lastSyncedAt: null,
        lastSyncError: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ) as any;

    renderWithClient(<VenueIcalSync venueId="venue-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('venue-ical-sync')).toBeInTheDocument();
    });
    expect(screen.getByTestId('input-ical-export-url')).toHaveValue(
      'https://app.example/api/venues/venue-1/ical/tok.ics',
    );

    const [, init] = (global.fetch as any).mock.calls[0];
    expect(init?.headers?.Authorization).toBe('Bearer test-token');
  });

  it('says why it is empty rather than showing blank boxes', async () => {
    respondUnauthorized();
    renderWithClient(<VenueIcalSync venueId="venue-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('ical-sync-unavailable')).toBeInTheDocument();
    });
    // A blank export field would read as "you have no calendar link".
    expect(screen.queryByTestId('input-ical-export-url')).not.toBeInTheDocument();
  });
});
