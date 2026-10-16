import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IdeaFlow from '../components/CreateFlow/IdeaFlow';

// "Create experience" is one flow that starts as an idea: what are you thinking
// of, and who is it for. What is answered is saved as the event's draft, and the
// builder opens on that draft already holding it.

const apiRequest = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/queryClient', () => ({ apiRequest: (...args: any[]) => apiRequest(...args) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('wouter', () => ({ useLocation: () => ['/create-experience', navigate] }));
// The real picker is a popover calendar; a native field keeps the test about the
// flow and still hands back the same YYYY-MM-DD strings.
vi.mock('@/components/CreateFlow/DayPickerField', () => ({
  default: ({ value, onChange, placeholder, 'data-testid': testId }: any) => (
    <input
      data-testid={testId}
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const json = (body: any) => ({ json: async () => body });

const VENUES = [
  { id: 'venue-1', name: 'Jardinet del Mar', city: 'Barcelona' },
  { id: 'venue-2', name: 'Bandido Cafe', city: 'Madrid' },
];

function lastDraftCall() {
  const calls = apiRequest.mock.calls.filter(([, url]) => String(url).startsWith('/api/experience-drafts'));
  return calls[calls.length - 1];
}

beforeEach(() => {
  // 14 Oct 2026. Only Date is faked so user-event and promises keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0));
  // jsdom logs "not implemented" for this; the flow only uses it to return to the top.
  window.scrollTo = vi.fn() as any;
  apiRequest.mockReset();
  navigate.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/venues?approved=true') return json(VENUES);
    if (method === 'POST' && url === '/api/experience-drafts') return json({ id: 'draft-1' });
    if (method === 'PUT' && url === '/api/experience-drafts/draft-1') return json({ id: 'draft-1' });
    throw new Error(`Unexpected ${method} ${url}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderFlow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <IdeaFlow />
    </QueryClientProvider>,
  );
}

async function fillTitle(user: ReturnType<typeof userEvent.setup>, title = 'Halloween coffee rave') {
  await user.type(screen.getByTestId('idea-title'), title);
}

describe('Create experience — screen 1, idea, date, place', () => {
  it('opens on the idea question with three ways to say when', () => {
    renderFlow();
    expect(screen.getByRole('heading', { name: 'What are you thinking of?' })).toBeInTheDocument();
    for (const mode of ['exact', 'period', 'open']) expect(screen.getByTestId(`idea-mode-${mode}`)).toBeInTheDocument();
    expect(screen.queryByTestId('idea-back')).not.toBeInTheDocument();
  });

  it('shows one progress segment per idea screen, the first filled', () => {
    renderFlow();
    expect(screen.getByTestId('idea-progress')).toHaveAttribute('aria-valuemax', '2');
    expect(screen.getByTestId('idea-progress-segment-1')).toHaveAttribute('data-filled', 'true');
    expect(screen.getByTestId('idea-progress-segment-2')).toHaveAttribute('data-filled', 'false');
  });

  it('will not continue without a title, and saves nothing', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.click(screen.getByTestId('idea-continue'));

    expect(screen.getByTestId('idea-error-title')).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith('POST', '/api/experience-drafts', expect.anything());
  });

  it('lets the date stay open, saving the event with no date', async () => {
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));
    expect(screen.getByTestId('idea-open-date-note')).toHaveTextContent(/need one before you can publish/);
    await user.click(screen.getByTestId('idea-continue'));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Who is it for?' })).toBeInTheDocument());
    const [method, url, payload] = lastDraftCall();
    expect([method, url]).toEqual(['POST', '/api/experience-drafts']);
    expect(payload).toMatchObject({ title: 'Halloween coffee rave', startDate: null, endDate: null });
    expect(payload.concept).toMatchObject({ stage: 'concept', dateMode: 'open' });
  });

  it('asks for the date in Exact date mode, then saves it as the event date', async () => {
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-continue'));
    expect(screen.getByTestId('idea-error-exact-start')).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith('POST', '/api/experience-drafts', expect.anything());

    fireEvent.change(screen.getByTestId('idea-exact-start'), { target: { value: '2026-10-31' } });
    fireEvent.change(screen.getByTestId('idea-start-time'), { target: { value: '16:00' } });
    await user.click(screen.getByTestId('idea-continue'));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Who is it for?' })).toBeInTheDocument());
    expect(lastDraftCall()[2]).toMatchObject({
      startDate: '2026-10-31T12:00:00.000Z', endDate: '2026-10-31T12:00:00.000Z', startTime: '16:00', type: 'one-day',
    });
  });

  it('refuses a date in the past', async () => {
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    fireEvent.change(screen.getByTestId('idea-exact-start'), { target: { value: '2026-10-01' } });
    await user.click(screen.getByTestId('idea-continue'));

    expect(screen.getByTestId('idea-error-exact-start')).toHaveTextContent(/past/);
  });

  it('takes a period with a day preference, and keeps the date columns empty', async () => {
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-period'));
    // Any day is selected until they say otherwise.
    expect(screen.getByTestId('idea-day-any')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('idea-day-weekends'));

    await user.click(screen.getByTestId('idea-continue'));
    expect(screen.getByTestId('idea-error-period-start')).toBeInTheDocument();
    expect(screen.getByTestId('idea-error-period-end')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('idea-period-start'), { target: { value: '2026-10-25' } });
    fireEvent.change(screen.getByTestId('idea-period-end'), { target: { value: '2026-11-01' } });
    await user.click(screen.getByTestId('idea-continue'));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Who is it for?' })).toBeInTheDocument());
    const payload = lastDraftCall()[2];
    expect(payload.startDate).toBeNull();
    expect(payload.concept).toMatchObject({
      dateMode: 'period', periodStart: '2026-10-25', periodEnd: '2026-11-01', dayPreference: 'weekends',
    });
  });

  it('suggests Great venues as the place is typed, and links the one picked', async () => {
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));

    await user.type(screen.getByTestId('idea-place'), 'Jard');
    await user.click(await screen.findByTestId('idea-venue-venue-1'));
    expect(screen.getByTestId('idea-linked-venue')).toHaveTextContent('Jardinet del Mar');
    expect(screen.getByTestId('idea-place')).toHaveValue('Jardinet del Mar, Barcelona');

    await user.click(screen.getByTestId('idea-continue'));
    await waitFor(() => expect(lastDraftCall()).toBeDefined());
    expect(lastDraftCall()[2]).toMatchObject({
      selectedVenueId: 'venue-1', venueType: 'catalog', location: 'Jardinet del Mar, Barcelona',
    });
    expect(lastDraftCall()[2].concept).toMatchObject({ linkedVenueId: 'venue-1' });
  });

  it('lets the place stay open, and unlinks a venue when the text is edited', async () => {
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.type(screen.getByTestId('idea-place'), 'Jard');
    await user.click(await screen.findByTestId('idea-venue-venue-1'));

    await user.type(screen.getByTestId('idea-place'), 'x');
    expect(screen.queryByTestId('idea-linked-venue')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('idea-continue'));
    await waitFor(() => expect(lastDraftCall()).toBeDefined());
    expect(lastDraftCall()[2].selectedVenueId).toBeNull();
  });

  it('still works as a plain text field when the venue list cannot be loaded', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/venues?approved=true') throw new Error('offline');
      if (method === 'POST') return json({ id: 'draft-1' });
      throw new Error(`Unexpected ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.type(screen.getByTestId('idea-place'), 'Barceloneta');
    await user.click(screen.getByTestId('idea-continue'));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Who is it for?' })).toBeInTheDocument());
    expect(lastDraftCall()[2]).toMatchObject({ location: 'Barceloneta', selectedVenueId: null });
  });
});

describe('Create experience — screen 2, who is it for', () => {
  async function toScreenTwo(user: ReturnType<typeof userEvent.setup>) {
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Who is it for?' });
  }

  it('fills the audience from a suggestion chip, and the second progress segment', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);

    await user.click(screen.getByTestId('idea-chip-runners'));
    expect(screen.getByTestId('idea-audience')).toHaveValue('Runners');
    expect(screen.getByTestId('idea-chip-runners')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('idea-progress-segment-2')).toHaveAttribute('data-filled', 'true');
  });

  it('takes any audience text, not only the suggestions', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.type(screen.getByTestId('idea-audience'), 'Dog owners');
    expect(screen.getByTestId('idea-audience')).toHaveValue('Dog owners');
  });

  it('rejects a range whose top is below its bottom', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.type(screen.getByTestId('idea-group-min'), '60');
    await user.type(screen.getByTestId('idea-group-max'), '10');
    await user.click(screen.getByTestId('idea-continue'));

    expect(screen.getByTestId('idea-error-group-max')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('updates the same draft and hands over to the builder on it', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);

    await user.click(screen.getByTestId('idea-chip-runners'));
    await user.type(screen.getByTestId('idea-group-min'), '10');
    await user.type(screen.getByTestId('idea-group-max'), '60');
    await user.click(screen.getByTestId('idea-continue'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/event-builder/draft-1', { replace: true }));
    const [method, url, payload] = lastDraftCall();
    expect([method, url]).toEqual(['PUT', '/api/experience-drafts/draft-1']);
    // The group's top becomes the event's capacity; the rest travels in the concept.
    expect(payload.maxParticipants).toBe(60);
    expect(payload.concept).toMatchObject({ audience: 'Runners', groupSizeMin: 10, groupSizeMax: 60 });
    expect(apiRequest.mock.calls.filter(([m]) => m === 'POST')).toHaveLength(1);
  });

  it('replaces the flow in history, so Back from the builder cannot start a second draft', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.click(screen.getByTestId('idea-continue'));
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(navigate.mock.calls[0][1]).toEqual({ replace: true });
  });

  it('refuses a group bigger than the builder allows', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.type(screen.getByTestId('idea-group-max'), '500');
    await user.click(screen.getByTestId('idea-continue'));

    expect(screen.getByTestId('idea-error-group-max')).toHaveTextContent(/200/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets every answer be skipped', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.click(screen.getByTestId('idea-continue'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/event-builder/draft-1', { replace: true }));
  });

  it('goes back with the earlier answers intact, and keeps updating the one draft', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.click(screen.getByTestId('idea-back'));

    expect(screen.getByTestId('idea-title')).toHaveValue('Halloween coffee rave');
    expect(screen.getByTestId('idea-mode-open')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Who is it for?' });
    const draftWrites = apiRequest.mock.calls.filter(([, url]) => String(url).startsWith('/api/experience-drafts'));
    expect(draftWrites.map(([m]) => m)).toEqual(['POST', 'PUT']);
  });
});

