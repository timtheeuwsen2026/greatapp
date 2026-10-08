import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TravelerBookings from '../pages/TravelerBookings';

// Timothy asked for a way for attendees to cancel from My Bookings: the
// Booking Details dialog had no action at all, and nothing anywhere let an
// attendee cancel their own place. Alongside it, the status badge was telling
// a €0 RSVP on an event 106 people strong that its "Payment Held".

const toast = vi.fn();

vi.mock('wouter', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/navigation', () => ({ default: () => <nav /> }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const DAY = 86400000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const allowedFree = {
  allowed: true,
  mode: 'free',
  amount: 0,
  currency: 'eur',
  blockedReason: null,
  message: null,
};

const allowedMoneyBack = {
  allowed: true,
  mode: 'money_back',
  amount: 25,
  currency: 'eur',
  blockedReason: null,
  message: null,
};

const PAID_FINAL_MESSAGE =
  'Paid tickets are final under the Terms. Contact the organiser if you can no longer attend.';

function makeBooking(overrides: Record<string, any> = {}, experience: Record<string, any> = {}) {
  return {
    id: 'bk-1',
    experienceId: 'exp-1',
    userId: 'user-1',
    status: 'confirmed',
    amount: '0.00',
    isDepositOnly: false,
    balancePaid: false,
    depositAmount: '0.00',
    balanceAmount: '0.00',
    balanceDueDate: null,
    totalPrice: '0.00',
    ticketName: 'RSVP',
    ticketQuantity: 1,
    stripePaymentIntentId: null,
    cancelledAt: null,
    attendanceStatus: 'unknown',
    createdAt: new Date().toISOString(),
    cancellation: allowedFree,
    ...overrides,
    experience: {
      id: 'exp-1',
      title: 'Sunday Social 5km',
      coverImageUrl: null,
      startDate: inDays(10),
      endDate: inDays(10),
      location: 'Barcelona',
      venue: null,
      price: '0.00',
      currency: 'EUR',
      requireMinimumParticipants: false,
      minimumParticipants: 0,
      currentParticipants: 3,
      maxParticipants: 40,
      mvgMet: false,
      mvgStatus: 'pending',
      status: 'published',
      lifecycleStatus: 'confirmed',
      ...experience,
    },
  };
}

/** The same booking as the server returns it once the cancel has gone through. */
function asCancelled(booking: any) {
  return {
    ...booking,
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    cancellation: {
      allowed: false,
      mode: null,
      amount: 0,
      currency: 'eur',
      blockedReason: 'inactive',
      message: null,
    },
  };
}

let bookings: any[];
let bookingsAfterCancel: any[] | null;
let cancelResponse: { status: number; body: any };
let requests: Array<{ url: string; method: string }>;

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderBookings() {
  requests = [];
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const res = await fetch(String((queryKey as unknown[])[0]));
          return res.json();
        },
      },
      mutations: { retry: false },
    },
  });

  global.fetch = vi.fn(async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const method = init?.method || 'GET';
    requests.push({ url, method });

    if (method === 'POST' && url.endsWith('/cancel')) {
      // A partial return is a 502, but the booking is cancelled all the same.
      const cancelWentThrough =
        cancelResponse.status === 200 || cancelResponse.body?.code === 'partial_return';
      if (cancelWentThrough && bookingsAfterCancel) bookings = bookingsAfterCancel;
      return json(cancelResponse.body, cancelResponse.status);
    }
    if (url.includes('/api/auth/user')) return json({ id: 'user-1' });
    if (url.includes('/api/bookings/my-bookings')) return json(bookings);
    if (url.includes('/api/me/reviewable')) return json({ pending: [] });
    return json([]);
  }) as any;

  return render(
    <QueryClientProvider client={queryClient}>
      <TravelerBookings />
    </QueryClientProvider>,
  );
}

async function openDetails(bookingId = 'bk-1') {
  const user = userEvent.setup();
  renderBookings();
  await user.click(await screen.findByTestId(`card-booking-${bookingId}`));
  await screen.findByTestId('dialog-booking-detail');
  return user;
}

async function openConfirm() {
  const user = await openDetails();
  await user.click(screen.getByTestId('button-cancel-booking'));
  const confirm = await screen.findByTestId('dialog-confirm-cancel-booking');
  return { user, confirm };
}

