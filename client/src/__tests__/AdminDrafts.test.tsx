import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminDrafts, { type AdminDraft } from '../components/AdminDrafts';

const navigate = vi.fn();
const apiRequest = vi.fn();
vi.mock('wouter', () => ({ useLocation: () => ['/admin', navigate] }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: (...a: any[]) => apiRequest(...a), readableError: (e: any) => String(e) }));

const draft = (overrides: Partial<AdminDraft>): AdminDraft => ({
  kind: 'event', id: 'd1', title: 'Sunset run', ownerName: 'Luca R', ownerEmail: 'luca@example.test',
  updatedAt: new Date().toISOString(), isIdea: false, isEmpty: false, missing: [], ready: false,
  openUrl: '/event-builder/d1', ...overrides,
});

function renderPanel(drafts: AdminDraft[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => drafts } } });
  return render(<QueryClientProvider client={client}><AdminDrafts /></QueryClientProvider>);
}

beforeEach(() => { navigate.mockReset(); apiRequest.mockReset(); });

describe('the admin Drafts tab', () => {
  it('shows each draft with its owner and what is missing', async () => {
    renderPanel([draft({ missing: ['Please add a cover photo', 'Please add a date', 'Please add a price'] })]);
    expect(await screen.findByText('Sunset run')).toBeInTheDocument();
    expect(screen.getByText(/Luca R/)).toBeInTheDocument();
    expect(screen.getByTestId('admin-draft-missing-d1')).toHaveTextContent('Please add a cover photo Please add a date (+1 more)');
  });

  it('opens a draft in the builder to finish it', async () => {
    renderPanel([draft({})]);
    fireEvent.click(await screen.findByTestId('admin-draft-open-d1'));
    expect(navigate).toHaveBeenCalledWith('/event-builder/d1');
  });

  it('approves a finished venue draft in one click', async () => {
    apiRequest.mockResolvedValue({ json: async () => ({}) });
    renderPanel([draft({ kind: 'venue', id: 'v-saga', title: 'SAGA Coffee', ready: true, openUrl: '/venue/setup?edit=v-saga' })]);
    fireEvent.click(await screen.findByTestId('admin-draft-approve-v-saga'));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/admin/venues/v-saga', { status: 'approved' }));
  });

  it('hides empty drafts until asked', async () => {
    renderPanel([draft({}), draft({ id: 'd2', title: 'Untitled event', isEmpty: true })]);
    await screen.findByText('Sunset run');
    expect(screen.queryByText('Untitled event')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-drafts-toggle-empty'));
    expect(screen.getByText('Untitled event')).toBeInTheDocument();
  });
});