describe('Create experience — keyboard and small things', () => {
  it('continues when Enter is pressed in the title', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.type(screen.getByTestId('idea-title'), 'Halloween coffee rave{Enter}');
    await screen.findByRole('heading', { name: 'Who is it for?' });
  });

  it('does not submit when a button other than Continue is pressed', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByTestId('idea-mode-period'));
    await user.click(screen.getByTestId('idea-day-weekends'));
    await user.click(screen.getByTestId('idea-mode-open'));
    expect(apiRequest).not.toHaveBeenCalledWith('POST', '/api/experience-drafts', expect.anything());
  });

  it('forgets an old save error as soon as something is edited', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/venues?approved=true') return json([]);
      throw new Error('500');
    });
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByTestId('idea-save-error');

    await user.type(screen.getByTestId('idea-title'), '!');
    expect(screen.queryByTestId('idea-save-error')).not.toBeInTheDocument();
  });
});

describe('Create experience — saving', () => {
  it('stays put and says so when the save fails', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/venues?approved=true') return json([]);
      throw new Error('500');
    });
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.click(screen.getByTestId('idea-continue'));

    expect(await screen.findByTestId('idea-save-error')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What are you thinking of?' })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    // And it can be tried again.
    expect(screen.getByTestId('idea-continue')).toBeEnabled();
  });

  it('does not save twice when Continue is pressed twice', async () => {
    let release: (value: any) => void = () => {};
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/venues?approved=true') return json([]);
      if (method === 'POST') return new Promise((resolve) => { release = resolve; });
      throw new Error(`Unexpected ${method} ${url}`);
    });
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.click(screen.getByTestId('idea-continue'));
    await user.click(screen.getByTestId('idea-continue'));

    expect(apiRequest.mock.calls.filter(([m]) => m === 'POST')).toHaveLength(1);
    release(json({ id: 'draft-1' }));
    await screen.findByRole('heading', { name: 'Who is it for?' });
  });

  it('treats a draft that comes back without an id as a failed save', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/venues?approved=true') return json([]);
      return json({});
    });
    const user = userEvent.setup();
    renderFlow();
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.click(screen.getByTestId('idea-continue'));

    expect(await screen.findByTestId('idea-save-error')).toBeInTheDocument();
  });
});
