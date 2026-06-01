import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PublicVenuePage from '../pages/public-venue-page';

// Mock wouter
vi.mock('wouter', () => ({
  useParams: () => ({ slug: 'test-venue-slug' }),
  useLocation: () => ['/', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock fetch
global.fetch = vi.fn();

const mockVenue = {
  id: 'venue-1',
  name: 'Paradise Retreat Center',
  city: 'Bali',
  description: 'A beautiful retreat center in Bali with ocean views',
  capacity: 30,
  location: '123 Beach Road, Bali, Indonesia',
  slug: 'test-venue-slug',
  status: 'approved',
  approved: true,
  amenities: ['WiFi', 'Pool', 'Yoga Studio'],
  coverImageUrl: 'https://example.com/cover.jpg',
  galleryImages: [],
  website: 'https://paradise-retreat.com',
  instagram: '@paradiseretreat',
  createdBy: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockExperiences = [
  {
    id: 'exp-1',
    title: 'Yoga & Meditation Retreat',
    startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
    endDate: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000).toISOString(),
    slug: 'yoga-meditation-retreat',
  },
  {
    id: 'exp-2',
    title: 'Wellness Workshop',
    startDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days from now
    endDate: new Date(Date.now() + 63 * 24 * 60 * 60 * 1000).toISOString(),
    slug: 'wellness-workshop',
  },
];

describe('PublicVenuePage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            const url = queryKey[0] as string;
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            return response.json();
          },
        },
      },
    });
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <PublicVenuePage />
      </QueryClientProvider>
    );
  };

  it('should load and display venue information', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v/test-venue-slug')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockVenue,
          status: 200,
        });
      }
      if (url.includes('/api/venues/venue-1/experiences')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockExperiences,
          status: 200,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
        status: 200,
      });
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('text-venue-name')).toHaveTextContent('Paradise Retreat Center');
    });

    expect(screen.getByText(/A beautiful retreat center in Bali/)).toBeInTheDocument();
  });

  it('should display amenities when available', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v/test-venue-slug')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockVenue,
          status: 200,
        });
      }
      if (url.includes('/api/venues/venue-1/experiences')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
          status: 200,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
        status: 200,
      });
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('text-venue-name')).toHaveTextContent('Paradise Retreat Center');
    });

    expect(screen.getByText('WiFi')).toBeInTheDocument();
    expect(screen.getByText('Pool')).toBeInTheDocument();
    expect(screen.getByText('Yoga Studio')).toBeInTheDocument();
  });

  it('should display upcoming events at the venue', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v/test-venue-slug')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockVenue,
          status: 200,
        });
      }
      if (url.includes('/api/venues/venue-1/experiences')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockExperiences,
          status: 200,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
        status: 200,
      });
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('text-venue-name')).toHaveTextContent('Paradise Retreat Center');
    });

    // Check for upcoming events section
    await waitFor(() => {
      expect(screen.getByText(/Upcoming Events/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Yoga & Meditation Retreat')).toBeInTheDocument();
    expect(screen.getByText('Wellness Workshop')).toBeInTheDocument();
  });

  it('should show 404 message when venue is not found', async () => {
    (global.fetch as any).mockImplementation(() => {
      return Promise.reject(new Error('Venue not found'));
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('text-error-title')).toHaveTextContent('Venue Not Found');
    });
  });

  it('should show loading state initially', () => {
    (global.fetch as any).mockImplementation(() => {
      return new Promise(() => {}); // Never resolves to keep loading state
    });

    renderComponent();

    // Check for loading state by test ID
    expect(screen.getByTestId('loading-venue-page')).toBeInTheDocument();
    expect(screen.getByTestId('skeleton-hero')).toBeInTheDocument();
  });

  it('should display contact links when available', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/v/test-venue-slug')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockVenue,
          status: 200,
        });
      }
      if (url.includes('/api/venues/venue-1/experiences')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
          status: 200,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
        status: 200,
      });
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('text-venue-name')).toHaveTextContent('Paradise Retreat Center');
    });

    // Check for website and Instagram links
    const links = screen.getAllByRole('link');
    const websiteLink = links.find(link => 
      link.getAttribute('href')?.includes('paradise-retreat.com')
    );
    const instagramLink = links.find(link => 
      link.getAttribute('href')?.includes('instagram.com')
    );

    expect(websiteLink).toBeTruthy();
    expect(instagramLink).toBeTruthy();
  });
});