describe('Cancelling a booking from My Bookings', () => {
  beforeEach(() => {
    toast.mockClear();
    bookings = [makeBooking()];
    bookingsAfterCancel = null;
    cancelResponse = {
      status: 200,
      body: { booking: {}, outcome: 'cancelled', amountReturned: 0, currency: 'eur', notice: null },
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers Cancel booking when the server says it is allowed', async () => {
    await openDetails();

    expect(screen.getByTestId('button-cancel-booking').textContent).toContain('Cancel booking');
    expect(screen.queryByTestId('text-cancel-blocked')).toBeNull();
  });

  it('explains a paid ticket is final instead of offering a button that would fail', async () => {
    bookings = [makeBooking(
      {
        status: 'fully_paid',
        amount: '25.00',
        totalPrice: '25.00',
        stripePaymentIntentId: 'pi_paid_1',
        cancellation: {
          allowed: false,
          mode: null,
          amount: 0,
          currency: 'eur',
          blockedReason: 'paid_final',
          message: PAID_FINAL_MESSAGE,
        },
      },
    )];
    await openDetails();

    expect(screen.queryByTestId('button-cancel-booking')).toBeNull();
    expect(screen.getByTestId('text-cancel-blocked').textContent).toBe(PAID_FINAL_MESSAGE);
  });

  it('says nothing when the event has simply started', async () => {
    bookings = [makeBooking({
      cancellation: {
        allowed: false,
        mode: null,
        amount: 0,
        currency: 'eur',
        blockedReason: 'started',
        message: null,
      },
    })];
    await openDetails();

    expect(screen.queryByTestId('button-cancel-booking')).toBeNull();
    expect(screen.queryByTestId('text-cancel-blocked')).toBeNull();
  });

  it('tells a free RSVP their spot goes to someone else, with no talk of money', async () => {
    const { confirm } = await openConfirm();

    expect(confirm.textContent).toContain('someone else can take it');
    expect(confirm.textContent).not.toContain('returned to your card');
    expect(within(confirm).queryByTestId('text-cancel-mvg-warning')).toBeNull();
  });

  it('tells a paying attendee how much comes back and how long it takes', async () => {
    bookings = [makeBooking(
      {
        status: 'pending',
        amount: '25.00',
        totalPrice: '25.00',
        stripePaymentIntentId: 'pi_held_1',
        cancellation: allowedMoneyBack,
      },
      {
        requireMinimumParticipants: true,
        minimumParticipants: 10,
        currentParticipants: 6,
        mvgMet: false,
        lifecycleStatus: 'forming',
      },
    )];
    const { confirm } = await openConfirm();

    expect(within(confirm).getByTestId('text-cancel-booking-outcome').textContent)
      .toContain('€25.00 will be returned to your card');
    expect(within(confirm).getByTestId('text-cancel-booking-timing').textContent)
      .toMatch(/hold disappears right away[\s\S]*5–10 business days/);
    // Leaving a group that is still forming can sink the event for everyone.
    expect(within(confirm).getByTestId('text-cancel-mvg-warning').textContent)
      .toContain('may not go ahead');
  });

  it('cancels on confirm and shows the booking as cancelled once it refreshes', async () => {
    bookingsAfterCancel = [asCancelled(bookings[0])];
    const { user } = await openConfirm();

    await user.click(screen.getByTestId('button-confirm-cancel-booking'));

    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url === '/api/bookings/bk-1/cancel')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId('badge-detail-status').textContent).toBe('Cancelled');
    });
    expect(screen.getByTestId('text-detail-status-description').textContent).toBe('You cancelled this booking');
    expect(screen.getByTestId('badge-booking-status-bk-1').textContent).toBe('Cancelled');
    expect(screen.queryByTestId('button-cancel-booking')).toBeNull();
    // A cancelled ticket must not keep offering the code that admits its holder.
    expect(screen.queryByTestId('button-show-ticket-qr-bk-1')).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Booking cancelled',
      description: 'Your spot has been released.',
    }));
  });

  it('reports a refund with the amount that came back', async () => {
    bookings = [makeBooking({
      status: 'pending',
      amount: '25.00',
      totalPrice: '25.00',
      stripePaymentIntentId: 'pi_captured_1',
      cancellation: allowedMoneyBack,
    })];
    bookingsAfterCancel = [asCancelled(bookings[0])];
    cancelResponse = {
      status: 200,
      body: { booking: {}, outcome: 'refunded', amountReturned: 25, currency: 'eur' },
    };
    const { user } = await openConfirm();

    await user.click(screen.getByTestId('button-confirm-cancel-booking'));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Booking cancelled',
        description: expect.stringContaining('€25.00 has been refunded'),
      }));
    });
  });

  it('passes the server refusal to the attendee rather than claiming it worked', async () => {
    cancelResponse = {
      status: 409,
      body: { message: 'Your payment is still processing — try again in a few minutes', code: 'processing' },
    };
    const { user } = await openConfirm();

    await user.click(screen.getByTestId('button-confirm-cancel-booking'));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Couldn't cancel this booking",
        description: 'Your payment is still processing — try again in a few minutes',
        variant: 'destructive',
      }));
    });
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Booking cancelled' }));
    expect(screen.getByTestId('badge-detail-status').textContent).not.toBe('Cancelled');
  });

  // The server answers 502 "partial_return" when the booking is cancelled and
  // some of the money went back but the rest could not be returned
  // automatically. The page used to call that "Couldn't cancel this booking"
  // in red, about a booking that was in fact cancelled.
  it('reports a partial return as a cancel, in the server\'s words, and refreshes', async () => {
    const PARTIAL_MESSAGE =
      "Your booking is cancelled and €10.00 has been returned, but we couldn't return the remaining €40.00 automatically. It has been flagged to our team, who will return it to you.";
    bookings = [makeBooking({
      status: 'deposit_paid',
      amount: '10.00',
      isDepositOnly: true,
      depositAmount: '10.00',
      balanceAmount: '40.00',
      balancePaid: true,
      totalPrice: '50.00',
      stripePaymentIntentId: 'pi_deposit_1',
      cancellation: { ...allowedMoneyBack, amount: 50 },
    })];
    bookingsAfterCancel = [{ ...asCancelled(bookings[0]), depositStatus: 'refunded' }];
    cancelResponse = {
      status: 502,
      body: {
        code: 'partial_return',
        message: PARTIAL_MESSAGE,
        booking: {},
        outcome: 'refunded',
        amountReturned: 10,
        amountOutstanding: 40,
        currency: 'eur',
      },
    };
    const { user } = await openConfirm();

    await user.click(screen.getByTestId('button-confirm-cancel-booking'));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({ title: 'Booking cancelled', description: PARTIAL_MESSAGE });
    });
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't cancel this booking" }));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    // Everything that counts the attendee is fetched again, not only the list.
    const postAt = requests.findIndex((r) => r.method === 'POST' && r.url.endsWith('/cancel'));
    await waitFor(() => {
      const after = requests.slice(postAt + 1).map((r) => r.url);
      expect(after).toContain('/api/bookings/my-bookings');
      expect(after).toContain('/api/me/reviewable');
    });
    await waitFor(() => {
      expect(screen.getByTestId('badge-detail-status').textContent).toBe('Cancelled');
    });
    expect(screen.queryByTestId('dialog-confirm-cancel-booking')).toBeNull();
  });

  it('still calls any other 502 a failed cancel', async () => {
    cancelResponse = {
      status: 502,
      body: {
        message: "We couldn't return your payment just now, so your booking has not been cancelled. Please try again in a few minutes.",
      },
    };
    const { user } = await openConfirm();

    await user.click(screen.getByTestId('button-confirm-cancel-booking'));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Couldn't cancel this booking",
        description: expect.stringContaining('has not been cancelled'),
        variant: 'destructive',
      }));
    });
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Booking cancelled' }));
  });

  it('adds the server notice to the success message', async () => {
    const NOTICE = 'The organiser has been told you are no longer coming.';
    bookingsAfterCancel = [asCancelled(bookings[0])];
    cancelResponse = {
      status: 200,
      body: { booking: {}, outcome: 'cancelled', amountReturned: 0, currency: 'eur', notice: NOTICE },
    };
    const { user } = await openConfirm();

    await user.click(screen.getByTestId('button-confirm-cancel-booking'));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        title: 'Booking cancelled',
        description: `Your spot has been released. ${NOTICE}`,
      });
    });
  });
});

