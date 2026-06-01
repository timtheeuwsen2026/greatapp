/**
 * Unit Tests for Pricing Service
 * 
 * NOTE: This project currently has no testing framework installed.
 * These tests are written in Jest-style format and will work when
 * a testing framework like Jest, Vitest, or similar is added.
 * 
 * To run these tests, add a testing framework:
 * npm install --save-dev jest @types/jest ts-jest
 * or
 * npm install --save-dev vitest
 */

import {
  buildSkusFromRooms,
  getPriceSource,
  applyDiscounts,
  formatPriceByCurrency,
  computeRevenueSplit,
  computeMVGProgress,
  normalizeCurrency,
  calculateTotalFromSkus,
  isDiscountValid,
  type Room,
  type SKU,
  type Discount,
  type SupportedCurrency,
} from './pricingService';

// ============================================================================
// TEST DATA FIXTURES
// ============================================================================

const mockRooms: Room[] = [
  {
    id: 'room-1',
    name: 'Deluxe Suite',
    capacity: 2,
    pricePerNight: 150,
    quantity: 2,
    description: 'Spacious suite with ocean view',
    amenities: ['WiFi', 'Mini Bar', 'Ocean View'],
    photos: ['photo1.jpg', 'photo2.jpg'],
  },
  {
    id: 'room-2',
    name: 'Standard Room',
    capacity: 1,
    pricePerNight: 80,
    quantity: 3,
    description: 'Comfortable standard room',
    amenities: ['WiFi', 'AC'],
    photos: ['photo3.jpg'],
  },
];

const mockDiscounts: Discount[] = [
  {
    id: 'discount-1',
    title: 'Early Bird 20%',
    type: 'percentage',
    value: 20,
    validUntil: '2025-12-31T23:59:59Z',
    active: true,
  },
  {
    id: 'discount-2', 
    title: '$50 Off',
    type: 'fixed',
    value: 50,
    active: true,
  },
  {
    id: 'discount-3',
    title: 'Low Capacity 15%',
    type: 'percentage',
    value: 15,
    capacityCap: 5,
    active: true,
  },
  {
    id: 'discount-4',
    title: 'Expired Discount',
    type: 'percentage',
    value: 30,
    validUntil: '2020-01-01T00:00:00Z',
    active: true,
  },
  {
    id: 'discount-5',
    title: 'Inactive Discount',
    type: 'percentage',
    value: 25,
    active: false,
  },
  {
    id: 'discount-6',
    title: 'SKU Specific',
    type: 'percentage',
    value: 10,
    skuId: 'room-1',
    active: true,
  },
];

// ============================================================================
// buildSkusFromRooms TESTS
// ============================================================================

describe('buildSkusFromRooms', () => {
  test('should convert rooms to SKUs correctly', () => {
    const skus = buildSkusFromRooms(mockRooms);
    
    expect(skus).toHaveLength(2);
    
    // Check first SKU
    expect(skus[0]).toEqual({
      id: 'room-1',
      name: 'Deluxe Suite',
      quantity: 2,
      pricePerPerson: 150,
      gallery: ['photo1.jpg', 'photo2.jpg'],
      notes: 'Spacious suite with ocean view',
    });
    
    // Check second SKU
    expect(skus[1]).toEqual({
      id: 'room-2',
      name: 'Standard Room',
      quantity: 3,
      pricePerPerson: 80,
      gallery: ['photo3.jpg'],
      notes: 'Comfortable standard room',
    });
  });

  test('should handle empty rooms array', () => {
    const skus = buildSkusFromRooms([]);
    expect(skus).toEqual([]);
  });

  test('should handle null/undefined input', () => {
    expect(buildSkusFromRooms(null as any)).toEqual([]);
    expect(buildSkusFromRooms(undefined as any)).toEqual([]);
  });

  test('should handle rooms with missing optional fields', () => {
    const minimalRooms: Room[] = [{
      id: 'room-min',
      name: 'Minimal Room',
      capacity: 1,
      pricePerNight: 100,
      quantity: 1,
    }];
    
    const skus = buildSkusFromRooms(minimalRooms);
    expect(skus[0]).toEqual({
      id: 'room-min',
      name: 'Minimal Room',
      quantity: 1,
      pricePerPerson: 100,
      gallery: [],
      notes: undefined,
    });
  });
});

// ============================================================================
// getPriceSource TESTS
// ============================================================================

