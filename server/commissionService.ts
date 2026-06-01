import { db } from './db';
import { platformConfig, experiences, bookings } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

export interface CommissionConfig {
  mode: 'percent' | 'fixed';
  value: number;
  basis: 'per_spot' | 'per_booking';
}

export interface CommissionCalculation {
  commissionAmount: number;
  commissionCurrency: string;
  commissionStatus: 'estimated' | 'locked' | 'voided';
}

const DEFAULT_COMMISSION_CONFIG: CommissionConfig = {
  mode: 'percent',
  value: 10,
  basis: 'per_spot',
};

export async function getPlatformCommissionConfig(): Promise<CommissionConfig> {
  try {
    const result = await db
      .select()
      .from(platformConfig)
      .where(eq(platformConfig.key, 'promoter_commission'))
      .limit(1);

    if (result.length > 0 && result[0].value) {
      const config = result[0].value as any;
      return {
        mode: config.mode || DEFAULT_COMMISSION_CONFIG.mode,
        value: Number(config.value) || DEFAULT_COMMISSION_CONFIG.value,
        basis: config.basis || DEFAULT_COMMISSION_CONFIG.basis,
      };
    }

    return DEFAULT_COMMISSION_CONFIG;
  } catch (error) {
    console.error('[CommissionService] Error fetching platform config:', error);
    return DEFAULT_COMMISSION_CONFIG;
  }
}

export async function getExperienceCommissionConfig(
  experienceId: string
): Promise<CommissionConfig | null> {
  try {
    const result = await db
      .select({
        commissionMode: experiences.commissionMode,
        commissionValue: experiences.commissionValue,
        commissionBasis: experiences.commissionBasis,
      })
      .from(experiences)
      .where(eq(experiences.id, experienceId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const exp = result[0];
    
    if (!exp.commissionMode && !exp.commissionValue && !exp.commissionBasis) {
      return null;
    }

    return {
      mode: exp.commissionMode || 'percent',
      value: exp.commissionValue ? Number(exp.commissionValue) : 10,
      basis: exp.commissionBasis || 'per_spot',
    };
  } catch (error) {
    console.error('[CommissionService] Error fetching experience config:', error);
    return null;
  }
}

export async function getEffectiveCommissionConfig(
  experienceId: string
): Promise<CommissionConfig> {
  const experienceConfig = await getExperienceCommissionConfig(experienceId);
  
  if (experienceConfig) {
    console.log(`[CommissionService] Using experience-level override for ${experienceId}`);
    return experienceConfig;
  }

  console.log(`[CommissionService] Using platform defaults for ${experienceId}`);
  return getPlatformCommissionConfig();
}

export function calculateCommission(
  config: CommissionConfig,
  pricePerPerson: number,
  spotsBooked: number,
  bookingTotal: number
): number {
  let commission = 0;

  if (config.basis === 'per_spot') {
    if (config.mode === 'percent') {
      commission = spotsBooked * (pricePerPerson * (config.value / 100));
    } else {
      commission = spotsBooked * config.value;
    }
  } else {
    if (config.mode === 'percent') {
      commission = bookingTotal * (config.value / 100);
    } else {
      commission = config.value;
    }
  }

  return Math.round(commission * 100) / 100;
}

export async function calculateBookingCommission(
  experienceId: string,
  pricePerPerson: number,
  spotsBooked: number,
  bookingTotal: number,
  currency: string
): Promise<CommissionCalculation> {
  const config = await getEffectiveCommissionConfig(experienceId);
  
  const commissionAmount = calculateCommission(
    config,
    pricePerPerson,
    spotsBooked,
    bookingTotal
  );

  console.log(`[CommissionService] Calculated commission: ${commissionAmount} ${currency}`, {
    config,
    pricePerPerson,
    spotsBooked,
    bookingTotal,
  });

  return {
    commissionAmount,
    commissionCurrency: currency,
    commissionStatus: 'estimated',
  };
}

export async function updateCommissionStatus(
  bookingId: string,
  newStatus: 'locked' | 'voided'
): Promise<void> {
  try {
    await db
      .update(bookings)
      .set({ commissionStatus: newStatus })
      .where(eq(bookings.id, bookingId));

    console.log(`[CommissionService] Updated booking ${bookingId} commission status to ${newStatus}`);
  } catch (error) {
    console.error(`[CommissionService] Error updating commission status for ${bookingId}:`, error);
    throw error;
  }
}

export async function updateCommissionStatusForExperience(
  experienceId: string,
  newStatus: 'locked' | 'voided'
): Promise<number> {
  try {
    const result = await db
      .update(bookings)
      .set({ commissionStatus: newStatus })
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          isNotNull(bookings.promoterId),
          eq(bookings.commissionStatus, 'estimated')
        )
      );

    console.log(`[CommissionService] Updated commission status to ${newStatus} for experience ${experienceId}`);
    return 0;
  } catch (error) {
    console.error(`[CommissionService] Error updating commission status for experience ${experienceId}:`, error);
    throw error;
  }
}

export async function lockCommissionsForExperience(experienceId: string): Promise<void> {
  await updateCommissionStatusForExperience(experienceId, 'locked');
}

export async function voidCommissionsForExperience(experienceId: string): Promise<void> {
  await updateCommissionStatusForExperience(experienceId, 'voided');
}
