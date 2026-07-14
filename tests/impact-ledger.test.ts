import { describe, expect, it } from 'vitest';
import { resolveBookingGrossValue, summarizeImpactEarnings } from '../server/impactLedger';

describe('My Impact ledger presentation data', () => {
  it('uses the full ticket price as booking value', () => {
    expect(resolveBookingGrossValue({ totalPrice: '100.00', amount: '25.00' })).toBe(100);
  });

  it('falls back to the charged amount for legacy zero-price bookings', () => {
    expect(resolveBookingGrossValue({ totalPrice: '0.00', amount: '100.00' })).toBe(100);
  });

  it('groups earnings by stored commission currency', () => {
    expect(summarizeImpactEarnings([
      { booking: { commissionAmount: '10.00', commissionCurrency: 'usd', commissionStatus: 'estimated' } },
      { booking: { commissionAmount: '5.00', commissionCurrency: 'EUR', commissionStatus: 'locked' } },
      { booking: { commissionAmount: '3.00', commissionCurrency: 'USD', commissionStatus: 'voided' } },
    ])).toEqual({ USD: 10, EUR: 5 });
  });

  it('uses the event currency when a legacy commission row has none', () => {
    expect(summarizeImpactEarnings([
      {
        booking: { commissionAmount: '10.00', commissionStatus: 'paid' },
        experienceCurrency: 'USD',
      },
    ])).toEqual({ USD: 10 });
  });
});