describe('getPriceSource', () => {
  test('should return room-based pricing when hasRooms is true', () => {
    const result = getPriceSource(true, 200, mockRooms);
    
    expect(result.source).toBe('rooms');
    expect(result.hasRooms).toBe(true);
    expect(result.totalPrice).toBe(540); // (150*2) + (80*3) = 300 + 240 = 540
  });

  test('should return base pricing when hasRooms is false', () => {
    const result = getPriceSource(false, 300);
    
    expect(result.source).toBe('base');
    expect(result.hasRooms).toBe(false);
    expect(result.totalPrice).toBe(300);
  });

  test('should fallback to base pricing when hasRooms is true but no rooms provided', () => {
    const result = getPriceSource(true, 200, []);
    
    expect(result.source).toBe('base');
    expect(result.hasRooms).toBe(false);
    expect(result.totalPrice).toBe(200);
  });

  test('should handle missing basePrice', () => {
    const result = getPriceSource(false);
    
    expect(result.source).toBe('base');
    expect(result.totalPrice).toBe(0);
  });

  test('should round prices correctly', () => {
    const roomsWithDecimals: Room[] = [{
      id: 'room-decimal',
      name: 'Decimal Room',
      capacity: 1,
      pricePerNight: 99.999,
      quantity: 1,
    }];
    
    const result = getPriceSource(true, 0, roomsWithDecimals);
    expect(result.totalPrice).toBe(100); // Rounded from 99.999
  });
});

// ============================================================================
// applyDiscounts TESTS
// ============================================================================

describe('applyDiscounts', () => {
  const testDate = new Date('2025-06-15T12:00:00Z');

  test('should apply best percentage discount', () => {
    const result = applyDiscounts(100, mockDiscounts, testDate, 10);
    
    expect(result.originalPrice).toBe(100);
    // Function chooses BEST discount - $50 fixed is better than 20% ($20)
    expect(result.discountAmount).toBe(50);
    expect(result.finalPrice).toBe(50);
    expect(result.appliedDiscount?.id).toBe('discount-2');
    expect(result.discountDescription).toBe('$50 off');
  });

  test('should apply fixed amount discount', () => {
    const fixedDiscount: Discount[] = [{
      id: 'fixed-only',
      title: '$30 Off',
      type: 'fixed',
      value: 30,
      active: true,
    }];
    
    const result = applyDiscounts(100, fixedDiscount, testDate);
    
    expect(result.discountAmount).toBe(30);
    expect(result.finalPrice).toBe(70);
    expect(result.discountDescription).toBe('$30 off');
  });

  test('should choose best discount when multiple are valid', () => {
    const competingDiscounts: Discount[] = [
      {
        id: 'small-percent',
        title: '10% Off',
        type: 'percentage',
        value: 10,
        active: true,
      },
      {
        id: 'big-fixed',
        title: '$30 Off',
        type: 'fixed', 
        value: 30,
        active: true,
      },
    ];
    
    const result = applyDiscounts(100, competingDiscounts, testDate);
    
    // $30 fixed is better than 10% ($10)
    expect(result.discountAmount).toBe(30);
    expect(result.appliedDiscount?.id).toBe('big-fixed');
  });

  test('should ignore expired discounts', () => {
    const expiredOnly: Discount[] = [mockDiscounts[3]]; // Expired discount
    
    const result = applyDiscounts(100, expiredOnly, testDate);
    
    expect(result.discountAmount).toBe(0);
    expect(result.finalPrice).toBe(100);
    expect(result.appliedDiscount).toBeUndefined();
  });

  test('should ignore inactive discounts', () => {
    const inactiveOnly: Discount[] = [mockDiscounts[4]]; // Inactive discount
    
    const result = applyDiscounts(100, inactiveOnly, testDate);
    
    expect(result.discountAmount).toBe(0);
    expect(result.finalPrice).toBe(100);
  });

  test('should respect capacity caps', () => {
    const capacityDiscount: Discount[] = [mockDiscounts[2]]; // 15% with cap of 5
    
    // With capacity left > 5, discount should not apply
    const resultOverCap = applyDiscounts(100, capacityDiscount, testDate, 6);
    expect(resultOverCap.discountAmount).toBe(0);
    
    // With capacity left <= 5, discount should apply
    const resultUnderCap = applyDiscounts(100, capacityDiscount, testDate, 3);
    expect(resultUnderCap.discountAmount).toBe(15);
  });

  test('should handle SKU-specific discounts', () => {
    const skuDiscounts: Discount[] = [mockDiscounts[5]]; // 10% for room-1
    
    // Should apply for matching SKU
    const resultMatch = applyDiscounts(100, skuDiscounts, testDate, Infinity, 'room-1');
    expect(resultMatch.discountAmount).toBe(10);
    
    // Should not apply for different SKU
    const resultNoMatch = applyDiscounts(100, skuDiscounts, testDate, Infinity, 'room-2');
    expect(resultNoMatch.discountAmount).toBe(0);
  });

  test('should not allow discount to exceed price', () => {
    const largeFixedDiscount: Discount[] = [{
      id: 'too-large',
      title: '$200 Off',
      type: 'fixed',
      value: 200,
      active: true,
    }];
    
    const result = applyDiscounts(50, largeFixedDiscount, testDate);
    
    expect(result.discountAmount).toBe(50); // Capped at price
    expect(result.finalPrice).toBe(0);
  });

  test('should handle edge cases', () => {
    // Zero price
    expect(applyDiscounts(0, mockDiscounts, testDate).finalPrice).toBe(0);
    
    // Negative price
    expect(applyDiscounts(-10, mockDiscounts, testDate).finalPrice).toBe(-10);
    
    // Empty discounts
    expect(applyDiscounts(100, [], testDate).discountAmount).toBe(0);
    
    // Null discounts
    expect(applyDiscounts(100, null as any, testDate).discountAmount).toBe(0);
  });
});

