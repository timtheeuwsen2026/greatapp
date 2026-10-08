import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PostCollabIdeaModal from '../components/PostCollabIdeaModal';

// "Search on Great" went missing from a Collab Idea's direct invite, leaving
// only a link or an email for a partner who was already on the platform.

const apiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({ apiRequest: (...args: any[]) => apiRequest(...args) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/SharedPhotoUpload', () => ({
  SharedPhotoUpload: ({ children }: any) => <div>{children}</div>,
  PhotoPreview: () => <div />,
}));

const json = (body: any) => ({ json: async () => body });

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith('/api/collab/partner-directory')) {
      return json([{ id: 'venue-owner-1', displayName: 'Bandido Cafe', profilePhoto: null, label: 'Venue' }]);
    }
    if (method === 'POST' && url === '/api/collab/ideas') return json({ idea: { id: 'idea-1' }, notified: 0 });
    if (method === 'POST' && url === '/api/collab/ideas/idea-1/invites') {
      return json({ inviteUrl: 'https://x/collab-invite/t', emailed: true });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  });
});

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PostCollabIdeaModal open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('Collab Idea direct invite', () => {
  it('invites a partner picked from the Great directory by account, not by address', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByTestId('input-collab-title'), 'Sunday 5km');
    await user.click(screen.getByTestId('chip-collab-direct-venue'));

    // Search on Great is the default door, and a pick is required to go on.
    expect(screen.getByTestId('chip-collab-invite-platform-venue')).toBeInTheDocument();
    expect(screen.getByTestId('button-collab-next')).toBeDisabled();

    await user.click(await screen.findByTestId('collab-invite-candidate-venue-owner-1'));
    expect(screen.getByTestId('collab-invite-selected-venue')).toHaveTextContent('Bandido Cafe');

    await user.click(screen.getByTestId('button-collab-next'));
    await user.type(screen.getByTestId('input-collab-city'), 'Barcelona');
    await user.type(screen.getByTestId('input-collab-min'), '20');
    await user.type(screen.getByTestId('input-collab-start'), '2026-11-01');
    await user.click(screen.getByTestId('button-collab-next'));
    await user.click(screen.getByTestId('button-submit-collab-idea'));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('POST', '/api/collab/ideas/idea-1/invites', {
        partnerType: 'venue',
        email: null,
        partnerUserId: 'venue-owner-1',
        partnerName: 'Bandido Cafe',
      }));
  });

  it('still offers the link and email doors', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId('chip-collab-direct-venue'));
    await user.click(screen.getByTestId('chip-collab-invite-email-venue'));
    expect(screen.getByTestId('input-collab-invite-email-venue')).toBeInTheDocument();

    await user.click(screen.getByTestId('chip-collab-invite-link-venue'));
    expect(screen.getByText(/A shareable link is created when you post/)).toBeInTheDocument();
  });
});
