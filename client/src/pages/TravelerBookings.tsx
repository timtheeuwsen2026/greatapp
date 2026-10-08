import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketQr from "@/components/TicketQr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar, MapPin, CreditCard, Clock, Image as ImageIcon } from "lucide-react";
import { Link } from "wouter";
import Navigation from "@/components/navigation";
import { LocationMap, AddressLink } from "@/components/LocationMap";
import { ReviewPrompt } from "@/components/ReviewPrompt";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, readableError } from "@/lib/queryClient";
import { hasExperiencePassed } from "@shared/eventLifecycle";

type CancellationBlockedReason =
  | "inactive"
  | "event_cancelled"
  | "started"
  | "attended"
  | "redeemed"
  | "payout"
  | "paid_final";

/**
 * The server's verdict on whether this booking can still be cancelled, and
 * what would come back if it were. Worked out from the booking and the event
 * as stored, so it is a preview: the cancel endpoint decides again from the
 * live Stripe payment before it touches anything.
 */
interface BookingCancellation {
  allowed: boolean;
  mode: "free" | "money_back" | null;
  /** Major units (euros), 0 for a free RSVP. */
  amount: number;
  currency: string;
  blockedReason: CancellationBlockedReason | null;
  message: string | null;
}

interface CancelBookingResult {
  booking: unknown;
  outcome: "cancelled" | "hold_released" | "refunded";
  amountReturned: number;
  currency: string;
  /** Anything more the attendee should know about this cancel; null or absent when there is nothing. */
  notice?: string | null;
}

/**
 * The status and JSON body of a failed apiRequest.
 *
 * apiRequest hands both back only as the error text "<status>: <body>", which
 * readableError turns into a sentence. The cancel handler needs the status and
 * the body's `code` as well, to tell a cancel that went through with part of
 * the money still owed apart from one that did not happen at all. Both fields
 * are null when the request never reached the server (a network error), and
 * the body is null when it was not JSON.
 */
function parseRequestFailure(error: unknown): { status: number | null; body: any } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const match = /^(\d{3}):\s*([\s\S]*)$/.exec(raw);
  if (!match) return { status: null, body: null };
  let body: any = null;
  try {
    body = JSON.parse(match[2]);
  } catch {
    // Not JSON: a proxy's error page or a plain-text message.
  }
  return { status: Number(match[1]), body };
}

interface EnrichedBooking {
  id: string;
  experienceId: string;
  userId: string;
  status: string;
  amount: string | null;
  isDepositOnly: boolean | null;
  balancePaid: boolean | null;
  depositAmount: string | null;
  balanceAmount: string | null;
  balanceDueDate: string | null;
  totalPrice: string | null;
  ticketName: string | null;
  ticketQuantity: number | null;
  createdAt: string;
  bookingDate?: string;
  stripePaymentIntentId?: string | null;
  cancelledAt?: string | null;
  depositStatus?: string | null;
  depositCapturedAt?: string | null;
  addonTotal?: string | null;
  addonItems?: Array<{ id: string; name: string; unitPrice: number; quantity: number; total: number }> | null;
  discountAmount?: string | null;
  attendanceStatus?: string | null;
  // Optional because the legacy bookings alias and a page cached from before
  // this field existed can both hand us a booking without it; no verdict
  // means no cancel button, never a guessed one.
  cancellation?: BookingCancellation | null;
  experience: {
    id: string;
    title: string;
    coverImageUrl: string | null;
    startDate: string | null;
    endDate: string | null;
    location: string | null;
    venue: string | null;
    price: string | null;
    currency: string | null;
    requireMinimumParticipants?: boolean | null;
    minimumParticipants: number;
    currentParticipants: number;
    maxParticipants?: number | null;
    mvgMet: boolean;
    mvgStatus?: string | null;
    status?: string | null;
    lifecycleStatus?: 'forming' | 'confirmed' | 'cancelled';
  } | null;
}

const formatCurrency = (amount: number | string | undefined | null, currency?: string | null) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  const currencyCode = (currency || 'EUR').toUpperCase();
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF ',
  };
  const symbol = symbols[currencyCode] || currencyCode + ' ';
  return `${symbol}${(Number.isFinite(numAmount) ? numAmount : 0).toFixed(2)}`;
};

type StatusInfo = { label: string; description: string; variant: "default" | "secondary" | "destructive" | "outline" };

