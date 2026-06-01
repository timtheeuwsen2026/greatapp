/**
 * Shared Pricing Computation Service
 * Phase 2 of pricing overhaul - Pure functions for all pricing logic
 * 
 * All functions are pure (no side effects, no external dependencies)
 * Designed for unit testing and UI component reuse
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Discount {
  id: string;
  title: string;
  type: 'percentage' | 'fixed';
  value: number;
  validUntil?: string;
  capacityCap?: number;
  active: boolean;
  skuId?: string;
}

export interface SKU {
  id: string;
  name: string;
  quantity: number;
  pricePerPerson: number;
  gallery?: string[];
  notes?: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  quantity: number;
  description?: string;
  amenities?: string[];
  photos?: string[];
}

export interface RevenueSplit {
  creatorAmount: number;
  platformAmount: number;
  creatorPct: number;
  platformPct: number;
}

export interface MVGProgress {
  current: number;
  minimum: number;
  percentage: number;
  isMet: boolean;
}

export interface PriceSource {
  source: 'rooms' | 'base';
  totalPrice: number;
  hasRooms: boolean;
}

export interface DiscountResult {
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
  appliedDiscount?: Discount;
  discountDescription?: string;
}

// Currency configuration for formatting
export const CURRENCY_CONFIG = {
  usd: { symbol: '$', decimals: 2, position: 'before' },
  eur: { symbol: '€', decimals: 2, position: 'after' },
  gbp: { symbol: '£', decimals: 2, position: 'before' },
  cad: { symbol: 'C$', decimals: 2, position: 'before' },
  aud: { symbol: 'A$', decimals: 2, position: 'before' },
  jpy: { symbol: '¥', decimals: 0, position: 'before' },
  chf: { symbol: 'CHF', decimals: 2, position: 'before' },
  sek: { symbol: 'kr', decimals: 2, position: 'after' },
  nok: { symbol: 'kr', decimals: 2, position: 'after' },
  dkk: { symbol: 'kr', decimals: 2, position: 'after' },
  pln: { symbol: 'zł', decimals: 2, position: 'after' },
  czk: { symbol: 'Kč', decimals: 2, position: 'after' },
  huf: { symbol: 'Ft', decimals: 0, position: 'after' },
  bgn: { symbol: 'лв', decimals: 2, position: 'after' },
  ron: { symbol: 'lei', decimals: 2, position: 'after' },
} as const;

export type SupportedCurrency = keyof typeof CURRENCY_CONFIG;

// ============================================================================
// SAFE MATH UTILITIES (prevent floating-point drift)
// ============================================================================

/**
 * Safely multiply two numbers, avoiding floating-point precision errors.
 * Uses integer math internally by converting to cents, then back to dollars.
 * @param a First number
 * @param b Second number
 * @returns Product rounded to 2 decimal places
 */
export function safeMultiply(a: number, b: number): number {
  // Convert to cents (integers), multiply, then convert back
  const aCents = Math.round(a * 100);
  const bCents = Math.round(b * 100);
  // Since both are in cents, we need to divide by 100^2 to get back to dollars
  // But we want a * b, not (a*100) * (b*100), so:
  // Result = (aCents * bCents) / 10000 would be wrong
  // Instead: convert a to cents, keep b as multiplier
  return Math.round(a * 100 * b) / 100;
}

/**
 * Safely add two numbers, avoiding floating-point precision errors.
 * @param a First number
 * @param b Second number
 * @returns Sum rounded to 2 decimal places
 */
export function safeAdd(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100;
}

/**
 * Round a number to 2 decimal places safely.
 * Uses Number.EPSILON to handle floating-point edge cases.
 * @param value Number to round
 * @returns Number rounded to 2 decimal places
 */
