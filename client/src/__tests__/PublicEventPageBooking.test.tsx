import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PublicEventPage, { bookingHrefFor } from '../pages/public-event-page';

// A community's share link opens /e/<event>?ref=…&share=…, and both "Book Now"
// buttons on that page did nothing. The bottom one read "Join Waitlist" on any
// event still forming its minimum group — Tim's yoga event among them — and did
// nothing either. And the page never read its own query string, so the
// partner's ?ref= was invisible to it.

let search = '';
vi.mock('wouter', () => ({
  useRoute: () => [true, { slugOrId: 'yoga-rooftop' }],
  useSearch: () => search,
  useLocation: () => ['/e/yoga-rooftop', vi.fn()],
  Link: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));
vi.mock('@/components/ChatTeaser', () => ({ ChatTeaser: () => null }));
vi.mock('@/components/EventSocialProofToast', () => ({ EventSocialProofToast: () => null }));
vi.mock('@/components/VenueInfoCard', () => ({ VenueInfoCard: () => null }));
vi.mock('@/components/LocationMap', () => ({ LocationMap: () => null, AddressLink: () => null }));
vi.mock('@/components/creator-profile-card', () => ({ default: () => null }));
vi.mock('@/components/OrganiserTurnout', () => ({ default: () => null }));
vi.mock('@/components/promoter-referral-card', () => ({ default: () => null }));
vi.mock('@/components/participant-referral-perk-card', () => ({ default: () => null }));

const event = {
  id: 'exp-yoga', title: 'Immersive Yoga and Breathwork', status: 'published',
  short_description: 'Rooftop', full_description: 'Rooftop sessions',
  start_date: new Date(Date.now() + 8 * 86400000).toISOString(),
  end_date: new Date(Date.now() + 8 * 86400000).toISOString(),
  duration: 1, location: 'Barcelona', cover_image: '', gallery: [], itinerary: [],
  amenities: [], services: [], roles: [],
  // Still forming its minimum group: this is where "Join Waitlist" appeared.
  mvg: { enabled: true, minimum_required: 10, current_signups: 3, soft_hold_deadline: null, status: 'pending', escrow_enabled: false },
  pricing: { currency: 'EUR', basePrice: 20, pricePerPerson: 20, depositEnabled: false, depositPercentage: 0, rooms: [], discounts: [] },
  venue: null, creator: null, stats: {}, bookings: [], reviews: [],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async ({ queryKey }) => (String(queryKey[0]).startsWith('/api/e') ? event : null) } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PublicEventPage />
    </QueryClientProvider>,
  );
}

describe('where Book Now goes', () => {
  it("goes to the event's booking page", () => {
    expect(bookingHrefFor('exp-yoga', '')).toBe('/experiences/exp-yoga');
  });

  it("carries a partner's referral and share codes, so the booking is credited to them", () => {
    expect(bookingHrefFor('exp-yoga', '?ref=amunt-yoga&share=tok')).toBe('/experiences/exp-yoga?ref=amunt-yoga&share=tok');
  });

  it('carries a discount link', () => {
    expect(bookingHrefFor('exp-yoga', 'discount=aticco')).toBe('/experiences/exp-yoga?discount=aticco');
  });

  it("leaves the organiser's preview token behind", () => {
    expect(bookingHrefFor('exp-yoga', '?preview=secret&ref=amunt-yoga')).toBe('/experiences/exp-yoga?ref=amunt-yoga');
    expect(bookingHrefFor('exp-yoga', '?preview=secret')).toBe('/experiences/exp-yoga');
  });
});

describe('the page a share link lands on', () => {
  beforeEach(() => { search = ''; });

  it('has Book Now buttons that actually go to booking, with the partner link intact', async () => {
    search = '?ref=amunt-yoga&share=tok';
    renderPage();

    const top = await screen.findByTestId('button-book-now');
    expect(top.tagName).toBe('A');
    expect(top).toHaveAttribute('href', '/experiences/exp-yoga?ref=amunt-yoga&share=tok');
    expect(screen.getByTestId('button-book-now-final')).toHaveAttribute('href', '/experiences/exp-yoga?ref=amunt-yoga&share=tok');
  });

  it('lets people book an event still forming its minimum group, instead of a dead "Join Waitlist"', async () => {
    renderPage();
    await screen.findByTestId('button-book-now');
    expect(screen.queryByText('Join Waitlist')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-join-waitlist')).not.toBeInTheDocument();
  });
});