// ============================================================================
// formatPriceByCurrency TESTS
// ============================================================================

describe('formatPriceByCurrency', () => {
  test('should format USD correctly', () => {
    expect(formatPriceByCurrency(1234.56, 'usd')).toBe('$1,234.56');
    expect(formatPriceByCurrency(0, 'usd')).toBe('$0.00');
    expect(formatPriceByCurrency(5, 'usd')).toBe('$5.00');
  });

  test('should format EUR correctly', () => {
    expect(formatPriceByCurrency(1234.56, 'eur')).toBe('1,234.56 €');
    expect(formatPriceByCurrency(0, 'eur')).toBe('0.00 €');
  });

  test('should format JPY correctly (no decimals)', () => {
    expect(formatPriceByCurrency(1234.56, 'jpy')).toBe('¥1,235'); // Rounded
    expect(formatPriceByCurrency(1000, 'jpy')).toBe('¥1,000');
  });

  test('should format GBP correctly', () => {
    expect(formatPriceByCurrency(1234.56, 'gbp')).toBe('£1,234.56');
  });

  test('should handle Scandinavian currencies', () => {
    expect(formatPriceByCurrency(1234.56, 'sek')).toBe('1,234.56 kr');
    expect(formatPriceByCurrency(1234.56, 'nok')).toBe('1,234.56 kr');
    expect(formatPriceByCurrency(1234.56, 'dkk')).toBe('1,234.56 kr');
  });

  test('should handle thousands separators', () => {
    expect(formatPriceByCurrency(1234567.89, 'usd')).toBe('$1,234,567.89');
    expect(formatPriceByCurrency(1000000, 'jpy')).toBe('¥1,000,000');
  });

  test('should handle invalid inputs', () => {
    expect(formatPriceByCurrency(NaN, 'usd')).toBe('$0.00');
    expect(formatPriceByCurrency(Infinity, 'usd')).toBe('$0.00');
    expect(formatPriceByCurrency('invalid' as any, 'usd')).toBe('$0.00');
  });

  test('should fallback to USD for unsupported currency', () => {
    expect(formatPriceByCurrency(100, 'xyz' as SupportedCurrency)).toBe('$100.00');
  });

  test('should use USD as default currency', () => {
    expect(formatPriceByCurrency(100)).toBe('$100.00');
  });

  test('should round to appropriate decimal places', () => {
    expect(formatPriceByCurrency(99.999, 'usd')).toBe('$100.00');
    expect(formatPriceByCurrency(99.999, 'jpy')).toBe('¥100');
    expect(formatPriceByCurrency(99.004, 'usd')).toBe('$99.00');
  });
});

// ============================================================================
// computeRevenueSplit TESTS
// ============================================================================

