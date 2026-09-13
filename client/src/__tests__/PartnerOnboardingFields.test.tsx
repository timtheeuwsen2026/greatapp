import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SimpleCreatorProfileSetup from '../pages/simple-creator-profile-setup';
import PromoterProfileSetup from '../pages/promoter-profile-setup';

/**
 * The matching fields the onboarding popups were missing.
 *
 * Creator onboarding asked for name, handle, photo and bio — enough to render
 * a profile, nothing to match one on. Promoter onboarding did not exist at
 * all. Without a city, a category and a stated need, the Suggested-for-You
 * feed has nothing to compare, so it shows nothing and reads as broken.
 *
 * These assert the fields are present and that a profile cannot be completed
 * without them, because "optional" here means the feed stays empty.
 */

const setLocation = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => ['/creator/profile-setup', setLocation],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));

// One object, defined once. Returning a fresh literal from the mock gives
// `user` a new identity on every render, and the promoter page's effect depends
// on it — which turns a one-shot prefill into an infinite render loop.
const mockUser = { id: 'u1', email: 'creator@test.dev', firstName: 'Sam' };
const mockAuth = { user: mockUser, isAuthenticated: true, isLoading: false };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockAuth }));
vi.mock('@/components/SharedPhotoUpload', () => ({
  SharedPhotoUpload: ({ onUploadComplete }: any) => (
    <button type="button" onClick={() => onUploadComplete('https://img.test/a.jpg')}>
      Upload photo
    </button>
  ),
  PhotoPreview: () => <div data-testid="photo-preview" />,
}));

function renderPage(ui: React.ReactElement) {
  // A default queryFn is required: both pages rely on the app's QueryClient
  // default, and a client without one leaves every query pending forever.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const res = await fetch((queryKey as string[]).join('/'));
          if (!res.ok) throw new Error('not found');
          return res.json();
        },
      },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  setLocation.mockReset();
  // No existing profile: both pages 404 their GET and start empty, which is
  // the state a first-time creator or promoter actually arrives in.
  global.fetch = vi.fn(async () => ({
    ok: false,
    status: 404,
    json: async () => ({ message: 'Not found' }),
    text: async () => 'Not found',
  })) as any;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Creator onboarding — matching fields', () => {
  it('asks for a city, a category and what they are looking for', async () => {
    renderPage(<SimpleCreatorProfileSetup />);

    await waitFor(() => expect(screen.getByTestId('input-creator-city')).toBeTruthy());
    expect(screen.getByTestId('field-creator-category')).toBeTruthy();
    expect(screen.getByTestId('field-creator-looking-for')).toBeTruthy();
  });

  it('offers the Need taxonomy, with a free-text Other', async () => {
    renderPage(<SimpleCreatorProfileSetup />);
    await waitFor(() => expect(screen.getByTestId('field-creator-looking-for')).toBeTruthy());

    for (const need of ['venue', 'food_drink', 'sponsor', 'products', 'discount', 'other']) {
      expect(screen.getByTestId(`field-creator-looking-for-${need}`)).toBeTruthy();
    }
  });

  it('reveals a free-text box only once Other is chosen', async () => {
    const user = userEvent.setup();
    renderPage(<SimpleCreatorProfileSetup />);
    await waitFor(() => expect(screen.getByTestId('field-creator-category')).toBeTruthy());

    expect(screen.queryByTestId('field-creator-category-other-input')).toBeNull();
    await user.click(screen.getByTestId('field-creator-category-other'));
    expect(screen.getByTestId('field-creator-category-other-input')).toBeTruthy();
  });

  it('counts the needs picked, so collapsing the list does not hide them', async () => {
    const user = userEvent.setup();
    renderPage(<SimpleCreatorProfileSetup />);
    await waitFor(() => expect(screen.getByTestId('field-creator-looking-for')).toBeTruthy());

    expect(screen.getByTestId('field-creator-looking-for-count').textContent).toContain('0 selected');
    await user.click(screen.getByTestId('field-creator-looking-for-venue'));
    await user.click(screen.getByTestId('field-creator-looking-for-sponsor'));
    expect(screen.getByTestId('field-creator-looking-for-count').textContent).toContain('2 selected');
  });

  it('asks about perks and promoters, both off by default', async () => {
    renderPage(<SimpleCreatorProfileSetup />);
    await waitFor(() => expect(screen.getByTestId('toggle-creator-open-to-perks')).toBeTruthy());

    expect(screen.getByTestId('toggle-creator-open-to-perks').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('toggle-creator-open-to-promoters').getAttribute('aria-checked')).toBe('false');
  });

  it('will not complete a profile with no city, category or need', async () => {
    renderPage(<SimpleCreatorProfileSetup />);
    await waitFor(() => expect(screen.getByTestId('input-creator-city')).toBeTruthy());

    const submit = screen.getByRole('button', { name: /complete profile/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});

describe('Promoter onboarding — the flow that did not exist', () => {
  it('asks for type, city and category', async () => {
    renderPage(<PromoterProfileSetup />);

    await waitFor(() => expect(screen.getByTestId('field-promoter-type')).toBeTruthy());
    expect(screen.getByTestId('input-promoter-city')).toBeTruthy();
    expect(screen.getByTestId('field-promoter-category')).toBeTruthy();
  });

  it('offers Influencer, Brand and Other — the classification a Creator has not got', async () => {
    renderPage(<PromoterProfileSetup />);
    await waitFor(() => expect(screen.getByTestId('field-promoter-type')).toBeTruthy());

    expect(screen.getByTestId('field-promoter-type-influencer')).toBeTruthy();
    expect(screen.getByTestId('field-promoter-type-brand')).toBeTruthy();
    expect(screen.getByTestId('field-promoter-type-other')).toBeTruthy();
  });

  it('will not save a profile missing the fields the Experience Pool gates on', async () => {
    renderPage(<PromoterProfileSetup />);
    await waitFor(() => expect(screen.getByTestId('field-promoter-type')).toBeTruthy());

    const submit = screen.getByRole('button', { name: /save profile/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
