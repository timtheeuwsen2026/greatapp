/**
 * Can an attendee cancel their own booking, and what happens to their money?
 *
 * Attendees had no way to cancel at all. The rule that replaces "contact the
 * organiser" for everything is deliberately narrow, because it has to agree
 * with two things already published: the Terms say all sales are final, and
 * the minimum-group copy promises a booking is "fully refundable until the
 * group forms". So money that was only ever held on the card is always let go,
 * money that was taken is handed back only while the group is still forming,
 * and everything else stays with the organiser.
 *
 * This file is pure on purpose. The bookings list uses it to show a preview
 * from database fields alone — no Stripe call per row — and the cancel
 * endpoint uses the same rules for everything that does not depend on the
 * payment, then decides the payment itself from the live PaymentIntent. The
 * stored booking status is not a reliable record of what Stripe holds (a
 * deposit gets overwritten to fully_paid, a minimum-group booking can sit at
 * `pending` after being captured), so the preview is a best guess and the
 * endpoint never trusts it for money.
 */

type DateValue = Date | string | number | null | undefined;
type MoneyValue = string | number | null | undefined;

export type CancellationBlockedReason =
  | "inactive"
  | "event_cancelled"
  | "started"
  | "attended"
  | "redeemed"
  | "payout"
  | "paid_final";

export type CancellationMode = "free" | "money_back";

export interface BookingCancellationPreview {
  allowed: boolean;
  /** Null whenever the booking cannot be cancelled. */
  mode: CancellationMode | null;
  /** Major units (euros), what would be returned. 0 for a free booking. */
  amount: number;
  /** Lower-case ISO code, e.g. "eur". */
  currency: string;
  blockedReason: CancellationBlockedReason | null;
  /** A sentence for the attendee, only when there is something worth saying. */
  message: string | null;
}

export interface CancellableBookingLike {
  status?: string | null;
  cancelledAt?: DateValue;
  attendanceStatus?: string | null;
  addonRedeemedAt?: DateValue;
  commissionStatus?: string | null;
  stripePaymentIntentId?: string | null;
  balancePaymentIntentId?: string | null;
  depositCapturedAt?: DateValue;
  amount?: MoneyValue;
  isDepositOnly?: boolean | null;
  balancePaid?: boolean | null;
  balanceAmount?: MoneyValue;
}

export interface CancellableExperienceLike {
  status?: string | null;
  archivedAt?: DateValue;
  startDate?: DateValue;
  currency?: string | null;
  requireMinimumParticipants?: boolean | null;
  mvgStatus?: string | null;
}

export interface BookingCancellationInput {
  booking: CancellableBookingLike;
  experience: CancellableExperienceLike | null | undefined;
  now?: Date;
  /** The event's payout is in flight or done, so its money has left. */
  payoutLocked?: boolean;
}

/** Statuses a booking can still be cancelled out of. */
export const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "deposit_authorized",
  "deposit_paid",
  "confirmed",
  "fully_paid",
] as const;

const INACTIVE_BOOKING_STATUSES = new Set(["cancelled", "refunded", "failed"]);

/**
 * Statuses whose money counts towards the organiser's payout. A cancellation
 * out of one of these changes what the event has earned.
 */
export const PAYOUT_COUNTED_BOOKING_STATUSES = new Set(["confirmed", "fully_paid", "deposit_paid"]);

/**
 * What the attendee is told when a cancellation is refused. `inactive` and
 * `started` carry no preview message: a cancelled booking needs no explanation
 * of why it cannot be cancelled again, and neither does an event that is
 * already under way. The endpoint still needs words for every refusal, so it
 * reads `cancellationRefusalMessage` instead.
 */
const BLOCKED_MESSAGES: Record<CancellationBlockedReason, string | null> = {
  inactive: null,
  started: null,
  event_cancelled:
    "This event has been called off, so there is nothing to cancel here. Any refund due comes with the event's cancellation — contact the organiser if you have not heard from them.",
  attended: "You have already been checked in to this event, so this booking can no longer be cancelled.",
  redeemed: "Your add-on has already been redeemed, so this booking can no longer be cancelled.",
  payout:
    "The organiser has already been paid for this event, so this booking can no longer be cancelled here. Please contact the organiser.",
  paid_final:
    "Paid tickets are final under our Terms, so this booking can't be cancelled here. Please contact the organiser if you need to make a change.",
};

const REFUSAL_FALLBACKS: Record<"inactive" | "started", string> = {
  inactive: "This booking has already been cancelled.",
  started: "This event has already started, so the booking can no longer be cancelled.",
};

export function cancellationPreviewMessage(reason: CancellationBlockedReason): string | null {
  return BLOCKED_MESSAGES[reason];
}