describe('My Bookings status labels', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The screenshot: a €0 RSVP on an event at 106 of a minimum 10, badged
  // "Payment Held — Paid and held until the minimum group size is reached".
  it('does not call a free RSVP on a confirmed group event "Payment Held"', async () => {
    bookings = [makeBooking(
      { status: 'pending' },
      {
        requireMinimumParticipants: true,
        minimumParticipants: 10,
        currentParticipants: 106,
        mvgMet: true,
        mvgStatus: 'met',
        lifecycleStatus: 'confirmed',
      },
    )];
    await openDetails();

    expect(screen.getByTestId('badge-booking-status-bk-1').textContent).toBe('Going');
    expect(screen.getByTestId('text-detail-status-description').textContent).toContain('Free RSVP');
    expect(screen.queryByText('Payment Held')).toBeNull();
  });

  it('reports a reached minimum as reached, not as "106 / 10"', async () => {
    bookings = [makeBooking(
      { status: 'pending' },
      {
        requireMinimumParticipants: true,
        minimumParticipants: 10,
        currentParticipants: 106,
        mvgMet: true,
        lifecycleStatus: 'confirmed',
      },
    )];
    await openDetails();

    expect(screen.getByTestId('mvg-progress-text').textContent).toContain('106 joined · minimum of 10 reached');
    expect(screen.getByTestId('mvg-progress-text').textContent).not.toContain('106 / 10');
  });

  it('shows how many are still needed while the group is forming', async () => {
    bookings = [makeBooking(
      { status: 'pending', amount: '25.00', totalPrice: '25.00', stripePaymentIntentId: 'pi_held_1' },
      {
        requireMinimumParticipants: true,
        minimumParticipants: 10,
        currentParticipants: 6,
        mvgMet: false,
        lifecycleStatus: 'forming',
      },
    )];
    await openDetails();

    expect(screen.getByTestId('badge-booking-status-bk-1').textContent).toBe('Payment Held');
    expect(screen.getByTestId('mvg-progress-text').textContent).toContain('6 of 10 needed');
  });

  it('leaves Group Progress out for an event without a minimum group', async () => {
    bookings = [makeBooking()];
    await openDetails();

    expect(screen.queryByTestId('mvg-progress-text')).toBeNull();
    expect(screen.queryByText('Group Progress')).toBeNull();
  });

  it('says the event was cancelled when it was the organiser who called it off', async () => {
    bookings = [makeBooking(
      { status: 'cancelled', cancelledAt: new Date().toISOString() },
      { status: 'cancelled', lifecycleStatus: 'cancelled' },
    )];
    renderBookings();

    const badge = await screen.findByTestId('badge-booking-status-bk-1');
    expect(badge.textContent).toBe('Event cancelled');
  });

  it('marks a finished event as ended, or attended for someone checked in', async () => {
    bookings = [
      makeBooking({ id: 'bk-past' }, { startDate: inDays(-5), endDate: inDays(-5) }),
      makeBooking(
        { id: 'bk-went', attendanceStatus: 'attended' },
        { startDate: inDays(-5), endDate: inDays(-5) },
      ),
    ];
    renderBookings();

    expect((await screen.findByTestId('badge-booking-status-bk-past')).textContent).toBe('Event ended');
    expect(screen.getByTestId('badge-booking-status-bk-went').textContent).toBe('Attended');
  });
});

