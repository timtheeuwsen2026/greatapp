import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminDashboard from '../pages/admin-dashboard';

// Mock wouter
vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock auth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      email: 'timtheeuwsen@gmail.com',
      name: 'Admin User',
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

global.fetch = vi.fn();
global.confirm = vi.fn(() => true);

const mockVenues = [
  {
    id: 'venue-1',
    name: 'Pending Venue 1',
    city: 'Bali',
    description: 'Test venue 1',
    capacity: 20,
    location: '123 Test St',
    slug: 'pending-venue-1',
    status: 'pending',
    approved: false,
    createdAt: '2024-01-15T10:00:00Z',
    createdBy: 'user-1',
    ownerName: 'John Doe',
    ownerEmail: 'john@example.com',
  },
  {
    id: 'venue-2',
    name: 'Approved Venue 1',
    city: 'Ubud',
    description: 'Test venue 2',
    capacity: 30,
    location: '456 Test Ave',
    slug: 'approved-venue-1',
    status: 'approved',
    approved: true,
    createdAt: '2024-01-10T10:00:00Z',
    createdBy: 'user-2',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@example.com',
  },
  {
    id: 'venue-3',
    name: 'Rejected Venue 1',
    city: 'Canggu',
    description: 'Test venue 3',
    capacity: 15,
    location: '789 Test Rd',
    slug: 'rejected-venue-1',
    status: 'rejected',
    approved: false,
    createdAt: '2024-01-05T10:00:00Z',
    createdBy: 'user-3',
    ownerName: 'Bob Johnson',
    ownerEmail: 'bob@example.com',
  },
];

describe('Admin Venue Table', () => {
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

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/admin/venues')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockVenues,
        });
      }
      if (url.includes('/api/admin/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      }
      if (url.includes('/api/admin/experiences')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes('/api/admin/services')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes('/api/admin/community-applications')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AdminDashboard />
      </QueryClientProvider>
    );
  };

  it('should display all venues in table format', async () => {
    renderComponent();

    // Click on Venues tab
    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText('Pending Venue 1')).toBeInTheDocument();
      expect(screen.getByText('Approved Venue 1')).toBeInTheDocument();
      expect(screen.getByText('Rejected Venue 1')).toBeInTheDocument();
    });
  });

  it('should display owner information for each venue', async () => {
    renderComponent();

    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    });
  });

  it('should display status badges correctly', async () => {
    renderComponent();

    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      // Check for status badges
      const pendingBadges = screen.getAllByText(/Pending/i);
      const approvedBadges = screen.getAllByText(/Approved/i);
      const rejectedBadges = screen.getAllByText(/Rejected/i);

      expect(pendingBadges.length).toBeGreaterThan(0);
      expect(approvedBadges.length).toBeGreaterThan(0);
      expect(rejectedBadges.length).toBeGreaterThan(0);
    });
  });

  it('should display creation dates', async () => {
    renderComponent();

    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      // Check for formatted dates in the table
      expect(screen.getByText(/1\/15\/2024/)).toBeInTheDocument();
      expect(screen.getByText(/1\/10\/2024/)).toBeInTheDocument();
      expect(screen.getByText(/1\/5\/2024/)).toBeInTheDocument();
    });
  });

  it('should show approve and reject buttons for pending venues', async () => {
    renderComponent();

    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText('Pending Venue 1')).toBeInTheDocument();
    });

    // Find approve and reject buttons using test IDs
    const approveButton = screen.getByTestId('button-approve-venue-1');
    const rejectButton = screen.getByTestId('button-reject-venue-1');

    expect(approveButton).toBeInTheDocument();
    expect(rejectButton).toBeInTheDocument();
  });

  it('should call approve API when approve button is clicked', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, options: any) => {
      if (url.includes('/api/admin/venues') && options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...mockVenues[0], status: 'approved', approved: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockVenues,
      });
    });
    (global.fetch as any) = mockFetch;

    renderComponent();

    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText('Pending Venue 1')).toBeInTheDocument();
    });

    const approveButton = screen.getByTestId('button-approve-venue-1');
    fireEvent.click(approveButton);

    await waitFor(() => {
      const patchCalls = mockFetch.mock.calls.filter(
        (call: any) => call[1]?.method === 'PATCH'
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      expect(patchCalls[0][1].body).toContain('approved');
    });
  });

  it('should show view public page button for approved venues', async () => {
    renderComponent();

    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText('Approved Venue 1')).toBeInTheDocument();
    });

    const viewButton = screen.getByTestId('button-view-public-venue-2');
    expect(viewButton).toBeInTheDocument();
  });

  it('should show edit and delete buttons for all venues', async () => {
    renderComponent();

    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText('Pending Venue 1')).toBeInTheDocument();
    });

    // Check that all three venues have edit and delete buttons
    expect(screen.getByTestId('button-edit-venue-1')).toBeInTheDocument();
    expect(screen.getByTestId('button-edit-venue-2')).toBeInTheDocument();
    expect(screen.getByTestId('button-edit-venue-3')).toBeInTheDocument();

    expect(screen.getByTestId('button-delete-venue-1')).toBeInTheDocument();
    expect(screen.getByTestId('button-delete-venue-2')).toBeInTheDocument();
    expect(screen.getByTestId('button-delete-venue-3')).toBeInTheDocument();
  });

  it('should confirm before deleting a venue', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderComponent();

    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText('Pending Venue 1')).toBeInTheDocument();
    });

    const deleteButton = screen.getByTestId('button-delete-venue-1');
    fireEvent.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Pending Venue 1')
    );

    confirmSpy.mockRestore();
  });

  it('should show empty state when no venues exist', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/admin/venues')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    renderComponent();

    const venuesTab = await screen.findByText('Venues');
    fireEvent.mouseDown(venuesTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText(/No venues found/i)).toBeInTheDocument();
    });
  });
});
