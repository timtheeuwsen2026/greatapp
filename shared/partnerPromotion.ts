/** Partner type is descriptive; the accepted deal alone determines commission. */
export function acceptedPartnerCommissionPct(deal: any, experienceId: string, partnerId: string): number {
  if (!deal || deal.status !== 'accepted' || deal.experienceId !== experienceId
      || deal.partnerId !== partnerId || deal.dealType !== 'commission_per_ticket') return 0;
  const pct = Number(deal.terms?.commissionPct);
  return Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct : 0;
}

export function partnerMemberDiscount(row: any) {
  if (row?.status !== 'confirmed' || row.dealType !== 'member_discount') return null;
  const value = Number(row.terms?.discountPct);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return { id: `partner:${row.id}`, title: `${row.partnerName} member discount`, type: 'percentage', value, active: true };
}

export function partnerShareUrl(base: string, event: string, code: string | null, token: string | null, discount?: string | null) {
  if (!code || !token) return null;
  const params = new URLSearchParams({ ref: code, share: token });
  if (discount) params.set('discount', discount);
  return `${base.replace(/\/$/, '')}/e/${encodeURIComponent(event)}?${params}`;
}

/** A booking belongs to one referral link, so rates are alternatives, never added. */
export function maximumPartnerCommissionPct(partners: any[]): number {
  return Math.max(0, ...partners.filter(p => p.status !== 'declined' && p.dealType === 'commission_per_ticket')
    .map(p => Math.min(100, Math.max(0, Number(p.terms?.commissionPct) || 0))));
}