const statusConfig: Record<string, StatusInfo> = {
  pending: { label: "Pending", description: "Awaiting confirmation", variant: "secondary" },
  deposit_authorized: { label: "Deposit Held", description: "Deposit held - awaiting trip confirmation", variant: "default" },
  deposit_paid: { label: "Deposit Paid", description: "Spot secured - balance due before the trip", variant: "default" },
  confirmed: { label: "Confirmed", description: "Trip confirmed!", variant: "default" },
  fully_paid: { label: "Paid", description: "Paid in full - your spot is confirmed", variant: "default" },
  failed: { label: "Failed", description: "Payment failed", variant: "destructive" },
};

const INACTIVE_BOOKING_STATUSES = new Set(["cancelled", "refunded", "failed"]);

/** Still a live ticket: not cancelled, refunded or failed. */
function isBookingActive(booking: EnrichedBooking): boolean {
  return !booking.cancelledAt && !INACTIVE_BOOKING_STATUSES.has(booking.status);
}

function isEventCancelled(booking: EnrichedBooking): boolean {
  return booking.experience?.lifecycleStatus === "cancelled" || booking.experience?.status === "cancelled";
}

/** A minimum-group event that has reached its minimum, or never needed one. */
function hasGroupFormed(booking: EnrichedBooking): boolean {
  return booking.experience?.mvgMet === true || booking.experience?.lifecycleStatus === "confirmed";
}

/**
 * Whether a minimum-group event is still waiting on its group, in the sense
 * the cancel endpoint uses.
 *
 * The refund policy reads the stored mvgStatus, and that lags the live count:
 * the count can pass the minimum before the event is marked "met". Going by
 * the live figure here called a booking "Confirmed" and dropped the "may not
 * go ahead" warning while the server still treated the group as forming and
 * the payment as refundable. A payload without a stored status (one cached
 * from before the field was sent, or an event that never had one) falls back
 * to the live figure.
 */
function isGroupStillForming(booking: EnrichedBooking): boolean {
  const experience = booking.experience;
  if (!experience?.requireMinimumParticipants) return false;
  if (typeof experience.mvgStatus === "string" && experience.mvgStatus) {
    return experience.mvgStatus !== "met";
  }
  return !hasGroupFormed(booking);
}

/**
 * What this booking took from the buyer. A deposit booking has paid its
 * deposit; anything else has paid its amount, falling back to the ticket total
 * for rows written before `amount` was always filled.
 */
function amountPaidFor(booking: EnrichedBooking): number {
  const isDepositBooking = booking.isDepositOnly === true && parseFloat(booking.depositAmount || "0") > 0;
  const paid = parseFloat(
    booking.amount || (isDepositBooking ? booking.depositAmount : booking.totalPrice) || "0",
  );
  return Number.isFinite(paid) ? paid : 0;
}

function hasCardPayment(booking: EnrichedBooking): boolean {
  return typeof booking.stripePaymentIntentId === "string" && booking.stripePaymentIntentId.startsWith("pi_");
}

/** A free RSVP: no card was ever involved and nothing was paid. */
function isFreeBooking(booking: EnrichedBooking): boolean {
  return !hasCardPayment(booking) && amountPaidFor(booking) <= 0;
}

/**
 * What the page can truthfully say about the money on a booking that is no
 * longer live.
 *
 * "returned": depositStatus "refunded". The cancel endpoint writes it only
 * after the hold was released or the charge refunded. The minimum-group
 * failure runs also write it when they call the event off, even for a hold
 * Stripe refused to release; that is the server's record to correct, as this
 * page has nothing else to go on.
 * "refund_issued": status "refunded" without that, which comes from Stripe's
 * charge.refunded webhook: an organiser or admin refund that may have been a
 * partial goodwill one, so it is not described as the whole payment coming
 * back.
 * null: nothing is known to have gone back (a cancel that returned nothing,
 * or a free place that had nothing to return), so nothing is claimed. The
 * dialog used to say "Payment returned to your card" for a webhook refund
 * that may only have been partial, and for a free place the failure run had
 * marked "refunded".
 */
type PaymentReturn = "returned" | "refund_issued" | null;