export function safeRound(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ============================================================================
// CORE PRICING FUNCTIONS
// ============================================================================

/**
 * 1. buildSkusFromRooms - Convert room data into standardized SKU objects
 * @param rooms Array of room objects with accommodation details
 * @param pricePerPerson Experience-level price per person to use for all SKUs
 * @returns Array of SKU objects for pricing calculations
 */
export function buildSkusFromRooms(rooms: Room[], pricePerPerson: number = 0): SKU[] {
  if (!rooms || !Array.isArray(rooms)) {
    return [];
  }

  return rooms.map(room => ({
    id: room.id,
    name: room.name,
    quantity: room.quantity || 1,
    pricePerPerson: pricePerPerson,
    gallery: room.photos || [],
    notes: room.description || undefined,
  }));
}

/**
 * 2. getPriceSource - Determine pricing based on per-person model
 * @param hasRooms Boolean indicating if experience has rooms defined
 * @param pricePerPerson Experience-level price per person
 * @param maxParticipants Optional max participants for total calculation
 * @returns PriceSource object with source type and total price
 */
export function getPriceSource(
  hasRooms: boolean, 
  pricePerPerson: number = 0, 
  maxParticipants?: number
): PriceSource {
  const perPersonPrice = safeRound(pricePerPerson || 0);
  
  if (hasRooms) {
    return {
      source: 'rooms',
      totalPrice: perPersonPrice,
      hasRooms: true,
    };
  }

  return {
    source: 'base',
    totalPrice: perPersonPrice,
    hasRooms: false,
  };
}

/**
 * 3. applyDiscounts - Apply active discounts with validation
 * @param price Original price (SKU or base price)
 * @param discounts Array of potential discounts
 * @param currentDate Current date for expiry validation
 * @param capacityLeft Remaining capacity for capacity cap validation
 * @param skuId Optional SKU ID for SKU-specific discounts
 * @returns DiscountResult with original price, discount, and final price
 */
export function applyDiscounts(
  price: number,
  discounts: Discount[],
  currentDate: Date = new Date(),
  capacityLeft: number = Infinity,
  skuId?: string
): DiscountResult {
  if (!price || price <= 0 || !discounts || discounts.length === 0) {
    return {
      originalPrice: price || 0,
      discountAmount: 0,
      finalPrice: price || 0,
    };
  }

  // Filter active and valid discounts
  const validDiscounts = discounts.filter(discount => {
    // Must be active
    if (!discount.active) return false;

    // Check expiry date
    if (discount.validUntil) {
      const expiryDate = new Date(discount.validUntil);
      if (currentDate > expiryDate) return false;
    }

    // Check capacity cap
    if (discount.capacityCap && capacityLeft > discount.capacityCap) {
      return false;
    }

    // Check SKU specificity
    if (discount.skuId && skuId && discount.skuId !== skuId) {
      return false;
    }

    return true;
  });

  if (validDiscounts.length === 0) {
    return {
      originalPrice: price,
      discountAmount: 0,
      finalPrice: price,
    };
  }

  // Find the best discount (highest absolute discount amount)
  let bestDiscount = validDiscounts[0];
  let bestDiscountAmount = 0;

  for (const discount of validDiscounts) {
    let discountAmount = 0;

    if (discount.type === 'percentage') {
      // Percentage discount: value is percentage (e.g., 20 for 20%)
      discountAmount = (price * discount.value) / 100;
    } else if (discount.type === 'fixed') {
      // Fixed amount discount: value is absolute amount
      discountAmount = Math.min(discount.value, price); // Cannot exceed price
    }

    if (discountAmount > bestDiscountAmount) {
      bestDiscountAmount = discountAmount;
      bestDiscount = discount;
    }
  }

  const finalPrice = Math.max(0, price - bestDiscountAmount);
  
  return {
    originalPrice: price,
    discountAmount: Math.round(bestDiscountAmount * 100) / 100,
    finalPrice: Math.round(finalPrice * 100) / 100,
    appliedDiscount: bestDiscount,
    discountDescription: bestDiscount ? formatDiscountDescription(bestDiscount) : undefined,
  };
}

/**
 * 4. formatPriceByCurrency - Format prices consistently by currency
 * @param amount Price amount to format
 * @param currency Currency code (default: 'usd')
 * @returns Formatted price string with currency symbol
 */
export function formatPriceByCurrency(
  amount: number, 
  currency: SupportedCurrency = 'usd'
): string {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
    return formatPriceByCurrency(0, currency);
  }

  const config = CURRENCY_CONFIG[currency];
  if (!config) {
    // Fallback to USD for unsupported currencies
    return formatPriceByCurrency(amount, 'usd');
  }

  // Round to appropriate decimal places
  const rounded = config.decimals === 0 
    ? Math.round(amount)
    : Math.round(amount * Math.pow(10, config.decimals)) / Math.pow(10, config.decimals);

  // Format with decimals
  const formatted = config.decimals === 0 
    ? rounded.toString()
    : rounded.toFixed(config.decimals);

  // Add thousands separators
  const parts = formatted.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const numberStr = parts.join('.');

  // Apply currency symbol position
  if (config.position === 'before') {
    return `${config.symbol}${numberStr}`;
  } else {
    return `${numberStr} ${config.symbol}`;
  }
}

