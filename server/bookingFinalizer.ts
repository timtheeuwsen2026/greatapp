/**
 * Late-binding hook so the Stripe webhook can rebuild a booking from a
 * PaymentIntent without importing routes.ts (which would be circular).
 *
 * routes.ts registers the implementation at startup; stripe-webhook.ts calls it
 * when a payment succeeds with no booking attached — the case where a buyer paid
 * with a redirect-based method (iDEAL, Bancontact, full-page 3DS) and never made
 * it back to the confirmation page.
 */

export type BookingFinalizerResult = {
  created: boolean;
  bookingId?: string;
  message?: string;
};

type BookingFinalizer = (paymentIntentId: string) => Promise<BookingFinalizerResult>;

let finalizer: BookingFinalizer | null = null;

export function registerBookingFinalizer(fn: BookingFinalizer): void {
  finalizer = fn;
}

export async function finalizeBookingFromPaymentIntent(
  paymentIntentId: string,
): Promise<BookingFinalizerResult> {
  if (!finalizer) {
    return { created: false, message: "Booking finalizer not registered" };
  }
  return finalizer(paymentIntentId);
}