function paymentReturnFor(booking: EnrichedBooking): PaymentReturn {
  if (isBookingActive(booking) || isFreeBooking(booking)) return null;
  if (booking.depositStatus === "refunded") return "returned";
  if (booking.status === "refunded") return "refund_issued";
  return null;
}

/**
 * What to tell the attendee about their money once the event has been called
 * off, or null when there is nothing to say.
 *
 * Calling an event off does not by itself move any money. The minimum-group
 * failure run returns only the payments it picks up, and a deposit captured
 * up front on a minimum-group event is not among them: it stays captured,
 * and the booking row may still read live. The page used to tell every such
 * attendee "any payment was released or refunded", which was false for
 * exactly the people who needed to chase their money. So money is said to
 * have come back only when paymentReturnFor finds it recorded; a booking that
 * involved a payment with nothing recorded is pointed to the organiser
 * instead, and a free place gets no talk of money at all.
 */
function cancelledEventPaymentNote(booking: EnrichedBooking): string | null {
  const paymentReturn = paymentReturnFor(booking);
  if (paymentReturn === "returned") return "Your payment was returned.";
  // A webhook refund may have been a partial one, so it is not described as
  // the whole payment coming back.
  if (paymentReturn === "refund_issued") return "A refund was issued for this booking.";
  if (isFreeBooking(booking)) return null;
  return "If you were charged, contact the organiser about a refund.";
}

/** Whether a minimum-group failure run is what called the event off. */
function didGroupFail(booking: EnrichedBooking): boolean {
  return booking.experience?.mvgStatus === "failed";
}

/**
 * The status line for any booking on an event that has been called off, live
 * or not: what happened to the trip, then only what is known about the money.
 */
function cancelledEventStatusInfo(booking: EnrichedBooking): StatusInfo {
  const whatHappened = didGroupFail(booking)
    ? "The group didn't reach its minimum, so the event was cancelled."
    : "This event was cancelled.";
  const note = cancelledEventPaymentNote(booking);
  return {
    label: "Event cancelled",
    description: note ? `${whatHappened} ${note}` : whatHappened,
    variant: "destructive",
  };
}

/**
 * The badge and one-line explanation for a booking.
 *
 * The booking row alone tells the wrong story in several places, so this reads
 * the event alongside it. Every booking on a minimum-group event used to say
 * "Payment Held" while it sat in "pending" — including a €0 RSVP on an event
 * that had already passed its minimum ten times over — and every cancelled
 * booking blamed the group for not forming, which stops being true the moment
 * an attendee can cancel their own.
 */
function resolveStatusInfo(booking: EnrichedBooking): StatusInfo {
  const experience = booking.experience;

  if (booking.status === "failed") return statusConfig.failed;

  if (!isBookingActive(booking)) {
    if (isEventCancelled(booking)) return cancelledEventStatusInfo(booking);
    // Two writers leave "cancelled" with a timestamp: the attendee's own cancel,
    // and storage.markBookingAsRefunded, which the minimum-group failure runs
    // use. Those runs call the event off as well (status "cancelled", or
    // mvgStatus "failed", which the payload reports as lifecycleStatus
    // "cancelled"), so the event-cancelled check above has already answered
    // for their bookings and "You cancelled" is only reached by the
    // attendee's own cancel.
    // That cancel marks depositStatus "refunded" only once money actually went
    // back, a released hold as well as a refund, hence "returned" rather than
    // "refunded". Without it nothing went back, so nothing is claimed.
    // A "refunded" row comes from Stripe's charge.refunded webhook — an
    // organiser or admin refund, sometimes a partial goodwill one — which the
    // attendee never asked for, so it is not put down to them.
    if (booking.status === "cancelled" && booking.cancelledAt) {
      return {
        label: "Cancelled",
        description: booking.depositStatus === "refunded"
          ? "You cancelled this booking and your payment was returned"
          : "You cancelled this booking",
        variant: "destructive",
      };
    }
    if (booking.status === "refunded") {
      return { label: "Refunded", description: "A refund was issued for this booking", variant: "secondary" };
    }
    return { label: "Cancelled", description: "This booking was cancelled", variant: "destructive" };
  }

  // A live booking on an event that will not happen: whatever the row says
  // about payment, the useful fact is that there is nothing to turn up to.
  // This is where a deposit the failure run left captured ends up, so it gets
  // the same pointer to the organiser as an inactive booking would.
  if (isEventCancelled(booking)) return cancelledEventStatusInfo(booking);

  if (experience && hasExperiencePassed(experience)) {
    return booking.attendanceStatus === "attended"
      ? { label: "Attended", description: "You were checked in at this event", variant: "default" }
      : { label: "Event ended", description: "This event has finished", variant: "outline" };
  }

  if (isFreeBooking(booking)) {
    return { label: "Going", description: "Free RSVP — your spot is reserved", variant: "default" };
  }

  // A "pending" booking on a minimum-group event is not awaiting payment — the
  // money is held and released only if the group never forms. Once the group
  // has formed it is simply a confirmed place. "Formed" is the stored status
  // the refund policy reads, not the live count, so this never says
  // "Confirmed" while a cancel would still be refunded as a forming group.
  if (booking.status === "pending" && experience?.requireMinimumParticipants && hasCardPayment(booking)) {
    if (!isGroupStillForming(booking)) {
      return { label: "Confirmed", description: "The group reached its minimum — your spot is confirmed", variant: "default" };
    }
    return {
      label: "Payment Held",
      // The live count can pass the minimum before the event is marked as
      // formed; saying "until the minimum is reached" beside a progress bar
      // that shows it reached would read as a contradiction.
      description: hasGroupFormed(booking)
        ? "Paid and held — the group has reached its minimum and is waiting to be confirmed"
        : "Paid and held until the minimum group size is reached",
      variant: "secondary",
    };
  }

  return statusConfig[booking.status] || { label: booking.status, description: "", variant: "secondary" as const };
}