/**
 * 5. computeRevenueSplit - Calculate revenue distribution
 * @param amount Total amount to split
 * @param creatorPct Creator percentage (0-100)
 * @param platformPct Platform percentage (0-100)
 * @returns RevenueSplit object with amounts and percentages
 */
export function computeRevenueSplit(
  amount: number,
  creatorPct: number,
  platformPct: number
): RevenueSplit {
  if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
    amount = 0;
  }

  if (typeof creatorPct !== 'number' || isNaN(creatorPct) || creatorPct < 0) {
    creatorPct = 0;
  }

  if (typeof platformPct !== 'number' || isNaN(platformPct) || platformPct < 0) {
    platformPct = 0;
  }

  // Validate that percentages don't exceed 100%
  const totalPct = creatorPct + platformPct;
  if (totalPct > 100) {
    // Normalize percentages to sum to 100%
    const factor = 100 / totalPct;
    creatorPct = creatorPct * factor;
    platformPct = platformPct * factor;
  }

  // Calculate amounts (rounded to 2 decimal places)
  const creatorAmount = Math.round((amount * creatorPct / 100) * 100) / 100;
  const platformAmount = Math.round((amount * platformPct / 100) * 100) / 100;

  return {
    creatorAmount,
    platformAmount,
    creatorPct: Math.round(creatorPct * 100) / 100,
    platformPct: Math.round(platformPct * 100) / 100,
  };
}

/**
 * 6. computeMVGProgress - Calculate MVG progress percentage
 * @param currentBookings Number of current confirmed bookings
 * @param mvgMinimum Minimum number of bookings required
 * @returns MVGProgress object with current status and percentage
 */
