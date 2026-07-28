/**
 * One earnings calculation for every creator-facing money view.
 *
 * The dashboard used to read two different sources that disagreed: a ledger
 * endpoint that summed every booking row (cancelled ones included) in dollars,
 * and an earnings endpoint backed by a stub that always returned zero. Both now
 * read through this module so the numbers can only ever tell one story.
 *
 * Everything is computed in minor units (cents) and only converted at the edge.
 */

import { calculateTicketDeductionCents } from "@shared/ticketDeduction";

// A booking only counts once the buyer's money is committed. Cancelled,
// refunded and failed bookings are excluded — matching the statuses the rest of
// the app treats as an active participant.
const EARNING_BOOKING_STATUSES = new Set([
  "pending",
  "deposit_authorized",
  "deposit_paid",
  "confirmed",
  "fully_paid",
]);

type MoneyValue = string | number | null | undefined;

export type EarningsExperienceInput = {
  id?: string | null;
  title?: string | null;
  currency?: string | null;
  platformPct?: MoneyValue;
  venueRevenuePercentage?: MoneyValue;
  venueCompensationModel?: string | null;
  venueFixedFee?: MoneyValue;
};

export type EarningsBookingInput = {
  id?: string | null;
  status?: string | null;
  amount?: MoneyValue;
  totalPrice?: MoneyValue;
  ticketQuantity?: MoneyValue;
  isDepositOnly?: boolean | null;
  balancePaid?: boolean | null;
  bookingDate?: Date | string | null;
  createdAt?: Date | string | null;
  experience?: EarningsExperienceInput | null;
};

export type ExperienceEarnings = {
  experienceId: string | null;
  title: string | null;
  bookingsCount: number;
  grossCents: number;
  platformFeeCents: number;
  spaceShareCents: number;
  netCents: number;
};

export type CreatorEarningsSummary = {
  currency: string;
  bookingsCount: number;
  /** Full ticket value of every committed booking. */
  totalGross: number;
  /** Money actually charged so far — lower than gross while deposits are outstanding. */
  totalCollected: number;
  /** Still to be charged (unpaid deposit balances). */
  outstandingBalance: number;
  totalPlatformFees: number;
  totalSpaceShare: number;
  /** What the creator keeps: gross minus platform fee minus venue share. */
  totalEarnings: number;
  averageBookingValue: number;
  /** Weighted platform fee actually applied, for display next to the number. */
  effectivePlatformFeePct: number;
};

export type CreatorEarningsResult = {
  summary: CreatorEarningsSummary;
  byExperience: ExperienceEarnings[];
};

function money(value: MoneyValue): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCents(value: MoneyValue): number {
  return Math.round(money(value) * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function isEarningBooking(status: string | null | undefined): boolean {
  return EARNING_BOOKING_STATUSES.has(status || "");
}

/**
 * @param defaultPlatformFeePct read from the platform_settings table by the
 *   caller — never hardcoded. Used only when an experience has no agreed rate
 *   of its own stored on it.
 */
export function summarizeCreatorEarnings(
  bookings: EarningsBookingInput[],
  options: { defaultPlatformFeePct: number },
): CreatorEarningsResult {
  const perExperience = new Map<string, ExperienceEarnings>();
  const currencies = new Map<string, number>();

  let bookingsCount = 0;
  let grossCents = 0;
  let collectedCents = 0;
  let platformFeeCents = 0;
  let spaceShareCents = 0;

  for (const booking of bookings) {
    if (!isEarningBooking(booking.status)) continue;

    const experience = booking.experience || {};
    const bookingGrossCents = toCents(booking.totalPrice);
    if (bookingGrossCents <= 0) continue;

    // A deposit booking has only collected the deposit until the balance lands.
    const bookingCollectedCents = booking.isDepositOnly && booking.balancePaid !== true
      ? toCents(booking.amount)
      : bookingGrossCents;

    const agreedPlatformPct = experience.platformPct === null || experience.platformPct === undefined
      ? options.defaultPlatformFeePct
      : money(experience.platformPct);
    const venuePct = money(experience.venueRevenuePercentage);
    const deductionCents = experience.venueCompensationModel === "fixed_fee"
      ? calculateTicketDeductionCents(experience.venueFixedFee, booking.ticketQuantity)
      : 0;

    const bookingPlatformFeeCents = Math.round(bookingGrossCents * (agreedPlatformPct / 100));
    // The venue's cut and the platform's cut both come off the top; the creator
    // keeps the remainder. Never let rounding push a booking below zero.
    const bookingSpaceShareCents = Math.min(
      Math.max(0, bookingGrossCents - bookingPlatformFeeCents),
      Math.round(bookingGrossCents * (venuePct / 100)) + deductionCents,
    );
    const bookingNetCents = Math.max(
      0,
      bookingGrossCents - bookingPlatformFeeCents - bookingSpaceShareCents,
    );

    bookingsCount += 1;
    grossCents += bookingGrossCents;
    collectedCents += Math.min(bookingCollectedCents, bookingGrossCents);
    platformFeeCents += bookingPlatformFeeCents;
    spaceShareCents += bookingSpaceShareCents;

    const currency = String(experience.currency || "eur").toLowerCase();
    currencies.set(currency, (currencies.get(currency) || 0) + bookingGrossCents);

    const key = String(experience.id || "unknown");
    const row = perExperience.get(key) || {
      experienceId: experience.id ?? null,
      title: experience.title ?? null,
      bookingsCount: 0,
      grossCents: 0,
      platformFeeCents: 0,
      spaceShareCents: 0,
      netCents: 0,
    };
    row.bookingsCount += 1;
    row.grossCents += bookingGrossCents;
    row.platformFeeCents += bookingPlatformFeeCents;
    row.spaceShareCents += bookingSpaceShareCents;
    row.netCents += bookingNetCents;
    perExperience.set(key, row);
  }

  // With mixed currencies, report the one carrying the most revenue rather than
  // inventing a converted total.
  const currency = Array.from(currencies.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "eur";
  const netCents = Math.max(0, grossCents - platformFeeCents - spaceShareCents);

  return {
    summary: {
      currency,
      bookingsCount,
      totalGross: fromCents(grossCents),
      totalCollected: fromCents(collectedCents),
      outstandingBalance: fromCents(Math.max(0, grossCents - collectedCents)),
      totalPlatformFees: fromCents(platformFeeCents),
      totalSpaceShare: fromCents(spaceShareCents),
      totalEarnings: fromCents(netCents),
      averageBookingValue: bookingsCount > 0 ? fromCents(Math.round(grossCents / bookingsCount)) : 0,
      effectivePlatformFeePct: grossCents > 0
        ? Math.round((platformFeeCents / grossCents) * 1000) / 10
        : options.defaultPlatformFeePct,
    },
    byExperience: Array.from(perExperience.values()).sort((a, b) => b.grossCents - a.grossCents),
  };
}
