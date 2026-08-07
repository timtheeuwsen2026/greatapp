import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VenueAvailability from '@/components/VenueAvailability';
import { setAccessToken } from '@/lib/authToken';

// Reported from production, clicking "Add Block" in the venue builder:
//
//   TypeError: Cannot read properties of undefined (reading 'from')
//   Network error: '/api/venues/<id>/availability' is not a valid HTTP method
//
// Two faults in one dialog. apiRequest takes (method, url, body) and was
// called (url, method, body), so fetch got the URL where the verb belongs.
// And the range picker reports a cleared selection as undefined, which went
// straight into state behind an `as any`, so every later read of .from threw
// and the error boundary ate the page.

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const originalFetch = global.fetch;
let requests: Array<{ url: string; method?: string; body?: any }>;

beforeEach(() => {
  setAccessToken('test-token');
  requests = [];
  global.fetch = vi.fn(async (url: any, init: any) => {
    requests.push({
      url: String(url),
      method: init?.method,
      body: init?.body ? JSON.parse(init.body) : undefined,
    });
    // A GET for the list returns an array; anything else is a written block.
    const isList = !init?.method || init.method === 'GET';
    return new Response(JSON.stringify(isList ? [] : { id: 'block-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as any;
});

afterEach(() => {
  global.fetch = originalFetch;
  setAccessToken(null);
  vi.restoreAllMocks();
});

/** Opens the dialog and clicks a day, returning the user-event instance. */
async function openDialogAndPickDay(dayLabel: string) {
  const user = userEvent.setup();
  renderWithClient(<VenueAvailability venueId="venue-1" />);

  await user.click(await screen.findByTestId('button-add-date-block'));
  const dialog = await screen.findByRole('dialog');
  const day = within(dialog).getAllByText(dayLabel, { selector: 'button, [role="gridcell"] *' })[0]
    ?? within(dialog).getAllByText(dayLabel)[0];
  await user.click(day);
  return user;
}


describe('Adding an availability block', () => {
  it('sends POST as the method, not as the URL', async () => {
    const user = await openDialogAndPickDay('15');

    await user.click(screen.getByTestId('button-save-block'));

    await waitFor(() => {
      expect(requests.some((request) => request.method === 'POST')).toBe(true);
    });

    const post = requests.find((request) => request.method === 'POST')!;
    // The whole bug: this used to be the URL.
    expect(post.method).toBe('POST');
    expect(post.url).toContain('/api/venues/venue-1/availability');
  });

  it('treats one chosen day as a single-day block', async () => {
    const user = await openDialogAndPickDay('15');

    await user.click(screen.getByTestId('button-save-block'));

    await waitFor(() => {
      expect(requests.some((request) => request.method === 'POST')).toBe(true);
    });

    const post = requests.find((request) => request.method === 'POST')!;
    // Closing off a single date is ordinary and used to be impossible.
    expect(post.body.startDate).toBeTruthy();
    expect(post.body.endDate).toBe(post.body.startDate);
  });

  it('survives the selection being cleared', async () => {
    const user = await openDialogAndPickDay('15');

    // Clicking the chosen start date again clears the range. The picker
    // reports that as undefined, which used to take the page down.
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getAllByText('15')[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('button-save-block')).toBeInTheDocument();
  });
});
