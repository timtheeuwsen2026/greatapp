-- Venue bids go straight to the creator.
--
-- "Offer to Host" used to land in an admin approval queue, so a creator could
-- not see a bid until someone at the platform released it. New bids are written
-- as 'pending', which is the status the creator's Venue Offers tab reads.

ALTER TABLE venue_offers
  ALTER COLUMN status SET DEFAULT 'pending';

-- Release bids that were queued before this change. They are real offers from
-- real venues that their creator has never been shown; leaving them behind
-- would keep the bottleneck in place for every negotiation already in flight.
-- Accepted and declined offers are untouched.
UPDATE venue_offers
SET status = 'pending',
    updated_at = now()
WHERE status = 'admin_review';
