import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { promotionDeals, promoterExperiences, discountLinks } from '@shared/schema';
import { partnerMemberDiscount } from '@shared/partnerPromotion';

/** Called inside the acceptance transaction; uses the existing booking/payout records. */
export async function connectPartnerPromotion(tx: any, row: any) {
  if (row.status !== 'confirmed' || !row.partnerUserId
      || !['commission_per_ticket', 'milestone_barter', 'member_discount'].includes(row.dealType)) return null;

  const [existing] = await tx.select().from(promoterExperiences).where(and(
    eq(promoterExperiences.experienceId, row.experienceId),
    eq(promoterExperiences.promoterId, row.partnerUserId),
    eq(promoterExperiences.referralAudience, 'official_partner'),
  ));
  if (existing?.promotionDealId && existing.promotionDealId !== row.id) {
    throw new Error('This account already has a different promotion agreement for this event. Use that existing partner entry.');
  }
  const values = {
    id: row.id, experienceId: row.experienceId, creatorId: row.organizerId,
    partnerId: row.partnerUserId, partnerEmail: row.partnerEmail, partnerName: row.partnerName,
    source: 'event_partner', dealType: row.dealType, baselineTerms: row.terms || {},
    terms: row.terms || {}, status: 'accepted', pendingActionBy: null, respondedAt: new Date(), updatedAt: new Date(),
  };
  await tx.insert(promotionDeals).values(values).onConflictDoUpdate({ target: promotionDeals.id, set: values });

  let tracking = existing;
  if (!tracking) {
    const token = randomBytes(24).toString('base64url');
    [tracking] = await tx.insert(promoterExperiences).values({
      promoterId: row.partnerUserId, experienceId: row.experienceId,
      referralAudience: 'official_partner', promotionDealId: row.id, shareToken: token,
    }).returning();
  } else if (!tracking.promotionDealId || !tracking.shareToken) {
    [tracking] = await tx.update(promoterExperiences).set({
      promotionDealId: row.id, shareToken: tracking.shareToken || tracking.id,
    }).where(eq(promoterExperiences.id, tracking.id)).returning();
  }

  if (partnerMemberDiscount(row)) {
    await tx.insert(discountLinks).values({
      experienceId: row.experienceId, discountId: `partner:${row.id}`,
      token: randomBytes(24).toString('base64url'), label: `${row.partnerName} members`,
      createdBy: row.organizerId, active: true,
    }).onConflictDoUpdate({ target: [discountLinks.experienceId, discountLinks.discountId], set: { active: true, updatedAt: new Date() } });
  }
  return tracking;
}
