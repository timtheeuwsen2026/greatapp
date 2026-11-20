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

  it('shows one progress segment per screen known so far, the first filled', () => {
    renderFlow();
    // What, who, what you still need, review. Each picked need adds its own screen.
    expect(screen.getByTestId('idea-progress')).toHaveAttribute('aria-valuemax', '4');
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

async function toScreenTwo(user: ReturnType<typeof userEvent.setup>) {
  await fillTitle(user);
  await user.click(screen.getByTestId('idea-mode-open'));
  await user.click(screen.getByTestId('idea-continue'));
  await screen.findByRole('heading', { name: 'Who is it for?' });
}

async function toNeeds(user: ReturnType<typeof userEvent.setup>) {
  await toScreenTwo(user);
  await user.click(screen.getByTestId('idea-interest-sport'));
  await user.click(screen.getByTestId('idea-continue'));
  await screen.findByRole('heading', { name: 'What do you still need?' });
}

function collabCalls() {
  return apiRequest.mock.calls.filter(([, url]) => String(url).startsWith('/api/collab/'));
}

/** The default mock, plus the Collab board and its invites. */
function withCollab() {
  const base = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'POST' && url === '/api/collab/ideas') return json({ idea: { id: 'idea-1' }, notified: 0 });
    if (method === 'PUT' && url === '/api/collab/ideas/idea-1') return json({ id: 'idea-1' });
    if (method === 'POST' && url === '/api/collab/ideas/idea-1/invites') {
      return json({ inviteUrl: `https://great.test/collab-invite/${body.partnerType}`, emailed: !!body.email });
    }
    return base(method, url, body);
  });
}