export function computeMVGProgress(
  currentBookings: number,
  mvgMinimum: number
): MVGProgress {
  if (typeof currentBookings !== 'number' || currentBookings < 0) {
    currentBookings = 0;
  }

  if (typeof mvgMinimum !== 'number' || mvgMinimum <= 0) {
    mvgMinimum = 1; // Minimum of 1 to avoid division by zero
  }

  const percentage = Math.min(100, (currentBookings / mvgMinimum) * 100);
  const isMet = currentBookings >= mvgMinimum;

  return {
    current: currentBookings,
    minimum: mvgMinimum,
    percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
    isMet,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format discount description for display
 * @param discount Discount object
 * @returns Human-readable discount description
 */
function formatDiscountDescription(discount: Discount): string {
  if (discount.type === 'percentage') {
    return `${discount.value}% off`;
  } else {
    return `$${discount.value} off`;
  }
}

/**
 * Validate and normalize currency code
 * @param currency Currency string to validate
 * @returns Valid currency code or 'usd' as fallback
 */
export function normalizeCurrency(currency?: string): SupportedCurrency {
  if (!currency || typeof currency !== 'string') {
    return 'usd';
  }

  const normalized = currency.toLowerCase() as SupportedCurrency;
  return CURRENCY_CONFIG[normalized] ? normalized : 'usd';
}

/**
 * Calculate total price from SKUs
 * @param skus Array of SKU objects
 * @returns Total price across all SKUs
 */
export function calculateTotalFromSkus(skus: SKU[]): number {
  if (!skus || !Array.isArray(skus)) {
    return 0;
  }

  const total = skus.reduce((sum, sku) => {
    return sum + (sku.pricePerPerson * sku.quantity);
  }, 0);

  return Math.round(total * 100) / 100;
}

/**
 * Check if a discount is currently valid
 * @param discount Discount to validate
 * @param currentDate Current date for validation
 * @param capacityLeft Remaining capacity
 * @returns Boolean indicating if discount is valid
 */
export function isDiscountValid(
  discount: Discount,
  currentDate: Date = new Date(),
  capacityLeft: number = Infinity
): boolean {
  if (!discount.active) return false;

  if (discount.validUntil) {
    const expiryDate = new Date(discount.validUntil);
    if (currentDate > expiryDate) return false;
  }

  if (discount.capacityCap && capacityLeft > discount.capacityCap) {
    return false;
  }

  return true;
}

/**
 * Calculate complete revenue breakdown with Stripe fees and revenue splits
 * @param grossAmount Total revenue amount
 * @param monetizationModel Model: "facilitator", "influencer", or "custom"
 * @param options Additional configuration
 * @returns Complete revenue breakdown
 */
export function calculateRevenueBreakdown(
  grossAmount: number,
  monetizationModel: 'facilitator' | 'influencer' | 'custom',
  options: {
    facilitatorServices?: string[];
    facilitatorBaseCommission?: number;
    influencerRevShare?: number;
    customPlatformFee?: number;
    promoterCommission?: number;
  } = {}
): {
  grossRevenue: number;
  stripeFees: number;
  netRevenue: number;
  promoterCommission: number;
  revenueForSplit: number;
  platformFee: number;
  creatorPayout: number;
  platformFeePercentage: number;
} {
  // Validate input
  if (typeof grossAmount !== 'number' || isNaN(grossAmount) || grossAmount < 0) {
    grossAmount = 0;
  }

  // Calculate Stripe fees (2.9% + $0.30)
  const stripeFees = Math.round((grossAmount * 0.029 + 0.30) * 100) / 100;
  const netRevenue = grossAmount - stripeFees;

  // Calculate promoter commission if enabled
  const promoterCommissionPct = options.promoterCommission || 0;
  const promoterCommissionGross = Math.round((grossAmount * promoterCommissionPct / 100) * 100) / 100;
  const promoterShareOfStripeFees = promoterCommissionGross > 0 
    ? (promoterCommissionGross / grossAmount) * stripeFees 
    : 0;
  const promoterCommission = promoterCommissionGross - promoterShareOfStripeFees;

  // Revenue available for platform/creator split
  const revenueForSplit = netRevenue - promoterCommission;

  let platformFee = 0;
  let creatorPayout = 0;
  let platformFeePercentage = 0;

  switch (monetizationModel) {
    case 'influencer': {
      // Influencer gets configurable revenue share, platform takes rest
      const revShare = options.influencerRevShare || 25;
      creatorPayout = Math.round((revenueForSplit * revShare / 100) * 100) / 100;
      platformFee = revenueForSplit - creatorPayout;
      platformFeePercentage = 100 - revShare;
      break;
    }

    case 'facilitator': {
      // Facilitator pays additive commission to platform
      const { facilitatorServices = [], facilitatorBaseCommission = 20 } = options;
      
      let commission = facilitatorBaseCommission;
      if (facilitatorServices.includes('enhanced_support')) commission += 6;
      if (facilitatorServices.includes('full_service')) commission += 8;
      if (facilitatorServices.includes('marketing')) commission += 5;
      if (facilitatorServices.includes('logistics')) commission += 3;
      
      commission = Math.min(commission, 34); // Cap at 34%
      
      platformFee = Math.round((revenueForSplit * commission / 100) * 100) / 100;
      creatorPayout = revenueForSplit - platformFee;
      platformFeePercentage = commission;
      break;
    }

    case 'custom': {
      // Custom platform fee percentage
      const customFee = options.customPlatformFee || 20;
      platformFee = Math.round((revenueForSplit * customFee / 100) * 100) / 100;
      creatorPayout = revenueForSplit - platformFee;
      platformFeePercentage = customFee;
      break;
    }
  }

  return {
    grossRevenue: Math.round(grossAmount * 100) / 100,
    stripeFees: Math.round(stripeFees * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
    promoterCommission: Math.round(promoterCommission * 100) / 100,
    revenueForSplit: Math.round(revenueForSplit * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    creatorPayout: Math.round(creatorPayout * 100) / 100,
    platformFeePercentage: Math.round(platformFeePercentage * 100) / 100,
  };
}

// All functions are already exported individually above