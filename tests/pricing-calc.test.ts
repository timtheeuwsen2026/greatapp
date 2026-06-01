/**
 * Pricing Calculation Unit Tests
 * 
 * Tests for revenue breakdown calculations across all monetization models:
 * - Experience Facilitator Model (additive commission structure)
 * - Network Influencer Model (configurable revenue share)
 * - Custom Model (flexible platform fee)
 * 
 * Verifies:
 * - Stripe fee calculations (2.9% + $0.30)
 * - Promoter commission handling
 * - Revenue splits between creator and platform
 * - Edge cases and validation
 */

import { describe, it, expect } from 'vitest';
import { calculateRevenueBreakdown } from '@shared/pricingService';

describe('Pricing Calculations - Revenue Breakdown', () => {
  describe('Stripe Fee Calculation', () => {
    it('should calculate Stripe fees correctly (2.9% + $0.30)', () => {
      const result = calculateRevenueBreakdown(1000, 'custom', {
        customPlatformFee: 20,
      });

      // Stripe fees: (1000 * 0.029) + 0.30 = 29 + 0.30 = 29.30
      expect(result.stripeFees).toBe(29.30);
      expect(result.netRevenue).toBe(970.70); // 1000 - 29.30
    });

    it('should calculate Stripe fees for small amounts', () => {
      const result = calculateRevenueBreakdown(10, 'custom', {
        customPlatformFee: 20,
      });

      // Stripe fees: (10 * 0.029) + 0.30 = 0.29 + 0.30 = 0.59
      expect(result.stripeFees).toBe(0.59);
      expect(result.netRevenue).toBe(9.41); // 10 - 0.59
    });

    it('should calculate Stripe fees for large amounts', () => {
      const result = calculateRevenueBreakdown(10000, 'custom', {
        customPlatformFee: 20,
      });

      // Stripe fees: (10000 * 0.029) + 0.30 = 290 + 0.30 = 290.30
      expect(result.stripeFees).toBe(290.30);
      expect(result.netRevenue).toBe(9709.70); // 10000 - 290.30
    });
  });

  describe('Experience Facilitator Model', () => {
    it('should apply base commission only (20%)', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: [],
        facilitatorBaseCommission: 20,
      });

      // Net after Stripe: 970.70
      // Platform fee: 970.70 * 0.20 = 194.14
      // Creator payout: 970.70 - 194.14 = 776.56
      expect(result.stripeFees).toBe(29.30);
      expect(result.netRevenue).toBe(970.70);
      expect(result.platformFeePercentage).toBe(20);
      expect(result.platformFee).toBe(194.14);
      expect(result.creatorPayout).toBe(776.56);
    });

    it('should add Enhanced Support service (+6%)', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: ['enhanced_support'],
        facilitatorBaseCommission: 20,
      });

      // Net after Stripe: 970.70
      // Platform fee: 970.70 * 0.26 = 252.38 (20% + 6%)
      // Creator payout: 970.70 - 252.38 = 718.32
      expect(result.platformFeePercentage).toBe(26);
      expect(result.platformFee).toBe(252.38);
      expect(result.creatorPayout).toBe(718.32);
    });

    it('should add Full Service (+8%)', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: ['full_service'],
        facilitatorBaseCommission: 20,
      });

      // Platform fee: 970.70 * 0.28 = 271.80 (20% + 8%)
      expect(result.platformFeePercentage).toBe(28);
      expect(result.platformFee).toBe(271.80);
      expect(result.creatorPayout).toBe(698.90);
    });

    it('should add Marketing service (+5%)', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: ['marketing'],
        facilitatorBaseCommission: 20,
      });

      // Platform fee: 970.70 * 0.25 = 242.68 (20% + 5%)
      expect(result.platformFeePercentage).toBe(25);
      expect(result.platformFee).toBe(242.68);
    });

    it('should add Logistics service (+3%)', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: ['logistics'],
        facilitatorBaseCommission: 20,
      });

      // Platform fee: 970.70 * 0.23 = 223.26 (20% + 3%)
      expect(result.platformFeePercentage).toBe(23);
      expect(result.platformFee).toBe(223.26);
    });

    it('should add multiple services cumulatively', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: ['enhanced_support', 'marketing', 'logistics'],
        facilitatorBaseCommission: 20,
      });

      // 20% + 6% + 5% + 3% = 34%
      // Platform fee: 970.70 * 0.34 = 330.04
      expect(result.platformFeePercentage).toBe(34);
      expect(result.platformFee).toBe(330.04);
      expect(result.creatorPayout).toBe(640.66);
    });

    it('should cap commission at 34% even with all services', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: ['enhanced_support', 'full_service', 'marketing', 'logistics'],
        facilitatorBaseCommission: 20,
      });

      // 20% + 6% + 8% + 5% + 3% = 42%, but capped at 34%
      expect(result.platformFeePercentage).toBe(34);
      expect(result.platformFee).toBe(330.04);
    });

    it('should use default base commission if not provided', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: [],
      });

      // Default base commission is 20%
      expect(result.platformFeePercentage).toBe(20);
    });
  });

  describe('Network Influencer Model', () => {
    it('should apply default revenue share (25% to creator)', () => {
      const result = calculateRevenueBreakdown(1000, 'influencer', {});

      // Net after Stripe: 970.70
      // Creator gets 25%: 970.70 * 0.25 = 242.68
      // Platform gets rest: 970.70 - 242.68 = 728.02 (75%)
      expect(result.creatorPayout).toBe(242.68);
      expect(result.platformFee).toBe(728.02);
      expect(result.platformFeePercentage).toBe(75);
    });

    it('should apply custom revenue share (40% to creator)', () => {
      const result = calculateRevenueBreakdown(1000, 'influencer', {
        influencerRevShare: 40,
      });

      // Net after Stripe: 970.70
      // Creator gets 40%: 970.70 * 0.40 = 388.28
      // Platform gets rest: 970.70 - 388.28 = 582.42 (60%)
      expect(result.creatorPayout).toBe(388.28);
      expect(result.platformFee).toBe(582.42);
      expect(result.platformFeePercentage).toBe(60);
    });

    it('should handle high revenue share (80% to creator)', () => {
      const result = calculateRevenueBreakdown(1000, 'influencer', {
        influencerRevShare: 80,
      });

      // Creator gets 80%: 970.70 * 0.80 = 776.56
      // Platform gets 20%: 970.70 - 776.56 = 194.14
      expect(result.creatorPayout).toBe(776.56);
      expect(result.platformFee).toBe(194.14);
      expect(result.platformFeePercentage).toBe(20);
    });

    it('should handle low revenue share (10% to creator)', () => {
      const result = calculateRevenueBreakdown(1000, 'influencer', {
        influencerRevShare: 10,
      });

      // Creator gets 10%: 970.70 * 0.10 = 97.07
      // Platform gets 90%: 970.70 - 97.07 = 873.63
      expect(result.creatorPayout).toBe(97.07);
      expect(result.platformFee).toBe(873.63);
      expect(result.platformFeePercentage).toBe(90);
    });
  });

  describe('Custom Model', () => {
    it('should apply custom platform fee (15%)', () => {
      const result = calculateRevenueBreakdown(1000, 'custom', {
        customPlatformFee: 15,
      });

      // Net after Stripe: 970.70
      // Platform fee: 970.70 * 0.15 = 145.60 (rounded)
      // Creator payout: 970.70 - 145.60 = 825.10
      expect(result.platformFeePercentage).toBe(15);
      expect(result.platformFee).toBe(145.60);
      expect(result.creatorPayout).toBe(825.10);
    });

    it('should apply custom platform fee (30%)', () => {
      const result = calculateRevenueBreakdown(1000, 'custom', {
        customPlatformFee: 30,
      });

      // Platform fee: 970.70 * 0.30 = 291.21
      expect(result.platformFeePercentage).toBe(30);
      expect(result.platformFee).toBe(291.21);
      expect(result.creatorPayout).toBe(679.49);
    });

    it('should use default 20% if not provided', () => {
      const result = calculateRevenueBreakdown(1000, 'custom', {});

      expect(result.platformFeePercentage).toBe(20);
      expect(result.platformFee).toBe(194.14);
    });
  });

  describe('Promoter Commission', () => {
    it('should deduct promoter commission from net revenue', () => {
      const result = calculateRevenueBreakdown(1000, 'custom', {
        customPlatformFee: 20,
        promoterCommission: 10, // 10% promoter commission
      });

      // Gross: 1000
      // Stripe fees: 29.30
      // Net: 970.70
      // Promoter commission (gross): 1000 * 0.10 = 100
      // Promoter share of Stripe fees: (100/1000) * 29.30 = 2.93
      // Promoter net commission: 100 - 2.93 = 97.07
      // Revenue for split: 970.70 - 97.07 = 873.63
      // Platform fee (20%): 873.63 * 0.20 = 174.73
      // Creator payout: 873.63 - 174.73 = 698.90

      expect(result.promoterCommission).toBe(97.07);
      expect(result.revenueForSplit).toBe(873.63);
      expect(result.platformFee).toBe(174.73);
      expect(result.creatorPayout).toBe(698.90);
    });

    it('should handle 0% promoter commission', () => {
      const result = calculateRevenueBreakdown(1000, 'custom', {
        customPlatformFee: 20,
        promoterCommission: 0,
      });

      expect(result.promoterCommission).toBe(0);
      expect(result.revenueForSplit).toBe(970.70); // Same as net revenue
    });

    it('should handle high promoter commission (25%)', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: [],
        facilitatorBaseCommission: 20,
        promoterCommission: 25,
      });

      // Promoter commission (gross): 1000 * 0.25 = 250
      // Promoter share of Stripe fees: (250/1000) * 29.30 = 7.33
      // Promoter net: 250 - 7.33 = 242.68
      // Revenue for split: 970.70 - 242.68 = 728.03 (rounding)
      // Platform fee (20%): 728.03 * 0.20 = 145.61
      // Creator: 728.03 - 145.61 = 582.42

      expect(result.promoterCommission).toBe(242.68);
      expect(result.revenueForSplit).toBe(728.03);
      expect(result.platformFee).toBe(145.61);
      expect(result.creatorPayout).toBe(582.42);
    });

    it('should work with influencer model + promoter commission', () => {
      const result = calculateRevenueBreakdown(1000, 'influencer', {
        influencerRevShare: 30,
        promoterCommission: 15,
      });

      // Promoter commission (gross): 1000 * 0.15 = 150
      // Promoter share of Stripe fees: (150/1000) * 29.30 = 4.40
      // Promoter net: 150 - 4.40 = 145.60
      // Revenue for split: 970.70 - 145.60 = 825.10
      // Creator (30%): 825.10 * 0.30 = 247.53
      // Platform (70%): 825.10 - 247.53 = 577.57

      expect(result.promoterCommission).toBe(145.60);
      expect(result.creatorPayout).toBe(247.53);
      expect(result.platformFee).toBe(577.57);
    });
  });

  describe('Edge Cases and Validation', () => {
    it('should handle zero gross amount', () => {
      const result = calculateRevenueBreakdown(0, 'custom', {
        customPlatformFee: 20,
      });

      expect(result.grossRevenue).toBe(0);
      expect(result.stripeFees).toBe(0.30); // Minimum Stripe fee
      expect(result.netRevenue).toBe(-0.30); // Goes negative due to fixed fee
      expect(result.creatorPayout).toBeLessThan(0);
    });

    it('should handle negative amounts (treated as zero)', () => {
      const result = calculateRevenueBreakdown(-100, 'custom', {
        customPlatformFee: 20,
      });

      expect(result.grossRevenue).toBe(0);
      expect(result.stripeFees).toBe(0.30);
    });

    it('should handle very large amounts', () => {
      const result = calculateRevenueBreakdown(1000000, 'facilitator', {
        facilitatorServices: ['enhanced_support', 'marketing'],
        facilitatorBaseCommission: 20,
      });

      // Stripe fees: (1000000 * 0.029) + 0.30 = 29000.30
      // Net: 970999.70
      // Platform (31%): 970999.70 * 0.31 = 301009.91
      // Creator: 669989.79

      expect(result.stripeFees).toBe(29000.30);
      expect(result.netRevenue).toBe(970999.70);
      expect(result.platformFeePercentage).toBe(31); // 20% + 6% + 5%
      expect(result.platformFee).toBe(301009.91);
      expect(result.creatorPayout).toBe(669989.79);
    });

    it('should handle decimal amounts correctly', () => {
      const result = calculateRevenueBreakdown(99.99, 'custom', {
        customPlatformFee: 20,
      });

      // Stripe fees: (99.99 * 0.029) + 0.30 = 2.90 + 0.30 = 3.20
      // Net: 96.79
      // Platform (20%): 19.36
      // Creator: 77.43

      expect(result.grossRevenue).toBe(99.99);
      expect(result.stripeFees).toBe(3.20);
      expect(result.netRevenue).toBe(96.79);
      expect(result.platformFee).toBe(19.36);
      expect(result.creatorPayout).toBe(77.43);
    });

    it('should round all amounts to 2 decimal places', () => {
      const result = calculateRevenueBreakdown(1234.567, 'custom', {
        customPlatformFee: 17.333,
      });

      // All results should be rounded to at most 2 decimals
      expect(Number.isFinite(result.grossRevenue)).toBe(true);
      expect(Number.isFinite(result.stripeFees)).toBe(true);
      expect(Number.isFinite(result.netRevenue)).toBe(true);
      expect(Number.isFinite(result.platformFee)).toBe(true);
      expect(Number.isFinite(result.creatorPayout)).toBe(true);
      
      // Check precision (at most 2 decimal places)
      expect(result.grossRevenue).toBe(parseFloat(result.grossRevenue.toFixed(2)));
      expect(result.stripeFees).toBe(parseFloat(result.stripeFees.toFixed(2)));
      expect(result.netRevenue).toBe(parseFloat(result.netRevenue.toFixed(2)));
    });

    it('should handle invalid input types gracefully', () => {
      const result = calculateRevenueBreakdown(NaN, 'custom', {
        customPlatformFee: 20,
      });

      // NaN input gets treated as 0 in validation
      expect(result.grossRevenue).toBe(0);
      expect(result.stripeFees).toBe(0.30); // Fixed Stripe fee
      expect(result.netRevenue).toBe(-0.30); // Negative due to fixed fee on zero revenue
    });
  });

  describe('Complete Pricing Flow Examples', () => {
    it('Example 1: $500 retreat with facilitator model + enhanced support', () => {
      const result = calculateRevenueBreakdown(500, 'facilitator', {
        facilitatorServices: ['enhanced_support'],
        facilitatorBaseCommission: 20,
      });

      // Expected flow:
      // Gross: $500.00
      // Stripe: $14.80 (2.9% + $0.30)
      // Net: $485.20
      // Platform (26%): $126.15
      // Creator: $359.05

      expect(result.grossRevenue).toBe(500);
      expect(result.stripeFees).toBe(14.80);
      expect(result.netRevenue).toBe(485.20);
      expect(result.platformFeePercentage).toBe(26);
      expect(result.platformFee).toBe(126.15);
      expect(result.creatorPayout).toBe(359.05);
    });

    it('Example 2: $2000 experience with influencer (40% share) + 10% promoter', () => {
      const result = calculateRevenueBreakdown(2000, 'influencer', {
        influencerRevShare: 40,
        promoterCommission: 10,
      });

      // Expected flow:
      // Gross: $2000.00
      // Stripe: $58.30
      // Net: $1941.70
      // Promoter: $194.17 (10% of gross minus their share of Stripe fees)
      // Revenue for split: $1747.53
      // Creator (40%): $699.01
      // Platform (60%): $1048.52

      expect(result.grossRevenue).toBe(2000);
      expect(result.stripeFees).toBe(58.30);
      expect(result.netRevenue).toBe(1941.70);
      expect(result.promoterCommission).toBe(194.17);
      expect(result.revenueForSplit).toBe(1747.53);
      expect(result.creatorPayout).toBe(699.01);
      expect(result.platformFee).toBe(1048.52);
    });

    it('Example 3: $1500 workation with all facilitator services (capped at 34%)', () => {
      const result = calculateRevenueBreakdown(1500, 'facilitator', {
        facilitatorServices: ['enhanced_support', 'full_service', 'marketing', 'logistics'],
        facilitatorBaseCommission: 20,
      });

      // Expected flow:
      // Gross: $1500.00
      // Stripe: $43.80
      // Net: $1456.20
      // Platform (34% capped): $495.11
      // Creator: $961.09

      expect(result.grossRevenue).toBe(1500);
      expect(result.stripeFees).toBe(43.80);
      expect(result.netRevenue).toBe(1456.20);
      expect(result.platformFeePercentage).toBe(34);
      expect(result.platformFee).toBe(495.11);
      expect(result.creatorPayout).toBe(961.09);
    });

    it('Example 4: $50 small booking with custom 15% fee', () => {
      const result = calculateRevenueBreakdown(50, 'custom', {
        customPlatformFee: 15,
      });

      // Expected flow:
      // Gross: $50.00
      // Stripe: $1.76
      // Net: $48.24
      // Platform (15%): $7.24
      // Creator: $41.00

      expect(result.grossRevenue).toBe(50);
      expect(result.stripeFees).toBe(1.75); // (50 * 0.029) + 0.30 = 1.75
      expect(result.netRevenue).toBe(48.25);
      expect(result.platformFeePercentage).toBe(15);
      expect(result.platformFee).toBe(7.24);
      expect(result.creatorPayout).toBe(41.01);
    });
  });

  describe('Revenue Consistency', () => {
    it('should ensure total breakdown equals gross revenue', () => {
      const result = calculateRevenueBreakdown(1000, 'facilitator', {
        facilitatorServices: ['marketing'],
        facilitatorBaseCommission: 20,
        promoterCommission: 10,
      });

      // Gross = Stripe + Net
      expect(result.grossRevenue).toBe(
        result.stripeFees + result.netRevenue
      );

      // Net = Promoter + Revenue for split
      expect(result.netRevenue).toBe(
        result.promoterCommission + result.revenueForSplit
      );

      // Revenue for split = Platform fee + Creator payout
      expect(result.revenueForSplit).toBe(
        result.platformFee + result.creatorPayout
      );
    });

    it('should maintain consistency across all models', () => {
      const models: Array<'facilitator' | 'influencer' | 'custom'> = [
        'facilitator',
        'influencer',
        'custom',
      ];

      models.forEach((model) => {
        const result = calculateRevenueBreakdown(1000, model, {
          facilitatorServices: ['marketing'],
          influencerRevShare: 30,
          customPlatformFee: 25,
        });

        // All revenue components should sum correctly
        const totalAccounted =
          result.stripeFees +
          result.promoterCommission +
          result.platformFee +
          result.creatorPayout;

        expect(totalAccounted).toBeCloseTo(result.grossRevenue, 1);
      });
    });
  });
});
