/**
 * Great vs Stripe: what to do when a booking and its payment disagree.
 *
 * Stripe is the truth about money; a booking only says what Great believes.
 * The webhook is supposed to keep the two in step, but a comparison of the
 * live Stripe export with the bookings (Nov 2026) found it had not: refunds
 * made in Stripe left bookings counted as attendees, card holds were never
 * collected, and payments made with the test key counted as paid. This file
 * decides, for one booking and the Stripe payment behind it, what is wrong and
 * whether it can be put right automatically. It does no I/O, so every case is
 * tested; the reconciler applies the decision.
 */

import type Stripe from "stripe";

export type ReconBookingStatus =
  | "pending"
  | "deposit_authorized"
  | "deposit_paid"
  | "confirmed"
  | "fully_paid"
  | "cancelled"
  | "refunded"
  | "failed";

export type ReconBooking = {
  id: string;
  status: ReconBookingStatus | string | null;
  cancelledAt?: Date | string | null;
  amount?: string | number | null;
  testPayment?: boolean | null;
};

/** Only what the decision needs from a Stripe PaymentIntent (and its latest charge). */
export type ReconIntent = {
  id: string;
  status: string;
  amountCents: number;
  receivedCents: number;
  refundedCents: number;
  disputed: boolean;
  createdAt: Date;
};

export type ReconExperience = {
  requireMinimumParticipants?: boolean | null;
  mvgStatus?: string | null;
};

export type ReconAction =
  | "none"
  | "capture" // collect a hold for an event that is on
  | "release" // let go of a hold on a booking that is cancelled
  | "mark_paid" // Stripe has the money, Great still says pending
  | "mark_refunded" // Stripe gave it all back, Great still counts it
  | "mark_failed" // the hold expired or the payment never went through
  | "mark_test"; // not a live Stripe payment at all

export type ReconKind =
  | "uncollected_hold"
  | "hold_on_cancelled_booking"
  | "paid_not_recorded"
  | "refund_not_recorded"
  | "partial_refund"
  | "dispute"
  | "hold_expired"
  | "payment_not_completed"
  | "amount_differs"
  | "test_payment";

export type ReconDecision = {
  action: ReconAction;
  kind?: ReconKind;
  note?: string;
};

const ACTIVE_UNPAID = new Set(["pending", "deposit_authorized"]);
const PAID = new Set(["deposit_paid", "confirmed", "fully_paid"]);
const ENDED = new Set(["cancelled", "refunded", "failed"]);
// A checkout that has not completed a day later is not going to.
const UNFINISHED_GRACE_MS = 24 * 60 * 60 * 1000;

function isEnded(booking: ReconBooking): boolean {
  return !!booking.cancelledAt || ENDED.has(String(booking.status));
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * `intent` is null when Stripe (live mode) has no such payment: the booking was
 * made against the test key, or the id is wrong. Either way no money came in.
 */
export function decidePaymentReconciliation(
  booking: ReconBooking,
  intent: ReconIntent | null,
  experience: ReconExperience,
  now: Date = new Date(),
): ReconDecision {
  const status = String(booking.status);
  const ended = isEnded(booking);

  if (!intent) {
    if (booking.testPayment || ended) return { action: "none" };
    if (PAID.has(status) || ACTIVE_UNPAID.has(status)) {
      return {
        action: "mark_test",
        kind: "test_payment",
        note: "No such payment in live Stripe (made with the test key). Kept out of the money totals.",
      };
    }
    return { action: "none" };
  }

  if (intent.disputed) {
    return { action: "none", kind: "dispute", note: "The buyer disputed this payment with their bank." };
  }

  switch (intent.status) {
    case "requires_capture": {
      if (ended) {
        return {
          action: "release",
          kind: "hold_on_cancelled_booking",
          note: "Booking is cancelled but the card was still held. Hold released.",
        };
      }
      if (!experience.requireMinimumParticipants) {
        // Not a minimum-group event, so nothing here says when this hold was
        // meant to be collected (older deposit flows hold on purpose). Show it.
        return {
          action: "none",
          kind: "uncollected_hold",
          note: `Card is held (€${euros(intent.amountCents)}) but not collected. Check this booking.`,
        };
      }
      if (experience.mvgStatus !== "met") return { action: "none" };
      return {
        action: "capture",
        kind: "uncollected_hold",
        note: `Card was only held (€${euros(intent.amountCents)}) although the event is on. Collected.`,
      };
    }

    case "succeeded": {
      const received = intent.receivedCents;
      if (intent.refundedCents > 0 && intent.refundedCents >= received) {
        if (status === "refunded" || status === "cancelled") return { action: "none" };
        return {
          action: "mark_refunded",
          kind: "refund_not_recorded",
          note: `Refunded in Stripe (€${euros(intent.refundedCents)}) but still counted in Great. Marked refunded, partner commission voided.`,
        };
      }
      if (intent.refundedCents > 0) {
        return {
          action: "none",
          kind: "partial_refund",
          note: `Partly refunded in Stripe: €${euros(intent.refundedCents)} of €${euros(received)}.`,
        };
      }
      if (ended) {
        // Money kept for a booking Great says is over. A person decides: it may
        // need a refund, or the booking may have been cancelled by mistake.
        return {
          action: "none",
          kind: "paid_not_recorded",
          note: `Stripe collected €${euros(received)} but the booking is ${status}. Check whether it needs a refund.`,
        };
      }
      if (ACTIVE_UNPAID.has(status)) {
        return {
          action: "mark_paid",
          kind: "paid_not_recorded",
          note: `Stripe collected €${euros(received)} but Great still said ${status}. Marked paid.`,
        };
      }
      const bookedCents = Math.round(Number(booking.amount || 0) * 100);
      if (bookedCents > 0 && Math.abs(bookedCents - received) > 1) {
        return {
          action: "none",
          kind: "amount_differs",
          note: `Great says €${euros(bookedCents)}, Stripe collected €${euros(received)}.`,
        };
      }
      return { action: "none" };
    }

    case "canceled": {
      if (ended) return { action: "none" };
      return {
        action: "mark_failed",
        kind: "hold_expired",
        note: "The card hold expired or was released before the money was collected. No longer counted.",
      };
    }

    case "processing":
      return { action: "none" };

    default: {
      // requires_payment_method / requires_action / requires_confirmation
      if (ended) return { action: "none" };
      if (now.getTime() - intent.createdAt.getTime() < UNFINISHED_GRACE_MS) return { action: "none" };
      return {
        action: "mark_failed",
        kind: "payment_not_completed",
        note: "The payment was never completed in Stripe. No longer counted.",
      };
    }
  }
}

/** The parts of a PaymentIntent (with `latest_charge` expanded) the decision reads. */
export function intentForReconciliation(pi: Stripe.PaymentIntent): ReconIntent {
  const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge) : null;
  return {
    id: pi.id,
    status: pi.status,
    amountCents: pi.amount,
    receivedCents: pi.amount_received ?? 0,
    refundedCents: charge?.amount_refunded ?? 0,
    disputed: !!charge?.disputed,
    createdAt: new Date(pi.created * 1000),
  };
}
