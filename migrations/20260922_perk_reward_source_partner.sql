-- Point 55: a Participant Referral Perk's reward can be sourced from any
-- partner's Barter Deal, not only a venue's.
--
-- Until now the only question asked was a boolean: is this the venue's to
-- give? The reward that prompted the change was a Service Provider's 1-on-1
-- session, which that field cannot express at all. This column names the
-- partner entry supplying it instead; the venue keeps its own boolean because
-- its sign-off travels on the venue contract rather than a partner invite.
--
-- No approval timestamp to go with it on purpose: the partner's acceptance is
-- the `event_partners` entry's own status, and a second copy of that would be
-- one more thing that can disagree with itself.
--
-- The either/or rule from point 55.2 — one Barter Deal's supply funds the
-- recruiting host's reward OR individual participants' rewards, never both —
-- lives in the `event_partners` JSON as `terms.barterAllocation`, so it needs
-- no column of its own.

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS participant_referral_reward_source_partner_id VARCHAR;

ALTER TABLE experience_drafts
  ADD COLUMN IF NOT EXISTS participant_referral_reward_source_partner_id VARCHAR;