describe('computeRevenueSplit', () => {
  test('should compute standard revenue split correctly', () => {
    const result = computeRevenueSplit(1000, 85, 15);
    
    expect(result.creatorAmount).toBe(850);
    expect(result.platformAmount).toBe(150);
    expect(result.creatorPct).toBe(85);
    expect(result.platformPct).toBe(15);
  });

  test('should handle decimal amounts with proper rounding', () => {
    const result = computeRevenueSplit(99.99, 85.5, 14.5);
    
    expect(result.creatorAmount).toBe(85.49); // 99.99 * 0.855 = 85.49145
    expect(result.platformAmount).toBe(14.50); // 99.99 * 0.145 = 14.49855
  });

  test('should normalize percentages when they exceed 100%', () => {
    const result = computeRevenueSplit(1000, 90, 30); // Total 120%
    
    // Should normalize to 75% and 25% (90/120 and 30/120)
    expect(result.creatorPct).toBe(75);
    expect(result.platformPct).toBe(25);
    expect(result.creatorAmount).toBe(750);
    expect(result.platformAmount).toBe(250);
  });

  test('should handle zero amount', () => {
    const result = computeRevenueSplit(0, 85, 15);
    
    expect(result.creatorAmount).toBe(0);
    expect(result.platformAmount).toBe(0);
    expect(result.creatorPct).toBe(85);
    expect(result.platformPct).toBe(15);
  });

  test('should handle negative amounts', () => {
    const result = computeRevenueSplit(-100, 85, 15);
    
    expect(result.creatorAmount).toBe(0); // Should clamp to 0
    expect(result.platformAmount).toBe(0);
  });

  test('should handle invalid percentage inputs', () => {
    // Negative percentages
    const result1 = computeRevenueSplit(1000, -10, 15);
    expect(result1.creatorPct).toBe(0);
    
    // Non-numeric percentages
    const result2 = computeRevenueSplit(1000, 'invalid' as any, 15);
    expect(result2.creatorPct).toBe(0);
    
    // NaN amounts
    const result3 = computeRevenueSplit(NaN, 85, 15);
    expect(result3.creatorAmount).toBe(0);
  });

  test('should handle very small amounts', () => {
    const result = computeRevenueSplit(0.01, 85, 15);
    
    expect(result.creatorAmount).toBe(0.01); // 0.01 * 0.85 = 0.0085, rounded to 0.01
    expect(result.platformAmount).toBe(0.00); // 0.01 * 0.15 = 0.0015, rounded to 0.00
  });
});

// ============================================================================
// computeMVGProgress TESTS
// ============================================================================

