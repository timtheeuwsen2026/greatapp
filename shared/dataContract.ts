/**
 * SINGLE SOURCE OF TRUTH - DATA CONTRACT
 * 
 * This file documents the authoritative data sources for all pricing, 
 * deposit, currency, availability, and MVG data across the platform.
 * 
 * ============================================================================
 * CRITICAL RULES - ALL VIEWS MUST FOLLOW
 * ============================================================================
 * 
 * A. TICKET & PRICING DATA - Source: ticketSkus array
 *    - pricePerPerson: Read directly from ticketSkus[].pricePerPerson
 *    - depositPerPerson: Read directly from ticketSkus[].depositPerPerson (FIXED AMOUNT)
 *    - currency: Read from experience.currency (NEVER default to USD)
 *    - availability: Read from ticketSkus[].ticketCapacity - ticketSkus[].soldCount
 * 
 *    ❌ NO percentage-based deposit calculations (price * 0.2)
 *    ❌ NO currency fallback (currency || 'USD')
 *    ❌ NO room-count derived availability
 *    ❌ NO inferred or computed values
 *    ✅ Read EXACTLY what was saved in the Event Builder
 * 
 * B. EVENT CONFIGURATION DATA - Source: experience / experience_draft table
 *    - MVG (minimum participants): experience.minimumParticipants
 *    - MVG deadline: experience.mvgDeadline
 *    - Event type: experience.experienceType (one-day, multi-day, virtual)
 *    - Creator: experience.creatorId
 *    - Itinerary: experience.itinerary (JSONB array)
 * 
 * ============================================================================
 * USAGE IN VIEWS
 * ============================================================================
 * 
 * This contract applies to ALL views that display pricing/availability:
 *   - Event Detail Page (experience-details.tsx)
 *   - Homepage Cards (home.tsx, experience-card.tsx)
 *   - Creator Dashboard (creator-dashboard.tsx)
 *   - Admin Dashboard (admin-dashboard.tsx)
 *   - Checkout Page
 *   - Booking Modals
 * 
 * ============================================================================
 * HELPER FUNCTIONS
 * ============================================================================
 */

export interface TicketSku {
  ticketName: string;
  pricePerPerson: number;
  depositPerPerson: number;
  ticketCapacity: number;
  sourceRoomId: string;
  soldCount: number;
}

export interface Experience {
  id: string;
  currency: string;
  ticketSkus: TicketSku[];
  minimumParticipants: number;
  mvgDeadline: Date | string | null;
  experienceType: string;
  itinerary: any[];
}

/**
 * Get the lowest ticket price from ticketSkus
 * NEVER calculate or infer - read directly from data
 */
export function getLowestPrice(ticketSkus: TicketSku[]): number {
  if (!ticketSkus || ticketSkus.length === 0) return 0;
  return Math.min(...ticketSkus.map(sku => sku.pricePerPerson));
}

/**
 * Get deposit amount from ticketSkus
 * MUST be a fixed amount from depositPerPerson, NEVER a percentage
 */
export function getDepositAmount(ticketSkus: TicketSku[]): number {
  if (!ticketSkus || ticketSkus.length === 0) return 0;
  // All tickets should have the same deposit, but take first as canonical
  return ticketSkus[0]?.depositPerPerson || 0;
}

/**
 * Get total available spots from ticketSkus
 * Spots = ticketCapacity - soldCount (NOT room count)
 */
export function getTotalAvailableSpots(ticketSkus: TicketSku[]): number {
  if (!ticketSkus || ticketSkus.length === 0) return 0;
  return ticketSkus.reduce((total, sku) => {
    return total + (sku.ticketCapacity - (sku.soldCount || 0));
  }, 0);
}

/**
 * Get available spots for a specific ticket
 */
export function getTicketAvailability(sku: TicketSku): number {
  return sku.ticketCapacity - (sku.soldCount || 0);
}

/**
 * Check if deposits are enabled (has fixed deposit amount)
 */
export function hasDeposit(ticketSkus: TicketSku[]): boolean {
  if (!ticketSkus || ticketSkus.length === 0) return false;
  return ticketSkus.some(sku => sku.depositPerPerson > 0);
}

/**
 * Format currency with proper symbol
 * NEVER default to USD - use EUR for legacy data migration only
 */
export function formatCurrencyStrict(amount: number, currency: string): string {
  if (!currency) {
    console.warn('[DataContract] Currency is required - defaulting to EUR for legacy data migration');
    currency = 'EUR'; // Use EUR for migration, NOT USD
  }
  
  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
    'CAD': 'C$',
    'AUD': 'A$',
    'CHF': 'CHF'
  };
  
  const symbol = currencySymbols[currency.toUpperCase()] || currency;
  
  if (currency.toUpperCase() === 'JPY') {
    return `${symbol}${Math.round(amount).toLocaleString()}`;
  }
  
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