export function cancellationRefusalMessage(reason: CancellationBlockedReason): string {
  return BLOCKED_MESSAGES[reason] ?? REFUSAL_FALLBACKS[reason as "inactive" | "started"];
}

export const PAYMENT_PROCESSING_MESSAGE =
  "Your payment is still processing — try again in a few minutes.";

/**
 * The group-success run captured the attendee's hold in the moment between
 * the endpoint reading it and releasing it. The booking is kept as the run
 * would have left it, and the attendee is told why their cancellation did not
 * go through.
 */
export const GROUP_CONFIRMED_DURING_CANCEL_MESSAGE =
  "Your group was confirmed while you were cancelling, so your payment is now final under the Terms. Contact the organiser if you can no longer attend.";

/**
 * Said alongside a cancellation that went through but left a card hold in
 * place. An authorisation was never charged and lapses on its own, so this is
 * a heads-up about the bank statement, not money owed.
 */
export function unreleasedHoldNotice(amountLabel: string): string {
  return `A hold of ${amountLabel} on your card couldn't be released right away; it will drop off automatically within about 7 days.`;
}

function toDate(value: DateValue): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function money(value: MoneyValue): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function cancellationCurrency(experience: CancellableExperienceLike | null | undefined): string {
  // Checkout falls back to EUR when an event carries no currency; the refund
  // has to be described in the same currency the charge was made in.
  return String(experience?.currency || "eur").toLowerCase();
}

/**
 * When the event starts, for the purposes of cancelling.
 *
 * `hasExperiencePassed` runs to the end of the last day, which is right for
 * walk-up bookings and wrong here: nobody should be able to cancel a ticket
 * for something they are already standing in. The start date is stored on the
 * event day, so reading it as-is closes cancellation at the earliest moment
 * the event could begin — conservative on purpose.
 */
export function experienceStartsAt(experience: CancellableExperienceLike | null | undefined): Date | null {
  return toDate(experience?.startDate);
}

export function isBookingInactive(booking: Pick<CancellableBookingLike, "status" | "cancelledAt">): boolean {
  return !!toDate(booking.cancelledAt) || INACTIVE_BOOKING_STATUSES.has(String(booking.status ?? ""));
}

/**
 * A booking someone actually cancelled, as opposed to one that is merely not
 * active. Narrower than `isBookingInactive` on purpose: a declined balance card
 * marks the whole booking `failed`, and the attendee paying again with another
 * card on the same PaymentIntent is a genuine recovery, not a cancelled place
 * coming back to life.
 */
export function isBookingCancelled(booking: Pick<CancellableBookingLike, "status" | "cancelledAt">): boolean {
  return !!toDate(booking.cancelledAt) || booking.status === "cancelled";
}

/** Any Stripe PaymentIntent id, sandbox ones included. */
export function hasStripeIntentId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.startsWith("pi_");
}

/**
 * A PaymentIntent that exists on Stripe. Sandbox ids are minted locally for
 * development and are refused in production, so there is nothing to call.
 * The balance column can also hold a SetupIntent id (`seti_`), which is not a
 * payment at all.
 */
export function isLiveStripeIntentId(id: string | null | undefined): id is string {
  return hasStripeIntentId(id) && !id.startsWith("pi_sandbox_");
}

/**
 * Money that was actually taken comes back only while a minimum-group event is
 * still forming. That is the one promise the platform has published about
 * refunds; outside it, the Terms say sales are final.
 *
 * The booking is asked as well as the event. Every group-success run takes the
 * money first and marks the event `met` only once it has been through every
 * booking, so for that whole stretch the event still reads `pending` while
 * some of its bookings have already been captured as part of a formed group.
 * Those bookings are the only ones ever written as `confirmed`, so a
 * `confirmed` booking is money the group has already claimed, whatever the
 * event row says yet.
 *
 * `confirmed` does not survive, though: the capture fires
 * payment_intent.succeeded, and the webhook then rewrites the booking as
 * `fully_paid`. A deposit taken upfront is rewritten the same way when its
 * own confirmation arrives late. `depositCapturedAt` is written by the
 * group-success runs and by nothing else — every way they claim a booking
 * stamps it, whether they captured a hold, confirmed a deposit or put the
 * balance on hold — and nothing clears it, so it is asked as well: a booking
 * that carries it was taken as part of a formed group.
 */
export function isCapturedPaymentRefundable(
  experience: CancellableExperienceLike | null | undefined,
  booking: Pick<CancellableBookingLike, "status" | "depositCapturedAt"> | null | undefined,
): boolean {
  return !!experience?.requireMinimumParticipants
    && experience?.mvgStatus === "pending"
    && booking?.status !== "confirmed"
    && !toDate(booking?.depositCapturedAt);
}