describe('computeMVGProgress', () => {
  test('should compute MVG progress correctly', () => {
    const result = computeMVGProgress(4, 10);
    
    expect(result.current).toBe(4);
    expect(result.minimum).toBe(10);
    expect(result.percentage).toBe(40);
    expect(result.isMet).toBe(false);
  });

  test('should handle MVG being met', () => {
    const result = computeMVGProgress(12, 10);
    
    expect(result.current).toBe(12);
    expect(result.minimum).toBe(10);
    expect(result.percentage).toBe(100); // Capped at 100%
    expect(result.isMet).toBe(true);
  });

  test('should handle exactly meeting MVG', () => {
    const result = computeMVGProgress(10, 10);
    
    expect(result.percentage).toBe(100);
    expect(result.isMet).toBe(true);
  });

  test('should handle zero current bookings', () => {
    const result = computeMVGProgress(0, 5);
    
    expect(result.percentage).toBe(0);
    expect(result.isMet).toBe(false);
  });

  test('should handle edge cases with invalid inputs', () => {
    // Negative current bookings
    const result1 = computeMVGProgress(-5, 10);
    expect(result1.current).toBe(0);
    expect(result1.percentage).toBe(0);
    
    // Zero minimum (avoid division by zero)
    const result2 = computeMVGProgress(5, 0);
    expect(result2.minimum).toBe(1); // Should default to 1
    expect(result2.percentage).toBe(100); // 5/1 * 100 = 500, capped at 100
    
    // Negative minimum
    const result3 = computeMVGProgress(5, -10);
    expect(result3.minimum).toBe(1);
    
    // Non-numeric inputs
    const result4 = computeMVGProgress('invalid' as any, 10);
    expect(result4.current).toBe(0);
  });

  test('should round percentage correctly', () => {
    const result = computeMVGProgress(1, 3); // 33.333...%
    
    expect(result.percentage).toBe(33.33);
  });

  test('should handle very large numbers', () => {
    const result = computeMVGProgress(1000000, 999999);
    
    expect(result.percentage).toBe(100); // Should cap at 100%
    expect(result.isMet).toBe(true);
  });
});

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('Helper Functions', () => {
  describe('normalizeCurrency', () => {
    test('should normalize valid currencies', () => {
      expect(normalizeCurrency('USD')).toBe('usd');
      expect(normalizeCurrency('eur')).toBe('eur');
      expect(normalizeCurrency('GBP')).toBe('gbp');
    });

    test('should fallback to USD for invalid currencies', () => {
      expect(normalizeCurrency('invalid')).toBe('usd');
      expect(normalizeCurrency('')).toBe('usd');
      expect(normalizeCurrency(null as any)).toBe('usd');
      expect(normalizeCurrency(undefined)).toBe('usd');
    });
  });

  describe('calculateTotalFromSkus', () => {
    test('should calculate total from SKUs', () => {
      const skus: SKU[] = [
        { id: '1', name: 'SKU 1', quantity: 2, pricePerPerson: 50 },
        { id: '2', name: 'SKU 2', quantity: 1, pricePerPerson: 100 },
      ];
      
      expect(calculateTotalFromSkus(skus)).toBe(200); // (2*50) + (1*100) = 200
    });

    test('should handle empty arrays', () => {
      expect(calculateTotalFromSkus([])).toBe(0);
      expect(calculateTotalFromSkus(null as any)).toBe(0);
    });

    test('should round results correctly', () => {
      const skus: SKU[] = [
        { id: '1', name: 'SKU 1', quantity: 1, pricePerPerson: 33.333 },
      ];
      
      expect(calculateTotalFromSkus(skus)).toBe(33.33);
    });
  });

  describe('isDiscountValid', () => {
    const testDate = new Date('2025-06-15T12:00:00Z');

    test('should validate active discount without expiry', () => {
      const discount: Discount = {
        id: '1',
        title: 'Test',
        type: 'percentage',
        value: 10,
        active: true,
      };
      
      expect(isDiscountValid(discount, testDate)).toBe(true);
    });

    test('should invalidate inactive discount', () => {
      const discount: Discount = {
        id: '1',
        title: 'Test',
        type: 'percentage',
        value: 10,
        active: false,
      };
      
      expect(isDiscountValid(discount, testDate)).toBe(false);
    });

    test('should invalidate expired discount', () => {
      const discount: Discount = {
        id: '1',
        title: 'Test',
        type: 'percentage',
        value: 10,
        active: true,
        validUntil: '2020-01-01T00:00:00Z',
      };
      
      expect(isDiscountValid(discount, testDate)).toBe(false);
    });

    test('should validate discount within capacity cap', () => {
      const discount: Discount = {
        id: '1',
        title: 'Test',
        type: 'percentage',
        value: 10,
        active: true,
        capacityCap: 5,
      };
      
      expect(isDiscountValid(discount, testDate, 3)).toBe(true);
      expect(isDiscountValid(discount, testDate, 6)).toBe(false);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration Tests', () => {
  test('should work together for complete pricing flow', () => {
    // 1. Build SKUs from rooms
    const skus = buildSkusFromRooms(mockRooms);
    expect(skus).toHaveLength(2);
    
    // 2. Get price source (room-based)
    const priceSource = getPriceSource(true, 0, mockRooms);
    expect(priceSource.source).toBe('rooms');
    expect(priceSource.totalPrice).toBe(540);
    
    // 3. Apply discounts
    const discountResult = applyDiscounts(
      priceSource.totalPrice, 
      mockDiscounts, 
      new Date('2025-06-15T12:00:00Z'),
      10
    );
    expect(discountResult.finalPrice).toBe(432); // 540 - 20% = 432
    
    // 4. Format final price
    const formattedPrice = formatPriceByCurrency(discountResult.finalPrice, 'usd');
    expect(formattedPrice).toBe('$432.00');
    
    // 5. Compute revenue split
    const revenueSplit = computeRevenueSplit(discountResult.finalPrice, 85, 15);
    expect(revenueSplit.creatorAmount).toBe(367.2); // 432 * 0.85
    expect(revenueSplit.platformAmount).toBe(64.8); // 432 * 0.15
    
    // 6. Compute MVG progress
    const mvgProgress = computeMVGProgress(4, 8);
    expect(mvgProgress.percentage).toBe(50);
    expect(mvgProgress.isMet).toBe(false);
  });
});