// Reasons that need no explaining: the badge already says the booking is
// cancelled, or the date on the card already says the event has begun.
const SILENT_CANCEL_BLOCKS = new Set<CancellationBlockedReason>(["inactive", "started"]);

/**
 * The attendee's own way out of a booking, kept to what the policy allows.
 *
 * Whether it is offered at all is the server's call (`cancellation`), because
 * the rules depend on payouts, check-ins and the event's group status that
 * this page cannot see in full. When it is refused for a reason the attendee
 * would not guess — a paid ticket is final under the Terms — the reason is
 * shown instead of a button that would only fail.
 */
function BookingCancelFooter({ booking }: { booking: EnrichedBooking }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancellation = booking.cancellation;
  const currency = cancellation?.currency || booking.experience?.currency;

  // Everything that counts this person among the event's attendees: their
  // bookings list, the event page's spots-left and participant figures, and
  // the review prompt, which should not ask about an event they left.
  const refreshAfterCancel = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/bookings/my-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/bookings", booking.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/experiences", booking.experienceId] });
    queryClient.invalidateQueries({ queryKey: [`/api/experiences/${booking.experienceId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/me/reviewable"] });
  };

  const cancelBooking = useMutation({
    mutationFn: async (): Promise<CancelBookingResult> => {
      const response = await apiRequest("POST", `/api/bookings/${booking.id}/cancel`);
      return response.json();
    },
    onSuccess: (result) => {
      setConfirmOpen(false);
      refreshAfterCancel();
      const returned = formatCurrency(result.amountReturned, result.currency || currency);
      const outcomeText =
        result.outcome === "refunded"
          ? `${returned} has been refunded to your card. It can take 5–10 business days to appear.`
          : result.outcome === "hold_released"
            ? `The ${returned} hold on your card has been released.`
            : "Your spot has been released.";
      // The server adds a notice when the cancel went through but something
      // about it needs saying; dropping it would leave the attendee with only
      // the routine sentence.
      const notice = typeof result.notice === "string" ? result.notice.trim() : "";
      toast({
        title: "Booking cancelled",
        description: notice ? `${outcomeText} ${notice}` : outcomeText,
      });
    },
    onError: (error) => {
      setConfirmOpen(false);
      // A 502 "partial_return" is not a failed cancel: the booking is
      // cancelled and some of the money has gone back, but the rest could not
      // be returned automatically and has been passed to the team. Reporting
      // it as "Couldn't cancel" would send the attendee back to a booking that
      // no longer has a cancel button, so it is told as a cancel, in the
      // server's own words, and everything that counts them is refreshed.
      const failure = parseRequestFailure(error);
      if (failure.status === 502 && failure.body?.code === "partial_return") {
        refreshAfterCancel();
        toast({
          title: "Booking cancelled",
          description: readableError(error, "Your booking is cancelled."),
        });
        return;
      }
      // A refusal usually means the preview was out of date — the event
      // started, or the payment moved on — so fetch the booking as it stands
      // rather than leave a button that will only be refused again.
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/my-bookings"] });
      toast({
        title: "Couldn't cancel this booking",
        description: readableError(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  if (!cancellation) return null;

  const blockedNote =
    !cancellation.allowed &&
    cancellation.message &&
    !(cancellation.blockedReason && SILENT_CANCEL_BLOCKS.has(cancellation.blockedReason))
      ? cancellation.message
      : null;

  if (!cancellation.allowed && !blockedNote) return null;

  const groupStillForming = isGroupStillForming(booking) && !isEventCancelled(booking);

  return (
    <div className="shrink-0 border-t px-4 py-3 sm:px-6" data-testid="booking-detail-actions">
      {cancellation.allowed ? (
        <Button
          type="button"
          variant="outline"
          className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto"
          onClick={() => setConfirmOpen(true)}
          data-testid="button-cancel-booking"
        >
          Cancel booking
        </Button>
      ) : (
        <p className="text-xs text-gray-500" data-testid="text-cancel-blocked">
          {blockedNote}
        </p>
      )}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          // Closing mid-request would hide the outcome; the toast reports it.
          if (!cancelBooking.isPending) setConfirmOpen(next);
        }}
      >
        <AlertDialogContent
          className="w-[calc(100%-2rem)] rounded-lg"
          data-testid="dialog-confirm-cancel-booking"
        >
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-cancel-booking-outcome">
              {cancellation.mode === "money_back"
                ? `Your spot will be released and ${formatCurrency(cancellation.amount, currency)} will be returned to your card.`
                : "Your spot will be released so someone else can take it."}
            </AlertDialogDescription>
            {cancellation.mode === "money_back" && (
              <p className="text-sm text-muted-foreground" data-testid="text-cancel-booking-timing">
                If your payment is still on hold, the hold disappears right away. If your card was
                already charged, the refund takes 5–10 business days to appear.
              </p>
            )}
            {groupStillForming && (
              <p className="text-sm text-amber-700" data-testid="text-cancel-mvg-warning">
                This event still needs its minimum group. If the group no longer reaches its
                minimum, the event may not go ahead.
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelBooking.isPending} data-testid="button-keep-booking">
              Keep booking
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Stay open until the server answers, so a refusal is not
                // mistaken for success.
                event.preventDefault();
                cancelBooking.mutate();
              }}
              disabled={cancelBooking.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-cancel-booking"
            >
              {cancelBooking.isPending ? "Cancelling…" : "Cancel booking"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BookingDetailView({ booking, open, onClose }: { booking: EnrichedBooking | null; open: boolean; onClose: () => void }) {
  if (!booking) return null;

  const statusInfo = resolveStatusInfo(booking);
  const currency = booking.experience?.currency;
  const depositAmount = parseFloat(booking.depositAmount || "0");
  const totalPrice = parseFloat(booking.totalPrice || booking.experience?.price || "0");
  // Only a deposit booking has an outstanding balance. Deriving one from
  // total - deposit made fully paid bookings look like they still owed the
  // whole ticket price.
  const balanceAmount = parseFloat(booking.balanceAmount || "0");
  const isDepositBooking = booking.isDepositOnly === true && depositAmount > 0;
  // A cancelled or refunded booking owes nothing: the server refuses to take
  // its balance, so a "Remaining Balance" and a due date would ask the
  // attendee to pay for a place they no longer have. Nor is it "paid in
  // full" — what it says instead is whether the money went back.
  const bookingActive = isBookingActive(booking);
  // Nor does a booking on an event that has been called off: the booking row
  // can still read live (deposit_paid) after the event is cancelled, and a
  // due date would ask for the rest of the price of a trip that will not run.
  const balanceStillOwed = bookingActive && !isEventCancelled(booking);
  const hasOutstandingBalance = balanceStillOwed && isDepositBooking && !booking.balancePaid && balanceAmount > 0;
  const paymentReturn = paymentReturnFor(booking);
  const paidAmountClass = bookingActive ? "font-medium text-green-700" : "font-medium text-gray-700";
  const amountPaid = amountPaidFor(booking);
  const minimumParticipants = booking.experience?.minimumParticipants || 0;
  const joinedParticipants = booking.experience?.currentParticipants || 0;
  const groupFormed = hasGroupFormed(booking);
  const mvgPaymentNote = isEventCancelled(booking) ? cancelledEventPaymentNote(booking) : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-lg p-0 supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]"
        aria-describedby={undefined}
        data-testid="dialog-booking-detail"
      >
        <DialogHeader className="shrink-0 p-4 pr-12 text-left sm:p-6 sm:pr-12">
          <DialogTitle data-testid="text-detail-title">Booking Details</DialogTitle>
        </DialogHeader>
        
        {/* Scroll the details independently so the title and close button stay reachable. */}
        <div
          className="min-h-0 min-w-0 space-y-6 overflow-y-auto overscroll-contain px-4 pb-4 [overflow-wrap:anywhere] sm:px-6 sm:pb-6"
          data-testid="booking-detail-scroll"
        >
          {booking.experience?.coverImageUrl ? (
            <img 
              src={booking.experience.coverImageUrl} 
              alt={booking.experience.title || "Experience"} 
              className="w-full h-48 object-cover rounded-lg"
              data-testid="img-detail-cover"
            />
          ) : (
            <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
              <ImageIcon className="h-12 w-12 text-gray-400" />
            </div>
          )}

          <div>
            <h3 className="text-xl font-semibold" data-testid="text-detail-experience-title">
              {booking.experience?.title || "Experience"}
            </h3>
            
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={statusInfo.variant} data-testid="badge-detail-status">
                {statusInfo.label}
              </Badge>
              <span className="text-sm text-gray-600" data-testid="text-detail-status-description">
                {statusInfo.description}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            {booking.experience?.startDate && (
              <div className="flex items-center gap-2" data-testid="text-detail-dates">
                <Calendar className="h-4 w-4 shrink-0 text-gray-500" />
                <span>
                  {new Date(booking.experience.startDate).toLocaleDateString()}
                  {booking.experience.endDate && ` - ${new Date(booking.experience.endDate).toLocaleDateString()}`}
                </span>
              </div>
            )}
            
            {/* Somebody opening this the morning of the event wants directions,
                not an address to retype into their phone. */}
            {(booking.experience?.location || booking.experience?.venue) && (
              <>
                <AddressLink
                  address={booking.experience.location}
                  name={booking.experience.venue}
                  className="min-w-0 text-gray-700 [&>span]:min-w-0"
                  data-testid="text-detail-location"
                />
                <LocationMap
                  address={booking.experience.location}
                  name={booking.experience.venue}
                  height={200}
                  className="min-w-0 sm:col-span-2"
                />
              </>
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <h4 className="font-medium">Payment Summary</h4>

            {booking.ticketName && (
              <div className="flex justify-between gap-4 text-sm" data-testid="text-detail-ticket">
                <span className="shrink-0 text-gray-600">Ticket</span>
                <span className="min-w-0 text-right font-medium">
                  {booking.ticketName}
                  {booking.ticketQuantity && booking.ticketQuantity > 1 ? ` × ${booking.ticketQuantity}` : ''}
                </span>
              </div>
            )}

            {isDepositBooking ? (
              <>
                <div className="flex justify-between text-sm" data-testid="text-detail-deposit">
                  <span className="text-gray-600">Deposit Paid</span>
                  <span className={paidAmountClass}>{formatCurrency(depositAmount, currency)}</span>
                </div>

                {(balanceStillOwed || booking.balancePaid) && (
                  <div className="flex justify-between text-sm" data-testid="text-detail-balance">
                    <span className="text-gray-600">{booking.balancePaid ? 'Balance Paid' : 'Remaining Balance'}</span>
                    <span className={booking.balancePaid ? paidAmountClass : 'font-medium text-amber-700'}>
                      {formatCurrency(balanceAmount, currency)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between text-sm" data-testid="text-detail-deposit">
                <span className="text-gray-600">Amount Paid</span>
                <span className={paidAmountClass}>{formatCurrency(amountPaid, currency)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm border-t pt-2" data-testid="text-detail-total">
              <span className="font-medium">Total Price</span>
              <span className="font-semibold">{formatCurrency(totalPrice, currency)}</span>
            </div>

            {bookingActive && !isDepositBooking && (
              <p className="text-sm text-green-700" data-testid="text-detail-no-balance">
                Paid in full — no remaining balance.
              </p>
            )}

            {paymentReturn && (
              <p className="text-sm text-gray-600" data-testid="text-detail-payment-returned">
                {paymentReturn === "returned"
                  ? "Payment returned to your card."
                  : "A refund was issued for this booking."}
              </p>
            )}

            {hasOutstandingBalance && booking.balanceDueDate && (
              <div className="flex items-center gap-2 text-sm text-orange-600 mt-2" data-testid="text-detail-due-date">
                <Clock className="h-4 w-4" />
                <span>Balance due by {new Date(booking.balanceDueDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Only events that actually set a minimum group. Gating on the
              number alone rendered a stray "0" for events without one, and a
              "106 / 10" that read like the event was a tenth full. */}
          {booking.experience?.requireMinimumParticipants && minimumParticipants > 0 ? (
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium">Group Progress</h4>
              <div className="space-y-2">
                <div className="flex justify-between gap-4 text-sm" data-testid="mvg-progress-text">
                  <span className="shrink-0 text-gray-600">Participants</span>
                  <span className="min-w-0 text-right font-medium">
                    {groupFormed
                      ? `${joinedParticipants} joined · minimum of ${minimumParticipants} reached`
                      : `${joinedParticipants} of ${minimumParticipants} needed`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2" data-testid="mvg-progress-bar">
                  <div
                    className={groupFormed
                      ? "bg-green-600 h-2 rounded-full"
                      : "bg-blue-600 h-2 rounded-full"}
                    style={{
                      width: `${groupFormed ? 100 : Math.min(100, (joinedParticipants / minimumParticipants) * 100)}%`
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm" data-testid="mvg-status-indicator">
                  {/* Cancelled first: an event called off after its group
                      formed is still not happening. It says what happened to
                      the trip and, separately, only what the booking records
                      about the money: a deposit captured up front is left
                      captured by the failure run, so "any payment has been
                      released or refunded" was not true for everyone. */}
                  {isEventCancelled(booking) ? (
                    <span className="text-red-600">
                      {didGroupFail(booking)
                        ? "❌ Trip cancelled — the minimum group wasn't reached."
                        : "❌ Trip cancelled — this event was called off."}
                      {mvgPaymentNote && (
                        <span data-testid="mvg-status-payment-note"> {mvgPaymentNote}</span>
                      )}
                    </span>
                  ) : groupFormed ? (
                    <span className="text-green-600">✅ Group confirmed — this trip is happening!</span>
                  ) : (
                    <span className="text-gray-600">
                      Forming — trip confirms once {minimumParticipants} people join.
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="text-xs text-gray-500" data-testid="text-detail-booking-date">
            Booked on {new Date(booking.bookingDate || booking.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Outside the scrolling body, like the header, so the action stays
            on screen however short the viewport and however long the event's
            address or ticket name. */}
        <BookingCancelFooter booking={booking} />
      </DialogContent>
    </Dialog>
  );
}

export default function TravelerBookings() {
  // The id, not a copy of the row: the open dialog reads the booking from the
  // latest fetch, so after a cancel it shows the cancelled booking rather than
  // the snapshot taken when it was opened.
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const { data: bookings, isLoading } = useQuery<EnrichedBooking[]>({
    queryKey: ["/api/bookings/my-bookings"],
    enabled: !!user,
  });

  const selectedBooking = bookings?.find((booking) => booking.id === selectedBookingId) ?? null;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold mb-2">Please sign in</h2>
              <p className="text-gray-600 mb-4">You need to be signed in to view your bookings.</p>
              <Button asChild data-testid="link-login">
                <a href="/api/login">Sign In</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/4"></div>
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900" data-testid="text-page-title">My Bookings</h1>
              <p className="text-gray-600">View your trip bookings and payment status</p>
            </div>
            <Button asChild data-testid="button-browse-experiences">
              <Link href="/experiences">Browse Experiences</Link>
            </Button>
          </div>

          {/* Asked here rather than by email: this is the page someone opens
              after an event anyway, and it renders nothing when there is
              nothing left to review. */}
          <ReviewPrompt className="mb-6" />

          {!bookings || bookings.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-semibold mb-2" data-testid="text-no-bookings">No bookings yet</h3>
                <p className="text-gray-600 mb-6">Ready to embark on your first adventure? Discover amazing experiences waiting for you.</p>
                <Button asChild size="lg" data-testid="button-discover-experiences">
                  <Link href="/experiences">Discover Experiences</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {bookings.map((booking) => {
                const statusInfo = resolveStatusInfo(booking);
                const isDepositBooking = booking.isDepositOnly === true && parseFloat(booking.depositAmount || "0") > 0;
                // The list said "Paid: €25.00" on a cancelled or refunded
                // booking, as if the money were still spent on a live place.
                // Off bookings show it greyed out, and as "Returned" when it
                // went back, by the same rule the details dialog uses.
                const bookingActive = isBookingActive(booking);
                const paymentReturn = paymentReturnFor(booking);
                const paidAmount = amountPaidFor(booking);
                // A webhook refund ("refund_issued") comes from Stripe's
                // charge.refunded, which fires for a partial refund too, so
                // putting the booking's full amount beside it would claim
                // money came back that may not have. It is named without a
                // figure. "Returned" keeps its amount: it is reported only for
                // depositStatus "refunded", which the cancel endpoint writes
                // once every payment on the booking has gone back.
                const paidText = paymentReturn === 'refund_issued'
                  ? 'Refund issued'
                  : `${paymentReturn === 'returned' ? 'Returned' : isDepositBooking ? 'Deposit' : 'Paid'}: ${formatCurrency(paidAmount, booking.experience?.currency)}`;

                return (
                  <Card 
                    key={booking.id} 
                    className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedBookingId(booking.id)}
                    data-testid={`card-booking-${booking.id}`}
                  >
                    <CardContent className="p-0">
                      <div className="flex flex-col sm:flex-row">
                        {booking.experience?.coverImageUrl ? (
                          <img 
                            src={booking.experience.coverImageUrl} 
                            alt={booking.experience.title || "Experience"} 
                            className="h-40 w-full shrink-0 object-cover sm:h-32 sm:w-32"
                            data-testid={`img-booking-cover-${booking.id}`}
                          />
                        ) : (
                          <div className="flex h-40 w-full shrink-0 items-center justify-center bg-gray-100 sm:h-32 sm:w-32">
                            <ImageIcon className="h-8 w-8 text-gray-400" />
                          </div>
                        )}
                        
                        <div className="min-w-0 flex-1 p-4 [overflow-wrap:anywhere]">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-lg" data-testid={`text-booking-title-${booking.id}`}>
                                {booking.experience?.title || "Experience"}
                              </h3>
                              <Badge 
                                variant={statusInfo.variant} 
                                className="mt-1"
                                data-testid={`badge-booking-status-${booking.id}`}
                              >
                                {statusInfo.label}
                              </Badge>
                            </div>
                            <div className="shrink-0 sm:text-right">
                              <div
                                className={`flex items-center gap-1 text-sm ${bookingActive ? 'text-gray-600' : 'text-gray-400'}`}
                                data-testid={`text-booking-deposit-${booking.id}`}
                              >
                                <CreditCard className="h-4 w-4" />
                                <span>{paidText}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                            {booking.experience?.startDate && (
                              <div className="flex items-center gap-1" data-testid={`text-booking-date-${booking.id}`}>
                                <Calendar className="h-4 w-4" />
                                <span>{new Date(booking.experience.startDate).toLocaleDateString()}</span>
                              </div>
                            )}
                            {(booking.experience?.location || booking.experience?.venue) && (
                              <AddressLink
                                address={booking.experience.location}
                                name={booking.experience.venue}
                                className="min-w-0 [&>span]:min-w-0"
                                data-testid={`text-booking-location-${booking.id}`}
                              />
                            )}
                          </div>
                          
                          <p className="mt-2 text-xs text-gray-500" data-testid={`text-booking-created-${booking.id}`}>
                            Booked on {new Date(booking.bookingDate || booking.createdAt).toLocaleDateString()}
                          </p>

                          {/* The code the door scans. Collapsed until asked for:
                              it admits whoever holds it. Not offered once the
                              booking or the event is off — there is no door
                              left for it to open. */}
                          {isBookingActive(booking) && !isEventCancelled(booking) && (
                            <TicketQr bookingId={booking.id} className="mt-3" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      <BookingDetailView 
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBookingId(null)}
      />
    </div>
  );
}