// Review of the cancel feature found the Booking Details dialog, which now
// follows the booking through its refresh, still talking about the booking as
// it was before the cancel: a deposit booking kept asking for its balance, a
// paid one kept saying "Paid in full". The group wording read the live count
// while the refund policy reads the stored status, and every refund was put
// down to the attendee, including ones an organiser issued.
describe('Booking Details after a booking stops being active', () => {
  beforeEach(() => {
    toast.mockClear();
    bookingsAfterCancel = null;
    cancelResponse = {
      status: 200,
      body: { booking: {}, outcome: 'cancelled', amountReturned: 0, currency: 'eur' },
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const formingGroup = {
    requireMinimumParticipants: true,
    minimumParticipants: 10,
    currentParticipants: 6,
    mvgMet: false,
    mvgStatus: 'pending',
    lifecycleStatus: 'forming',
  };

  const depositBooking = {
    status: 'deposit_paid',
    amount: '10.00',
    isDepositOnly: true,
    depositAmount: '10.00',
    balanceAmount: '40.00',
    balancePaid: false,
    balanceDueDate: inDays(5),
    totalPrice: '50.00',
    stripePaymentIntentId: 'pi_deposit_1',
  };

  const heldPayment = {
    status: 'pending',
    amount: '25.00',
    totalPrice: '25.00',
    stripePaymentIntentId: 'pi_held_1',
    cancellation: allowedMoneyBack,
  };

  async function cancelFromOpenDetails() {
    const { user } = await openConfirm();
    await user.click(screen.getByTestId('button-confirm-cancel-booking'));
    await waitFor(() => {
      expect(screen.getByTestId('badge-detail-status').textContent).toBe('Cancelled');
    });
  }

  it('asks for the balance while a deposit booking is still live', async () => {
    bookings = [makeBooking(depositBooking, formingGroup)];
    await openDetails();

    expect(screen.getByTestId('text-detail-balance').textContent).toContain('Remaining Balance');
    expect(screen.getByTestId('text-detail-due-date').textContent).toContain('Balance due by');
    expect(screen.queryByTestId('text-detail-payment-returned')).toBeNull();
  });

  it('stops asking for the balance of a deposit booking once it is cancelled', async () => {
    bookings = [makeBooking(
      { ...depositBooking, cancellation: { ...allowedMoneyBack, amount: 10 } },
      formingGroup,
    )];
    bookingsAfterCancel = [{ ...asCancelled(bookings[0]), depositStatus: 'refunded' }];
    cancelResponse = {
      status: 200,
      body: { booking: {}, outcome: 'refunded', amountReturned: 10, currency: 'eur' },
    };

    await cancelFromOpenDetails();

    expect(screen.queryByTestId('text-detail-balance')).toBeNull();
    expect(screen.queryByTestId('text-detail-due-date')).toBeNull();
    expect(screen.queryByText(/Remaining Balance/)).toBeNull();
    expect(screen.queryByText(/Balance due by/)).toBeNull();
    expect(screen.getByTestId('text-detail-payment-returned').textContent).toBe('Payment returned to your card.');
    expect(screen.getByTestId('text-detail-status-description').textContent)
      .toBe('You cancelled this booking and your payment was returned');
  });

  it('no longer calls a cancelled paid booking "Paid in full"', async () => {
    bookings = [makeBooking(heldPayment, formingGroup)];
    bookingsAfterCancel = [{ ...asCancelled(bookings[0]), depositStatus: 'refunded' }];
    cancelResponse = {
      status: 200,
      body: { booking: {}, outcome: 'hold_released', amountReturned: 25, currency: 'eur' },
    };

    await cancelFromOpenDetails();

    expect(screen.queryByTestId('text-detail-no-balance')).toBeNull();
    expect(screen.queryByText(/Paid in full/)).toBeNull();
    // Still says what was paid, but not in the green of a live payment.
    const paid = screen.getByTestId('text-detail-deposit');
    expect(paid.textContent).toContain('€25.00');
    expect(paid.querySelector('.text-green-700')).toBeNull();
    expect(screen.getByTestId('text-detail-payment-returned').textContent).toBe('Payment returned to your card.');
  });

  it('adds nothing about money to a cancelled free RSVP', async () => {
    bookings = [asCancelled(makeBooking())];
    await openDetails();

    expect(screen.getByTestId('badge-detail-status').textContent).toBe('Cancelled');
    expect(screen.queryByTestId('text-detail-no-balance')).toBeNull();
    expect(screen.queryByTestId('text-detail-payment-returned')).toBeNull();
  });

  it('keeps "Payment Held" and the warning while the stored group status is still pending', async () => {
    // The live count has reached the minimum, but the event has not been
    // marked as formed, so the server still refunds a cancel as a forming group.
    bookings = [makeBooking(heldPayment, {
      ...formingGroup,
      currentParticipants: 10,
      mvgMet: true,
      mvgStatus: 'pending',
      lifecycleStatus: 'confirmed',
    })];
    const { confirm } = await openConfirm();

    expect(screen.getByTestId('badge-booking-status-bk-1').textContent).toBe('Payment Held');
    expect(screen.getByTestId('badge-detail-status').textContent).toBe('Payment Held');
    expect(screen.getByTestId('text-detail-status-description').textContent).toContain('waiting to be confirmed');
    // Group Progress itself stays on the live count.
    expect(screen.getByTestId('mvg-progress-text').textContent).toContain('10 joined · minimum of 10 reached');
    expect(within(confirm).getByTestId('text-cancel-mvg-warning').textContent).toContain('may not go ahead');
  });

  it('calls the booking Confirmed and drops the warning once the stored status is met', async () => {
    bookings = [makeBooking(heldPayment, {
      ...formingGroup,
      currentParticipants: 12,
      mvgMet: true,
      mvgStatus: 'met',
      lifecycleStatus: 'confirmed',
    })];
    const { confirm } = await openConfirm();

    expect(screen.getByTestId('badge-detail-status').textContent).toBe('Confirmed');
    expect(within(confirm).queryByTestId('text-cancel-mvg-warning')).toBeNull();
  });

  it('falls back to the live count for a payload without a stored group status', async () => {
    bookings = [makeBooking(heldPayment, {
      ...formingGroup,
      currentParticipants: 12,
      mvgMet: true,
      mvgStatus: undefined,
      lifecycleStatus: 'confirmed',
    })];
    const { confirm } = await openConfirm();

    expect(screen.getByTestId('badge-detail-status').textContent).toBe('Confirmed');
    expect(within(confirm).queryByTestId('text-cancel-mvg-warning')).toBeNull();
  });

  it('does not put an organiser refund down to the attendee', async () => {
    // charge.refunded marks the booking "refunded" without a cancel time. The
    // attendee never asked for it, and it may only be a partial refund.
    bookings = [makeBooking({
      status: 'refunded',
      amount: '25.00',
      totalPrice: '25.00',
      stripePaymentIntentId: 'pi_paid_1',
      cancelledAt: null,
      cancellation: {
        allowed: false,
        mode: null,
        amount: 0,
        currency: 'eur',
        blockedReason: 'inactive',
        message: null,
      },
    })];
    await openDetails();

    expect(screen.getByTestId('badge-booking-status-bk-1').textContent).toBe('Refunded');
    expect(screen.getByTestId('badge-detail-status').textContent).toBe('Refunded');
    expect(screen.getByTestId('text-detail-status-description').textContent).toBe('A refund was issued for this booking');
    expect(screen.queryByText(/You cancelled/)).toBeNull();
    // A refund did happen, but it may have been a partial one, so the payment
    // summary does not say the whole payment came back.
    expect(screen.getByTestId('text-detail-payment-returned').textContent)
      .toBe('A refund was issued for this booking.');
    expect(screen.queryByText('Payment returned to your card.')).toBeNull();
  });

  it('claims nothing came back for a paid booking cancelled without a return', async () => {
    // Cancelled with a timestamp but depositStatus never reached "refunded":
    // nothing was returned, so neither the status line nor the payment
    // summary may say it was.
    bookings = [{ ...asCancelled(makeBooking(heldPayment, formingGroup)), depositStatus: 'refundable' }];
    await openDetails();

    expect(screen.getByTestId('text-detail-status-description').textContent).toBe('You cancelled this booking');
    expect(screen.queryByTestId('text-detail-payment-returned')).toBeNull();
    expect(screen.queryByText(/returned/i)).toBeNull();
  });

  it('puts a failed group\'s cancellation down to the event, not the attendee', async () => {
    // storage.markBookingAsRefunded writes exactly what the attendee's own
    // cancel writes: status "cancelled", a cancel time and depositStatus
    // "refunded". The failure run also calls the event off, and that is what
    // the attendee is told.
    bookings = [makeBooking(
      {
        ...heldPayment,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        depositStatus: 'refunded',
        cancellation: { ...allowedMoneyBack, allowed: false, mode: null, blockedReason: 'inactive' },
      },
      { ...formingGroup, status: 'cancelled', mvgStatus: 'failed', lifecycleStatus: 'cancelled' },
    )];
    await openDetails();

    expect(screen.getByTestId('badge-detail-status').textContent).toBe('Event cancelled');
    expect(screen.getByTestId('text-detail-status-description').textContent)
      .toContain("The group didn't reach its minimum");
    expect(screen.queryByText(/You cancelled/)).toBeNull();
  });

  it('says nothing about money for a free place the failure run marked "refunded"', async () => {
    // The failure run marks every booking depositStatus "refunded", including
    // a free RSVP that never paid anything.
    bookings = [makeBooking(
      { status: 'cancelled', cancelledAt: new Date().toISOString(), depositStatus: 'refunded', cancellation: null },
      { ...formingGroup, status: 'cancelled', mvgStatus: 'failed', lifecycleStatus: 'cancelled' },
    )];
    await openDetails();

    expect(screen.queryByTestId('text-detail-payment-returned')).toBeNull();
    expect(screen.getByTestId('text-booking-deposit-bk-1').textContent).not.toContain('Returned');
  });

  it('stops asking for the balance once the event itself is called off', async () => {
    // The booking row still reads live (deposit_paid) after the organiser
    // cancels the event; the balance and its due date must go regardless.
    bookings = [makeBooking(
      { ...depositBooking, cancellation: { ...allowedMoneyBack, allowed: false, mode: null, blockedReason: 'event_cancelled' } },
      { ...formingGroup, status: 'cancelled', lifecycleStatus: 'cancelled' },
    )];
    await openDetails();

    expect(screen.getByTestId('badge-detail-status').textContent).toBe('Event cancelled');
    expect(screen.queryByTestId('text-detail-balance')).toBeNull();
    expect(screen.queryByTestId('text-detail-due-date')).toBeNull();
    expect(screen.queryByText(/Remaining Balance/)).toBeNull();
    expect(screen.queryByText(/Balance due by/)).toBeNull();
    // What was paid is still shown.
    expect(screen.getByTestId('text-detail-deposit').textContent).toContain('€10.00');
  });

  it('still shows a balance that was paid on an event that was called off', async () => {
    bookings = [makeBooking(
      { ...depositBooking, status: 'fully_paid', balancePaid: true, cancellation: null },
      { ...formingGroup, status: 'cancelled', lifecycleStatus: 'cancelled' },
    )];
    await openDetails();

    expect(screen.getByTestId('text-detail-balance').textContent).toContain('Balance Paid');
    expect(screen.queryByTestId('text-detail-due-date')).toBeNull();
  });

  it('still says the event was cancelled for a refund on a cancelled event', async () => {
    bookings = [makeBooking(
      { status: 'refunded', depositStatus: 'refunded', amount: '25.00', stripePaymentIntentId: 'pi_paid_1' },
      { status: 'cancelled', lifecycleStatus: 'cancelled', mvgStatus: 'failed' },
    )];
    renderBookings();

    expect((await screen.findByTestId('badge-booking-status-bk-1')).textContent).toBe('Event cancelled');
    expect(screen.queryByText(/You cancelled/)).toBeNull();
  });

  // Group Progress and the status line both told every attendee on a called-off
  // minimum-group event that "any payment has been released or refunded". The
  // failure run only returns the payments it picks up; a deposit captured up
  // front is not among them and stays captured, with the booking row still
  // reading live. Saying it came back sent those attendees away from money
  // they still had to ask for.
  const failedGroup = { ...formingGroup, status: 'cancelled', mvgStatus: 'failed', lifecycleStatus: 'cancelled' };

  it('does not claim a deposit captured up front came back when the group fails', async () => {
    bookings = [makeBooking(
      {
        ...depositBooking,
        depositStatus: 'captured',
        depositCapturedAt: inDays(-3),
        cancellation: { ...allowedMoneyBack, allowed: false, mode: null, blockedReason: 'event_cancelled' },
      },
      failedGroup,
    )];
    await openDetails();

    const indicator = screen.getByTestId('mvg-status-indicator').textContent;
    expect(indicator).toContain("Trip cancelled — the minimum group wasn't reached.");
    expect(indicator).toContain('If you were charged, contact the organiser about a refund.');
    const description = screen.getByTestId('text-detail-status-description').textContent;
    expect(description).toContain("The group didn't reach its minimum");
    expect(description).toContain('If you were charged, contact the organiser about a refund.');
    expect(screen.getByTestId('badge-detail-status').textContent).toBe('Event cancelled');

    const dialog = screen.getByTestId('dialog-booking-detail');
    expect(dialog.textContent).not.toMatch(/released/i);
    expect(dialog.textContent).not.toMatch(/refunded/i);
    expect(dialog.textContent).not.toMatch(/returned/i);
    expect(screen.queryByTestId('text-detail-payment-returned')).toBeNull();
    // The list card still shows the deposit as paid, not as returned.
    expect(screen.getByTestId('text-booking-deposit-bk-1').textContent).toBe('Deposit: €10.00');
  });

  it('does not claim a return for a cancelled paid booking on a called-off event with none recorded', async () => {
    // The booking is off, but depositStatus never reached "refunded".
    bookings = [makeBooking(
      {
        ...heldPayment,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        depositStatus: 'captured',
        cancellation: null,
      },
      { ...formingGroup, status: 'cancelled', mvgStatus: 'pending', lifecycleStatus: 'cancelled' },
    )];
    await openDetails();

    expect(screen.getByTestId('mvg-status-indicator').textContent)
      .toContain('Trip cancelled — this event was called off.');
    expect(screen.getByTestId('mvg-status-payment-note').textContent?.trim())
      .toBe('If you were charged, contact the organiser about a refund.');
    expect(screen.getByTestId('text-detail-status-description').textContent)
      .toBe('This event was cancelled. If you were charged, contact the organiser about a refund.');
    const dialog = screen.getByTestId('dialog-booking-detail');
    expect(dialog.textContent).not.toMatch(/released|refunded|returned/i);
  });

  it('says the payment came back on a called-off event only when the booking records it', async () => {
    bookings = [makeBooking(
      {
        ...heldPayment,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        depositStatus: 'refunded',
        cancellation: null,
      },
      failedGroup,
    )];
    await openDetails();

    expect(screen.getByTestId('mvg-status-payment-note').textContent?.trim()).toBe('Your payment was returned.');
    expect(screen.getByTestId('text-detail-status-description').textContent)
      .toBe("The group didn't reach its minimum, so the event was cancelled. Your payment was returned.");
    expect(screen.getByTestId('mvg-status-indicator').textContent).not.toMatch(/contact the organiser/);
  });

  it('calls a webhook refund on a called-off event a refund issued, not the payment returned', async () => {
    bookings = [makeBooking(
      { ...heldPayment, status: 'refunded', cancelledAt: null, cancellation: null },
      failedGroup,
    )];
    await openDetails();

    expect(screen.getByTestId('mvg-status-payment-note').textContent?.trim())
      .toBe('A refund was issued for this booking.');
    expect(screen.getByTestId('text-detail-status-description').textContent)
      .toContain('A refund was issued for this booking.');
    expect(screen.queryByText(/Your payment was returned/)).toBeNull();
  });

  it('talks about the trip, not money, for a free place on a called-off event', async () => {
    bookings = [makeBooking(
      { status: 'cancelled', cancelledAt: new Date().toISOString(), depositStatus: 'refunded', cancellation: null },
      failedGroup,
    )];
    await openDetails();

    expect(screen.getByTestId('mvg-status-indicator').textContent)
      .toContain("Trip cancelled — the minimum group wasn't reached.");
    expect(screen.queryByTestId('mvg-status-payment-note')).toBeNull();
    expect(screen.getByTestId('text-detail-status-description').textContent)
      .toBe("The group didn't reach its minimum, so the event was cancelled.");
    const dialog = screen.getByTestId('dialog-booking-detail');
    expect(dialog.textContent).not.toMatch(/released|refunded|returned|refund/i);
  });
});

// The cards on the list kept saying "Paid: €25.00" for a booking that had been
// cancelled and its money returned, in the same grey as a live booking.
describe('My Bookings list amounts once a booking is off', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const paid = {
    status: 'fully_paid',
    amount: '25.00',
    totalPrice: '25.00',
    stripePaymentIntentId: 'pi_paid_1',
    cancellation: null,
  };

  async function amountOn(bookingId: string) {
    return screen.findByTestId(`text-booking-deposit-${bookingId}`);
  }

  it('shows a live booking as paid, not muted', async () => {
    bookings = [makeBooking(paid)];
    renderBookings();

    const amount = await amountOn('bk-1');
    expect(amount.textContent).toBe('Paid: €25.00');
    expect(amount.className).toContain('text-gray-600');
    expect(amount.className).not.toContain('text-gray-400');
  });

  it('shows money that went back on a cancel as returned, greyed out', async () => {
    bookings = [{ ...asCancelled(makeBooking(paid)), depositStatus: 'refunded' }];
    renderBookings();

    const amount = await amountOn('bk-1');
    expect(amount.textContent).toBe('Returned: €25.00');
    expect(amount.className).toContain('text-gray-400');
  });

  // Stripe fires charge.refunded for a partial refund as well as a full one,
  // and the webhook marks the booking "refunded" either way. The card used to
  // print "Returned: €25.00" for an organiser's €10 goodwill refund on a €25
  // booking; it now says a refund was issued and leaves the figure out.
  it('shows a partial webhook refund as a refund issued, with no amount', async () => {
    bookings = [makeBooking({ ...paid, status: 'refunded', cancelledAt: null })];
    renderBookings();

    const amount = await amountOn('bk-1');
    expect(amount.textContent).toBe('Refund issued');
    expect(amount.textContent).not.toContain('€');
    expect(amount.textContent).not.toContain('Returned');
    expect(amount.className).toContain('text-gray-400');
  });

  it('keeps the amount only for money the booking records as returned', async () => {
    bookings = [
      { ...asCancelled(makeBooking(paid)), depositStatus: 'refunded' },
      makeBooking({ ...paid, id: 'bk-webhook', status: 'refunded', cancelledAt: null }),
    ];
    renderBookings();

    expect((await amountOn('bk-1')).textContent).toBe('Returned: €25.00');
    expect((await amountOn('bk-webhook')).textContent).toBe('Refund issued');
  });

  it('greys out, but does not call returned, a cancelled payment nothing came back on', async () => {
    bookings = [
      { ...asCancelled(makeBooking(paid)), depositStatus: 'refundable' },
      {
        ...asCancelled(makeBooking({
          id: 'bk-deposit',
          status: 'deposit_paid',
          amount: '10.00',
          isDepositOnly: true,
          depositAmount: '10.00',
          balanceAmount: '40.00',
          totalPrice: '50.00',
          stripePaymentIntentId: 'pi_deposit_1',
        })),
        depositStatus: 'captured',
      },
    ];
    renderBookings();

    const amount = await amountOn('bk-1');
    expect(amount.textContent).toBe('Paid: €25.00');
    expect(amount.className).toContain('text-gray-400');
    const deposit = await amountOn('bk-deposit');
    expect(deposit.textContent).toBe('Deposit: €10.00');
    expect(deposit.className).toContain('text-gray-400');
  });
});
