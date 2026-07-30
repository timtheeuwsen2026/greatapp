-- Partner invites get a claim link.
--
-- The B2B promoter invite email used to drop the invited brand on the public
-- event page, where the only action was buying a ticket. The deal row already
-- existed (promotion_deals with partner_email and no partner_id); it just had
-- no reachable front door. The token backs /partner-invite/:token.

ALTER TABLE promotion_deals
  ADD COLUMN IF NOT EXISTS invite_token varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS promotion_deals_invite_token_idx
  ON promotion_deals (invite_token)
  WHERE invite_token IS NOT NULL;

-- Existing external invites (sent before this change) get tokens too, so their
-- recipients can be re-sent a working link without recreating the deals.
UPDATE promotion_deals
SET invite_token = replace(replace(encode(gen_random_bytes(24), 'base64'), '/', '_'), '+', '-')
WHERE source = 'external_direct'
  AND partner_id IS NULL
  AND invite_token IS NULL;
