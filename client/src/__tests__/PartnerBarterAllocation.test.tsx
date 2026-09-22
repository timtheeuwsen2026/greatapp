import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AddPartnerModal from '../components/AddPartnerModal';
import type { EventPartnerEntry } from '@shared/eventPartners';

// Point 55.2, at the surface the organiser actually touches.
//
// A Barter Deal's supply is a finite quantity and nothing counts what is left
// of it, so it funds the recruiting host's reward or individual participants'
// rewards — never both. The choice is made here, once, when the proposal is
// set. Asking a question that only makes sense for a barter deal on a
// commission deal would be worse than not asking it at all.

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function renderModal(overrides: { editing?: EventPartnerEntry | null } = {}) {
  const onSave = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  render(
    <QueryClientProvider client={client}>
      <AddPartnerModal
        open
        onOpenChange={() => {}}
        onSave={onSave}
        editing={overrides.editing ?? null}
      />
    </QueryClientProvider>,
  );

  return { onSave };
}

function barterPartner(overrides: Partial<EventPartnerEntry> = {}): EventPartnerEntry {
  return {
    id: 'strong-x',
    partnerType: 'sponsor_brand',
    name: 'Strong X',
    source: 'platform',
    dealType: 'brand_barter',
    terms: { productDescription: '20 T-shirts' },
    status: 'draft',
    ...overrides,
  };
}

describe('pointing a partner’s barter supply', () => {
  it('asks who the supply rewards, once a barter deal is chosen', async () => {
    renderModal({ editing: barterPartner() });

    expect(await screen.findByTestId('block-barter-allocation')).toBeInTheDocument();
    expect(screen.getByTestId('chip-barter-allocation-host')).toBeInTheDocument();
    expect(screen.getByTestId('chip-barter-allocation-participants')).toBeInTheDocument();
  });

  it('does not ask it of a deal with no supply behind it', async () => {
    renderModal({
      editing: barterPartner({
        partnerType: 'affiliate',
        dealType: 'commission_per_ticket',
        terms: { commissionPct: 10 },
      }),
    });

    // The modal is open and showing the commission field...
    expect(await screen.findByTestId('input-partner-commission')).toBeInTheDocument();
    // ...but a percentage is not a stock two rewards can run down between them.
    expect(screen.queryByTestId('block-barter-allocation')).not.toBeInTheDocument();
  });

  it('defaults to the recruiting host, which is what older deals already meant', async () => {
    renderModal({ editing: barterPartner() });

    const host = await screen.findByTestId('chip-barter-allocation-host');
    expect(host).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('chip-barter-allocation-participants'))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('saves the choice onto the partner’s terms, so Pricing can read it', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ editing: barterPartner() });

    await user.click(await screen.findByTestId('chip-barter-allocation-participants'));
    await user.click(screen.getByTestId('button-save-partner'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].terms.barterAllocation).toBe('participants');
  });

  it('is one or the other — picking one unpicks the other', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ editing: barterPartner() });

    await user.click(await screen.findByTestId('chip-barter-allocation-participants'));
    await user.click(screen.getByTestId('chip-barter-allocation-host'));
    await user.click(screen.getByTestId('button-save-partner'));

    expect(onSave.mock.calls[0][0].terms.barterAllocation).toBe('host');
  });
});