export type LockedCancellationRefusal = "inactive" | "event_cancelled" | "paid_final";

/**
 * The last word on a cancellation, asked again with the event and booking rows
 * locked, just before the booking is marked cancelled.
 *
 * The endpoint decides from rows it read before calling Stripe, and a refund
 * decided that way can be overtaken: the group can form, or the event be called
 * off, while it waits. Re-asking here, under the same lock a new booking takes,
 * means a refund only goes ahead if the promise behind it still holds at the
 * moment the place is given up. A hold being released or a free place being
 * dropped promises nothing about the group, so only a refund is re-checked
 * against it.
 */
export function lockedCancellationRefusal(input: {
  booking: Pick<CancellableBookingLike, "status" | "cancelledAt" | "depositCapturedAt"> | null | undefined;
  experience: CancellableExperienceLike | null | undefined;
  refundPlanned: boolean;
  /**
   * A card hold is about to be released. If the group run stamped the
   * booking between our Stripe read and this lock, it captured that hold:
   * the money now belongs to the formed group, and releasing would fail
   * anyway. Not checked for a free place — the scheduler stamps free RSVPs
   * too when a group confirms, and those must stay cancellable.
   */
  holdReleasePlanned?: boolean;
}): LockedCancellationRefusal | null {
  const { booking, experience } = input;
  if (!booking || isBookingInactive(booking)) return "inactive";
  if (!experience || experience.status === "cancelled" || toDate(experience.archivedAt)) return "event_cancelled";
  if (input.refundPlanned && !isCapturedPaymentRefundable(experience, booking)) return "paid_final";
  if (input.holdReleasePlanned && toDate(booking.depositCapturedAt)) return "paid_final";
  return null;
}

/**
 * What the customer was charged or has on hold, in major units.
 *
 * `amount` is what the checkout put on the first PaymentIntent — the deposit
 * or the full price, with add-ons included and any discount already taken
 * off. A balance paid later through the confirm endpoint folds itself into
 * `amount`; one recorded only by the webhook leaves `amount` at the deposit
 * and the balance in `balanceAmount`, so it is added back here.
 */
export function bookingPaidAmount(booking: CancellableBookingLike): number {
  const main = money(booking.amount);
  const balance = booking.isDepositOnly && booking.balancePaid ? money(booking.balanceAmount) : 0;
  return roundMoney(main + balance);
}

export type BookingPaymentState = "free" | "held" | "captured" | "unlinked";

/**
 * A best guess at where the booking's money sits, from database fields only.
 *
 * - free: no PaymentIntent and nothing charged.
 * - held: authorised on the card, never captured.
 * - captured: taken, or recorded as taken.
 * - unlinked: something was charged but there is no PaymentIntent to return
 *   it through, so it cannot be handed back automatically.
 */
export function classifyBookingPayment(booking: CancellableBookingLike): BookingPaymentState {
  const hasMainIntent = hasStripeIntentId(booking.stripePaymentIntentId);
  const balanceCaptured = !!booking.balancePaid && hasStripeIntentId(booking.balancePaymentIntentId);
  const paid = bookingPaidAmount(booking);

  if (!hasMainIntent && !balanceCaptured) return paid > 0 ? "unlinked" : "free";
  if (balanceCaptured) return "captured";

  const status = String(booking.status ?? "");
  const stillAuthorised = !toDate(booking.depositCapturedAt)
    && (status === "pending" || status === "deposit_authorized");
  return stillAuthorised ? "held" : "captured";
}

/**
 * Every reason a booking cannot be cancelled that has nothing to do with how
 * it was paid. Null means the payment decides.
 */
export function bookingCancellationGate(input: BookingCancellationInput): CancellationBlockedReason | null {
  const { booking, experience } = input;
  const now = input.now ?? new Date();

  if (isBookingInactive(booking)) return "inactive";
  if (!experience || experience.status === "cancelled" || toDate(experience.archivedAt)) {
    return "event_cancelled";
  }

  const startsAt = experienceStartsAt(experience);
  if (startsAt && now.getTime() >= startsAt.getTime()) return "started";

  if (booking.attendanceStatus === "attended") return "attended";
  if (toDate(booking.addonRedeemedAt)) return "redeemed";

  // A promoter already paid for this sale, or the organiser's payout already
  // on its way: the money has been shared out, and taking the booking back
  // now would return money the platform no longer holds.
  if (booking.commissionStatus === "paid" || input.payoutLocked) return "payout";

  return null;
}

