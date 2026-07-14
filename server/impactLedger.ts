type MoneyValue = string | number | null | undefined;

export interface ImpactLedgerBooking {
  commissionAmount?: MoneyValue;
  commissionCurrency?: string | null;
  commissionStatus?: string | null;
  totalPrice?: MoneyValue;
  totalAmount?: MoneyValue;
  amount?: MoneyValue;
}

function positiveMoney(value: MoneyValue): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveBookingGrossValue(booking: ImpactLedgerBooking): number {
  return positiveMoney(booking.totalPrice)
    ?? positiveMoney(booking.totalAmount)
    ?? positiveMoney(booking.amount)
    ?? 0;
}

export function normalizeCurrency(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const normalized = candidate?.trim().toUpperCase();
    if (normalized && /^[A-Z]{3}$/.test(normalized)) return normalized;
  }
  return null;
}

export function summarizeImpactEarnings(
  rows: Array<{ booking: ImpactLedgerBooking; experienceCurrency?: string | null }>,
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const { booking, experienceCurrency } of rows) {
    if (!['estimated', 'locked', 'paid'].includes(booking.commissionStatus || '')) continue;

    const currency = normalizeCurrency(booking.commissionCurrency, experienceCurrency);
    const amount = Number(booking.commissionAmount);
    if (!currency || !Number.isFinite(amount)) continue;

    totals[currency] = (totals[currency] || 0) + amount;
  }

  return totals;
}
