import { getVenueDealTermsKey, normalizeVenueDealModel } from './venueDealModels';

/** The complete proposal travels with the invitation, including non-cash terms. */
export function venueInviteTerms(event: any): Record<string, any> {
  const model = normalizeVenueDealModel(event.venueTargetDeal);
  const key = getVenueDealTermsKey(model);
  const terms: Record<string, any> = { currency: event.currency || 'eur' };
  if (model === 'venue_barter') terms.barterTerms = String(event.venueBarterTerms || '').trim();
  else if (key && event.venueTargetDealValue != null) terms[key] = Number(event.venueTargetDealValue);
  if (model === 'commitment_plus_revenue_share') terms.commitmentFee = Number(event.venueCommitmentFee || 0);
  return terms;
}

export function savedVenueInviteTerms(invite: any): Record<string, any> {
  if (invite.proposedTerms && Object.keys(invite.proposedTerms).length) return invite.proposedTerms;
  return venueInviteTerms({ venueTargetDeal: invite.proposedModel, venueTargetDealValue: invite.proposedValue, currency: invite.currency });
}

export function newExternalVenueFields() {
  return {
    venueType: 'manual' as const,
    selectedVenueId: '',
    manualVenueName: '', manualVenueAddress: '', manualVenueContactName: '',
    manualVenueEmail: '', manualVenuePropertyUrl: '', manualVenueDescription: '',
    manualVenueCapacity: null, manualVenuePhotos: [],
  };
}