/** The preview the bookings list shows next to each booking. */
export function assessBookingCancellation(input: BookingCancellationInput): BookingCancellationPreview {
  const currency = cancellationCurrency(input.experience);
  const blocked = (reason: CancellationBlockedReason): BookingCancellationPreview => ({
    allowed: false,
    mode: null,
    amount: 0,
    currency,
    blockedReason: reason,
    message: cancellationPreviewMessage(reason),
  });

  const gate = bookingCancellationGate(input);
  if (gate) return blocked(gate);

  const payment = classifyBookingPayment(input.booking);
  if (payment === "free") {
    return { allowed: true, mode: "free", amount: 0, currency, blockedReason: null, message: null };
  }

  if (payment === "held" || (payment === "captured" && isCapturedPaymentRefundable(input.experience, input.booking))) {
    return {
      allowed: true,
      mode: "money_back",
      amount: bookingPaidAmount(input.booking),
      currency,
      blockedReason: null,
      message: null,
    };
  }

  return blocked("paid_final");
}

export type IntentCancellationAction = "cancel" | "refund" | "none" | "processing" | "paid_final";

/**
 * Was this captured PaymentIntent captured by the card network on payment, as
 * opposed to by us later on?
 *
 * On a minimum-group event the full price is put on hold (`manual` capture)
 * and only a group-success run ever captures it, so a `manual` intent that
 * reads succeeded is money the formed group has claimed — even while the
 * event row still says `pending`, because the run marks the event met last,
 * and even after the webhook has overwritten the booking's `confirmed`. A
 * deposit taken upfront is captured at once (`automatic`), which says nothing
 * about the group. Only that kind of capture can fall under the
 * forming-group refund promise. Anything unrecognised is treated as not
 * automatic, so it stays final rather than being refunded on a guess.
 */
export function isAutomaticallyCaptured(captureMethod: string | null | undefined): boolean {
  return captureMethod === "automatic" || captureMethod === "automatic_async";
}

type IntentLike = {
  id: string;
  status?: string | null;
  capture_method?: string | null;
};

/**
 * Has the group-success run claimed this booking by putting its balance on
 * hold?
 *
 * On a minimum-group event with a deposit taken upfront, the run claims each
 * booking by authorising the balance on the saved card — a `manual` intent,
 * placed off-session and written to the balance column — and marking the
 * booking `confirmed`. It does not touch the deposit. The deposit's own
 * confirmation can land afterwards and rewrite `confirmed` as `fully_paid`,
 * and the event still reads `pending` until the run has finished every
 * booking, or for good if the run stops part-way. Nothing in those rows then
 * says the group has formed; the balance hold does.
 *
 * Only the run makes a `manual` balance intent. An attendee paying the balance
 * themselves gets an intent captured on payment. So a live `manual` intent in
 * the balance column means the whole booking belongs to the formed group:
 * neither the deposit nor the hold is handed back. Once that hold has been
 * canceled — it lapsed, or was released — it says nothing any more, and the
 * capture stamp the run leaves on the booking has to answer instead.
 */
export function isGroupBalanceHold(
  booking: Pick<CancellableBookingLike, "stripePaymentIntentId" | "balancePaymentIntentId">,
  intent: IntentLike | null | undefined,
): boolean {
  return !!intent
    && hasStripeIntentId(booking.balancePaymentIntentId)
    && intent.id === booking.balancePaymentIntentId
    // The same intent in both columns is the booking's own payment, not a
    // balance the run put on hold.
    && booking.balancePaymentIntentId !== booking.stripePaymentIntentId
    && intent.capture_method === "manual"
    && intent.status !== "canceled";
}

/**
 * What to do with one live PaymentIntent when its booking is cancelled.
 *
 * Anything still waiting on the customer or on capture is cancelled, which
 * releases a card hold and stops an unfinished payment from completing later.
 * A succeeded intent is refunded only under the minimum-group promise, and
 * only when it was captured on payment: one we captured from a hold was
 * captured because the group formed, so it is final whatever the event row
 * says. A processing intent is refused outright: it can still land either
 * way, and cancelling the booking underneath it would leave money with
 * nothing behind it.
 */
export function decideIntentCancellation(
  intentStatus: string | null | undefined,
  capturedRefundable: boolean,
  captureMethod: string | null | undefined,
): IntentCancellationAction {
  switch (intentStatus) {
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "requires_capture":
      return "cancel";
    case "succeeded":
      return capturedRefundable && isAutomaticallyCaptured(captureMethod) ? "refund" : "paid_final";
    case "processing":
      return "processing";
    case "canceled":
      return "none";
    default:
      // An unrecognised state is treated like one we cannot safely act on.
      return "processing";
  }
}

/** "EUR 25.00" — the form the platform's transactional emails already use. */
export function formatCancellationAmount(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${String(currency || "eur").toUpperCase()} ${value.toFixed(2)}`;
}
