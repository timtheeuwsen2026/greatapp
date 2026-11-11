import { bookingPlatformFeeCents as calculateBookingPlatformFee } from "@shared/platformFees";
import { venuePricedAddonCents } from "@shared/addonChoices";
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

// A booking only counts once Stripe has the money (Step 1, Nov 2026): every
// paid ticket is charged at checkout, so `pending` is an unfinished checkout.
// The same three statuses the payout pays out on.
const EARNING_BOOKING_STATUSES = new Set([
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
  venueRevenueSharePct?: MoneyValue;
  venueCompensationModel?: string | null;
  venueFixedFee?: MoneyValue;
  /** Only an event with a linked venue pays a venue for its add-ons. */
  linkedVenueId?: string | null;
};

export type EarningsBookingInput = {
  ticketPlatformFeePct?: MoneyValue;
  addonPlatformFeePct?: MoneyValue;
  addonTotal?: MoneyValue;
  addonItems?: unknown;
  id?: string | null;
  status?: string | null;
  amount?: MoneyValue;
  totalPrice?: MoneyValue;
  ticketQuantity?: MoneyValue;
  isDepositOnly?: boolean | null;
  balancePaid?: boolean | null;
  bookingDate?: Date | string | null;
  createdAt?: Date | string | null;
  /** Paid with the test key, or by a test account: no money, left out. */
  testPayment?: boolean | null;
  /** Disputed with the bank: left out until the dispute is won. */
  disputedAt?: Date | string | null;
  /** A partner's commission on this booking, and where it stands. */
  commissionAmount?: MoneyValue;
  commissionStatus?: string | null;
  experience?: EarningsExperienceInput | null;
};

export type ExperienceEarnings = {
  experienceId: string | null;
  title: string | null;
  bookingsCount: number;
  grossCents: number;
  platformFeeCents: number;
  spaceShareCents: number;
  partnerCommissionCents: number;
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
  /** Commission owed to partners who brought buyers; comes off the organiser's share. */
  totalPartnerCommission: number;
  /** Ticket sales only (without add-ons): what the platform fee is a share of. */
  totalTicketSales: number;
  /** What the creator keeps: gross minus platform fee minus venue share. */
  totalEarnings: number;
  averageBookingValue: number;
  /** The platform fee as a share of ticket sales ("15% of tickets"). */
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
  let partnerCommissionCents = 0;
  let ticketSalesCents = 0;

  for (const booking of bookings) {
    if (!isEarningBooking(booking.status)) continue;
    if (booking.testPayment || booking.disputedAt) continue;

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
    // The venue's percentage applies only on a revenue-share deal, read the way
    // the payout reads it (buildDefaultRecipients), so both tell one story.
    const sharesRevenue = experience.venueCompensationModel === "revenue_share"
      || experience.venueCompensationModel === "commitment_plus_revenue_share"
      || !experience.venueCompensationModel;
    const venuePct = sharesRevenue
      ? money(experience.venueRevenueSharePct ?? experience.venueRevenuePercentage)
      : 0;
    const deductionCents = experience.venueCompensationModel === "fixed_fee"
      ? calculateTicketDeductionCents(experience.venueFixedFee, booking.ticketQuantity)
      : 0;

    const bookingPlatformFeeCents = calculateBookingPlatformFee(booking, agreedPlatformPct);
    // An add-on priced from the venue's discount pays the venue its discounted
    // price whole, and is left out of the revenue share so it is not paid for
    // twice — the same division the payout makes.
    const venuePriced = experience.linkedVenueId
      ? venuePricedAddonCents(booking.addonItems)
      : { gross: 0, venue: 0, markup: 0 };
    // The partner's commission is paid out of the organiser's part, after the
    // platform fee and the venue (the payout reserves it the same way).
    const commissionCents = booking.commissionStatus === "estimated" || booking.commissionStatus === "locked"
      || booking.commissionStatus === "paid"
      ? toCents(booking.commissionAmount)
      : 0;
    const addonCents = Math.min(bookingGrossCents, Math.max(0, toCents(booking.addonTotal)));
    // The venue's cut and the platform's cut both come off the top; the creator
    // keeps the remainder. Never let rounding push a booking below zero.
    const bookingSpaceShareCents = Math.min(
      Math.max(0, bookingGrossCents - bookingPlatformFeeCents),
      Math.round(Math.max(0, bookingGrossCents - venuePriced.gross) * (venuePct / 100))
        + venuePriced.venue + deductionCents,
    );
    const bookingNetCents = Math.max(
      0,
      bookingGrossCents - bookingPlatformFeeCents - bookingSpaceShareCents - commissionCents,
    );

    bookingsCount += 1;
    grossCents += bookingGrossCents;
    collectedCents += Math.min(bookingCollectedCents, bookingGrossCents);
    platformFeeCents += bookingPlatformFeeCents;
    spaceShareCents += bookingSpaceShareCents;
    partnerCommissionCents += commissionCents;
    ticketSalesCents += bookingGrossCents - addonCents;

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
      partnerCommissionCents: 0,
      netCents: 0,
    };
    row.bookingsCount += 1;
    row.grossCents += bookingGrossCents;
    row.platformFeeCents += bookingPlatformFeeCents;
    row.spaceShareCents += bookingSpaceShareCents;
    row.partnerCommissionCents += commissionCents;
    row.netCents += bookingNetCents;
    perExperience.set(key, row);
  }

  // With mixed currencies, report the one carrying the most revenue rather than
  // inventing a converted total.
  const currency = Array.from(currencies.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "eur";
  const netCents = Math.max(0, grossCents - platformFeeCents - spaceShareCents - partnerCommissionCents);

  return {
    summary: {
      currency,
      bookingsCount,
      totalGross: fromCents(grossCents),
      totalCollected: fromCents(collectedCents),
      outstandingBalance: fromCents(Math.max(0, grossCents - collectedCents)),
      totalPlatformFees: fromCents(platformFeeCents),
      totalSpaceShare: fromCents(spaceShareCents),
      totalPartnerCommission: fromCents(partnerCommissionCents),
      totalTicketSales: fromCents(ticketSalesCents),
      totalEarnings: fromCents(netCents),
      averageBookingValue: bookingsCount > 0 ? fromCents(Math.round(grossCents / bookingsCount)) : 0,
      // Of ticket sales, not of tickets plus add-ons: the fee is charged on
      // tickets (Tim saw 9.2% where the rule is 15%).
      effectivePlatformFeePct: ticketSalesCents > 0
        ? Math.round((platformFeeCents / ticketSalesCents) * 1000) / 10
        : options.defaultPlatformFeePct,
    },
    byExperience: Array.from(perExperience.values()).sort((a, b) => b.grossCents - a.grossCents),
  };
}