describe('Create experience — screen 2, who is it for', () => {
  it('asks for interests and a level instead of a sports-only audience', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    for (const id of ['sport', 'mind_body', 'food_drink', 'music_nightlife', 'learning', 'travel', 'meet_people', 'other']) {
      expect(screen.getByTestId(`idea-interest-${id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('idea-chip-runners')).not.toBeInTheDocument();
    expect(screen.getByTestId('idea-level-anyone')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('idea-progress-segment-2')).toHaveAttribute('data-filled', 'true');
  });

  it('needs at least one interest', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.click(screen.getByTestId('idea-continue'));
    expect(screen.getByTestId('idea-error-interests')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What do you still need?' })).not.toBeInTheDocument();
  });

  it('takes up to three interests', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    for (const id of ['sport', 'mind_body', 'food_drink']) await user.click(screen.getByTestId(`idea-interest-${id}`));
    await user.click(screen.getByTestId('idea-interest-travel'));
    expect(screen.getByTestId('idea-interest-travel')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('idea-error-interests')).toHaveTextContent(/up to 3/);
  });

  it('asks what "Something else" is', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.click(screen.getByTestId('idea-interest-other'));
    await user.click(screen.getByTestId('idea-continue'));
    expect(screen.getByTestId('idea-error-interest-other')).toBeInTheDocument();
  });

  it('saves the interests, level and group, and makes the "For" line from them', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.click(screen.getByTestId('idea-interest-sport'));
    await user.click(screen.getByTestId('idea-interest-music_nightlife'));
    await user.click(screen.getByTestId('idea-level-beginners'));
    await user.type(screen.getByTestId('idea-group-min'), '10');
    await user.type(screen.getByTestId('idea-group-max'), '60');
    await user.click(screen.getByTestId('idea-continue'));

    await screen.findByRole('heading', { name: 'What do you still need?' });
    const [method, url, payload] = lastDraftCall();
    expect([method, url]).toEqual(['PUT', '/api/experience-drafts/draft-1']);
    // The group's top becomes the event's capacity; the rest travels in the concept.
    expect(payload.maxParticipants).toBe(60);
    expect(payload.concept).toMatchObject({
      interests: ['sport', 'music_nightlife'],
      level: 'beginners',
      audience: 'Sport and movement, music and nightlife · beginners',
      groupSizeMin: 10,
      groupSizeMax: 60,
    });
    expect(apiRequest.mock.calls.filter(([m, u]) => m === 'POST' && u === '/api/experience-drafts')).toHaveLength(1);
  });

  it('rejects a range whose top is below its bottom', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.click(screen.getByTestId('idea-interest-sport'));
    await user.type(screen.getByTestId('idea-group-min'), '60');
    await user.type(screen.getByTestId('idea-group-max'), '10');
    await user.click(screen.getByTestId('idea-continue'));

    expect(screen.getByTestId('idea-error-group-max')).toBeInTheDocument();
  });

  it('refuses a group bigger than the builder allows', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toScreenTwo(user);
    await user.click(screen.getByTestId('idea-interest-sport'));
    await user.type(screen.getByTestId('idea-group-max'), '500');
    await user.click(screen.getByTestId('idea-continue'));

    expect(screen.getByTestId('idea-error-group-max')).toHaveTextContent(/200/);
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

describe('Create experience — screen 3, what do you still need', () => {
  it('must be answered, with Nothing as an answer', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-continue'));
    expect(screen.getByTestId('idea-error-needs')).toBeInTheDocument();
  });

  it('adds one screen per need, in the order of the list', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-need-community'));
    await user.click(screen.getByTestId('idea-need-venue'));
    // What, who, needs, venue, people, review.
    expect(screen.getByTestId('idea-progress')).toHaveAttribute('aria-valuemax', '6');
    await user.click(screen.getByTestId('idea-continue'));

    await screen.findByRole('heading', { name: 'Find a venue' });
    expect(lastDraftCall()[2].concept).toMatchObject({ needs: ['venue', 'community'] });
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Bring people' });
  });

  it('with Nothing, goes straight to the review and on to the builder without posting anything', async () => {
    withCollab();
    const user = userEvent.setup();
    renderFlow();
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-need-nothing'));
    await user.click(screen.getByTestId('idea-continue'));

    await screen.findByRole('heading', { name: 'Check your idea' });
    expect(screen.getByTestId('idea-continue')).toHaveTextContent('Keep building');
    await user.click(screen.getByTestId('idea-continue'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/event-builder/draft-1', { replace: true }));
    expect(collabCalls()).toHaveLength(0);
  });
});

describe('Create experience — one screen per need', () => {
  it('venue: posts to the board by default and keeps what could work', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-need-venue'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Find a venue' });

    expect(screen.getByTestId('idea-find-board')).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByTestId('idea-kind-of-space'), 'Beach bar');
    await user.click(screen.getByTestId('idea-venue-deal-revenue_split'));
    await user.click(screen.getByTestId('idea-venue-deal-barter'));
    await user.click(screen.getByTestId('idea-continue'));

    await screen.findByRole('heading', { name: 'Check your idea' });
    expect(lastDraftCall()[2].concept.slots.venue).toMatchObject({
      board: true, direct: false, kindOfSpace: 'Beach bar', dealPreferences: ['revenue_split', 'barter'],
    });
  });

  it('will not continue when neither the board nor an invite is chosen', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-need-sponsor'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Find a sponsor' });
    await user.click(screen.getByTestId('idea-find-board'));
    await user.click(screen.getByTestId('idea-continue'));
    expect(screen.getByTestId('idea-error-find')).toBeInTheDocument();
  });

  it('people: invite by link, €2.00 per person who checks in to start with', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-need-community'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Bring people' });

    expect(screen.getByTestId('idea-find-direct')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('idea-earn-per_person')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('idea-amount-per-person')).toHaveValue('2');

    await user.clear(screen.getByTestId('idea-amount-per-person'));
    await user.click(screen.getByTestId('idea-continue'));
    expect(screen.getByTestId('idea-error-amount-per-person')).toBeInTheDocument();

    await user.type(screen.getByTestId('idea-amount-per-person'), '2,50');
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Check your idea' });
    expect(lastDraftCall()[2].concept.slots.community).toMatchObject({
      direct: true, inviteSource: 'link', earn: 'per_person', amountPerPerson: 2.5,
    });
    expect(screen.getByTestId('idea-review-need-community')).toHaveTextContent('€2.50 per person who checks in');
  });

  it('people: "I bring my own community" alone is enough', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-need-community'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Bring people' });
    await user.click(screen.getByTestId('idea-find-direct'));
    await user.click(screen.getByTestId('idea-own-community-toggle'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Check your idea' });
    expect(lastDraftCall()[2].concept.slots.community).toMatchObject({ ownCommunity: true, board: false, direct: false });
  });

  it('an email invite needs an address', async () => {
    const user = userEvent.setup();
    renderFlow();
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-need-service_provider'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Find a service provider' });
    await user.click(screen.getByTestId('idea-find-direct'));
    await user.click(screen.getByTestId('chip-collab-invite-email-service_provider'));
    await user.click(screen.getByTestId('idea-continue'));
    expect(screen.getByTestId('idea-error-invite-email')).toBeInTheDocument();
  });
});

describe('Create experience — review, send and keep building', () => {
  async function toReviewWithVenueAndPeople(user: ReturnType<typeof userEvent.setup>) {
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-need-venue'));
    await user.click(screen.getByTestId('idea-need-community'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Find a venue' });
    await user.click(screen.getByTestId('idea-venue-deal-revenue_split'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Bring people' });
    await user.type(screen.getByTestId('input-collab-invite-email-community'), 'runclub@example.com');
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Check your idea' });
  }

  it('posts the idea to the Collab board, sends the invite, keeps both on the draft and opens the builder', async () => {
    withCollab();
    const user = userEvent.setup();
    renderFlow();
    await toReviewWithVenueAndPeople(user);
    expect(screen.getByTestId('idea-continue')).toHaveTextContent('Send and keep building');
    await user.type(screen.getByTestId('idea-note'), 'We bring the speakers.');
    await user.click(screen.getByTestId('idea-continue'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/event-builder/draft-1', { replace: true }));
    const [post] = collabCalls().filter(([m, u]) => m === 'POST' && u === '/api/collab/ideas');
    expect(post[2]).toMatchObject({
      title: 'Halloween coffee rave',
      seekingPartnerTypes: ['venue'],
      dealPreferences: ['revenue_split'],
      typeDetails: { community: { earn: '€2.00 per person who checks in' } },
      audience: 'Sport and movement · anyone',
      listed: true,
      experienceDraftId: 'draft-1',
      description: 'We bring the speakers.',
    });
    const invites = collabCalls().filter(([, u]) => u === '/api/collab/ideas/idea-1/invites');
    expect(invites).toHaveLength(1);
    expect(invites[0][2]).toMatchObject({ partnerType: 'community', email: 'runclub@example.com', partnerUserId: null });

    const saved = lastDraftCall()[2].concept;
    expect(saved.collabIdeaId).toBe('idea-1');
    expect(saved.sentAt).toBeTruthy();
    expect(saved.note).toBe('We bring the speakers.');
    expect(saved.slots.community.inviteUrl).toBe('https://great.test/collab-invite/community');
  });

  it('keeps an invite-only posting off the board', async () => {
    withCollab();
    const user = userEvent.setup();
    renderFlow();
    await toNeeds(user);
    await user.click(screen.getByTestId('idea-need-community'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Bring people' });
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Check your idea' });
    await user.click(screen.getByTestId('idea-continue'));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const [post] = collabCalls().filter(([m, u]) => m === 'POST' && u === '/api/collab/ideas');
    expect(post[2]).toMatchObject({ listed: false, seekingPartnerTypes: ['community'] });
  });

  it('Save as draft sends nothing', async () => {
    withCollab();
    const user = userEvent.setup();
    renderFlow();
    await toReviewWithVenueAndPeople(user);
    await user.click(screen.getByTestId('idea-save-draft'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/create-experience', { replace: true }));
    expect(collabCalls()).toHaveLength(0);
  });

  it('reopens a saved idea on its review, and sending again updates the posting without inviting twice', async () => {
    withCollab();
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === 'GET' && url === '/api/experience-drafts/draft-1') {
        return json({
          id: 'draft-1', title: 'Halloween coffee rave', description: '', startDate: null, endDate: null, location: '',
          concept: {
            stage: 'concept', dateMode: 'open', interests: ['sport'], level: 'anyone', needs: ['community'],
            collabIdeaId: 'idea-1', sentAt: '2026-10-14T10:00:00.000Z',
            slots: { community: { board: true, direct: true, inviteSource: 'link', earn: 'per_person', amountPerPerson: 2, inviteUrl: 'https://great.test/collab-invite/old' } },
          },
        });
      }
      return base(method, url, body);
    });
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <IdeaFlow draftId="draft-1" />
      </QueryClientProvider>,
    );

    await screen.findByRole('heading', { name: 'Check your idea' });
    expect(screen.getByTestId('idea-review-for')).toHaveTextContent('Sport and movement · anyone');
    await user.click(screen.getByTestId('idea-continue'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/event-builder/draft-1', { replace: true }));
    expect(collabCalls().map(([m, u]) => `${m} ${u}`)).toEqual(['PUT /api/collab/ideas/idea-1']);
    expect(apiRequest.mock.calls.some(([m, u]) => m === 'POST' && u === '/api/experience-drafts')).toBe(false);
  });
});

describe('Create experience — reopening a draft', () => {
  function renderWithDraft(draftId: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <IdeaFlow draftId={draftId} />
      </QueryClientProvider>,
    );
  }

  it('sends a draft that did not start as an idea to the builder, and writes nothing over it', async () => {
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === 'GET' && url === '/api/experience-drafts/built-1') return json({ id: 'built-1', title: 'Built', concept: null });
      return base(method, url, body);
    });
    renderWithDraft('built-1');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/event-builder/built-1', { replace: true }));
    expect(apiRequest.mock.calls.some(([m]) => m === 'PUT')).toBe(false);
  });

  it('starts a new draft rather than blanking one it could not read', async () => {
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === 'GET' && url === '/api/experience-drafts/draft-x') throw new Error('500');
      return base(method, url, body);
    });
    const user = userEvent.setup();
    renderWithDraft('draft-x');
    expect(await screen.findByTestId('idea-save-error')).toHaveTextContent(/couldn't open that idea/);
    await fillTitle(user);
    await user.click(screen.getByTestId('idea-mode-open'));
    await user.click(screen.getByTestId('idea-continue'));
    await screen.findByRole('heading', { name: 'Who is it for?' });
    expect(apiRequest.mock.calls.some(([m, u]) => m === 'PUT' && u === '/api/experience-drafts/draft-x')).toBe(false);
    expect(lastDraftCall()[0]).toBe('POST');
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
