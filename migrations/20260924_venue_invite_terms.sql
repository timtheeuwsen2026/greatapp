ALTER TABLE venue_invites ADD COLUMN IF NOT EXISTS proposed_terms jsonb DEFAULT '{}'::jsonb;
ALTER TABLE venue_invites ADD COLUMN IF NOT EXISTS last_sent_at timestamp;
UPDATE venue_invites SET last_sent_at = COALESCE(updated_at, created_at) WHERE last_sent_at IS NULL;
ALTER TABLE venue_invites ALTER COLUMN last_sent_at SET DEFAULT now();

-- Repair only unanswered invitations for the event's current recipient.
-- Other recipients and accepted agreements retain their original proposal.
UPDATE venue_invites i
SET proposed_model = e.venue_target_deal,
    proposed_value = CASE WHEN e.venue_target_deal = 'venue_barter' THEN NULL ELSE e.venue_target_deal_value END,
    proposed_terms = CASE
      WHEN e.venue_target_deal = 'venue_barter'
        THEN jsonb_build_object('barterTerms', COALESCE(e.venue_barter_terms, ''), 'currency', e.currency)
      WHEN e.venue_target_deal = 'commitment_plus_revenue_share'
        THEN jsonb_build_object('commitmentFee', COALESCE(e.venue_commitment_fee, 0), 'revenueSharePct', COALESCE(e.venue_target_deal_value, 0), 'currency', e.currency)
      ELSE '{}'::jsonb END
FROM experiences e
WHERE i.experience_id = e.id AND lower(i.email) = lower(e.manual_venue_email)
  AND e.venue_type = 'manual' AND i.status IN ('pending', 'expired')
  AND (i.proposed_terms IS NULL OR i.proposed_terms = '{}'::jsonb);
