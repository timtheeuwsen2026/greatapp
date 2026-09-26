type Money = string | number | null | undefined;
export type EventFeeRates = { ticketPlatformFeePct: number; addonPlatformFeePct: number };
export type FeeRateSource = {
  ticketPlatformFeePct?: Money; addonPlatformFeePct?: Money; platformPct?: Money;
};
export function feePercentage(value: Money, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : fallback;
}
export function eventFeeRates(event: FeeRateSource = {}, defaultTicketPct = 15): EventFeeRates {
  return {
    ticketPlatformFeePct: feePercentage(event.ticketPlatformFeePct, feePercentage(event.platformPct, defaultTicketPct)),
    addonPlatformFeePct: feePercentage(event.addonPlatformFeePct, 0),
  };
}
export function platformFeeCents(ticketCents: number, addonCents: number, rates: EventFeeRates): number {
  return Math.round(Math.max(0, ticketCents) * rates.ticketPlatformFeePct / 100)
    + Math.round(Math.max(0, addonCents) * rates.addonPlatformFeePct / 100);
}
export function bookingPlatformFeeCents(booking: FeeRateSource & {
  totalPrice?: Money; amount?: Money; addonTotal?: Money; isDepositOnly?: boolean | null; balancePaid?: boolean | null;
}, defaultTicketPct = 15, collectedOnly = false): number {
  const full = Math.max(0, Math.round(Number(booking.totalPrice ?? booking.amount ?? 0) * 100));
  const collected = collectedOnly && booking.isDepositOnly && !booking.balancePaid
    ? Math.min(full, Math.max(0, Math.round(Number(booking.amount || 0) * 100))) : full;
  const addon = Math.min(full, Math.max(0, Math.round(Number(booking.addonTotal || 0) * 100)));
  const collectedAddon = full > 0 ? Math.round(addon * collected / full) : 0;
  // Old payments predate separate rates. Their original gross fee stays intact.
  const rates = {
    ticketPlatformFeePct: feePercentage(booking.ticketPlatformFeePct, defaultTicketPct),
    addonPlatformFeePct: feePercentage(booking.addonPlatformFeePct, defaultTicketPct),
  };
  return platformFeeCents(collected - collectedAddon, collectedAddon, rates);
}
export function feeSnapshotFromMetadata(metadata: Record<string, string> = {}, legacyPct = 15): EventFeeRates {
  return {
    ticketPlatformFeePct: feePercentage(metadata.ticketPlatformFeePct, legacyPct),
    addonPlatformFeePct: feePercentage(metadata.addonPlatformFeePct, legacyPct),
  };
}
export function withoutEventFeeOverrides<T extends Record<string, any>>(input: T): T {
  const { ticketPlatformFeePct, addonPlatformFeePct, platformFeesUpdatedBy, platformFeesUpdatedAt, ...safe } = input;
  return safe as T;
}
