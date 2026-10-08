import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TicketQr from '../components/TicketQr';
import { setAccessToken } from '../lib/authToken';

// Point 11: the QR token had been written at booking, and the door scanner
// could read it, but nothing ever showed it to the person holding the ticket —
// so in practice there was never anything to scan.

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function renderQr(bookingId = 'bk-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TicketQr bookingId={bookingId} />
    </QueryClientProvider>,
  );
}

function mockQr(body: any, ok = true) {
  global.fetch = vi.fn(async () => new Response(JSON.stringify(body), {
    status: ok ? 200 : 404,
    headers: { 'Content-Type': 'application/json' },
  })) as any;
}

describe('participant check-in code', () => {
  beforeEach(() => {
    mockQr({
      bookingId: 'bk-1',
      qrDataUrl: PNG,
      attendanceStatus: 'unknown',
      addonName: null,
      addonQuantity: 0,
      addonRedeemedAt: null,
    });
  });

  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
  });

  it('stays collapsed until asked for, since it admits whoever holds it', () => {
    renderQr();

    expect(screen.getByTestId('button-show-ticket-qr-bk-1')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders the scannable code once revealed', async () => {
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByTestId('button-show-ticket-qr-bk-1'));

    const img = await screen.findByTestId('ticket-qr-image-bk-1');
    expect(img).toHaveAttribute('src', PNG);
    expect(screen.getByText(/show this at the door/i)).toBeInTheDocument();
  });

  it('names the add-on to collect, so the door knows what is owed', async () => {
    mockQr({
      bookingId: 'bk-1',
      qrDataUrl: PNG,
      attendanceStatus: 'unknown',
      addonName: 'Coffee + Medialuna',
      addonQuantity: 1,
      addonRedeemedAt: null,
    });
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByTestId('button-show-ticket-qr-bk-1'));

    expect(await screen.findByText(/collect your Coffee \+ Medialuna/i)).toBeInTheDocument();
  });

  it('says so when the add-on has already been handed over', async () => {
    mockQr({
      bookingId: 'bk-1',
      qrDataUrl: PNG,
      attendanceStatus: 'attended',
      addonName: 'Coffee + Medialuna',
      addonQuantity: 1,
      addonRedeemedAt: '2026-09-06T09:00:00.000Z',
    });
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByTestId('button-show-ticket-qr-bk-1'));

    expect(await screen.findByTestId('ticket-qr-checked-in')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-qr-addon-redeemed')).toHaveTextContent('already collected');
  });

  it('falls back to the door list for a booking made before QR existed', async () => {
    mockQr({ message: 'This booking has no check-in code' }, false);
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByTestId('button-show-ticket-qr-bk-1'));

    // Not an error state for the participant: the organiser can still admit
    // them by name, so the copy says that rather than showing a broken square.
    expect(await screen.findByTestId('ticket-qr-unavailable')).toHaveTextContent(/check you in by name/i);
  });

  // The endpoint answers the booking's owner only. A bare fetch carried no
  // token, so in production every attendee was told they had no code.
  it('asks for the code as the signed-in attendee', async () => {
    setAccessToken('attendee-token');
    const user = userEvent.setup();
    renderQr();

    await user.click(screen.getByTestId('button-show-ticket-qr-bk-1'));
    await screen.findByTestId('ticket-qr-image-bk-1');

    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/bookings/bk-1/qr');
    expect(init.headers.Authorization).toBe('Bearer attendee-token');
  });

  // On My Bookings the button sits inside the booking card, and the card's
  // click opens the details dialog over the code that was just asked for.
  it('keeps the reveal click to itself', async () => {
    const onCardClick = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <div onClick={onCardClick}>
          <TicketQr bookingId="bk-1" />
        </div>
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId('button-show-ticket-qr-bk-1'));
    await user.click(await screen.findByTestId('ticket-qr-image-bk-1'));

    expect(onCardClick).not.toHaveBeenCalled();
  });
});
