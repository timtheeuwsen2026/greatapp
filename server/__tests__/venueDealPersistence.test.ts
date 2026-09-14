import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A venue's agreed terms must survive being published.
 *
 * Commitment Fee + Revenue Split carries two numbers travelling in opposite
 * directions: a one-off fee the venue pays the organiser, and a share of ticket
 * revenue the venue takes back. Publishing an event destroyed both.
 *
 *  - `applyMarketplaceEconomics` zeroed the percentage for every deal whose
 *    model was not literally `"revenue_share"` — which includes the one deal
 *    designed to have a percentage *and* a fee. A venue that agreed 20% had
 *    0.00 written to the database.
 *  - `venueCommitmentFee` has a column on `experiences` and on
 *    `experience_drafts`, and the publish mapping wrote to neither. The fee
 *    reached the form and stopped.
 *
 * Nobody noticed because nothing reads those columns back until the event is
 * reopened for editing — at which point the fields are empty, the publish
 * validation refuses the save, and it presents as "editing is broken".
 *
 * Asserted against the source because these are two lines in a 19,000-line
 * route file, and the cost of them regressing is a venue's money.
 */

const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");

function block(startMarker: string, length = 3_000): string {
  const start = routes.indexOf(startMarker);
  expect(start, `${startMarker} not found`).toBeGreaterThan(-1);
  return routes.slice(start, start + length);
}

describe("applyMarketplaceEconomics", () => {
  const body = block("function applyMarketplaceEconomics(");

  it("keeps a percentage for every deal that has one, not just revenue_share", () => {
    // The literal comparison that zeroed Commitment Fee + Revenue Split.
    expect(body).not.toMatch(/model === "revenue_share"\s*\n?\s*\?/);
    expect(body).toContain("commitment_plus_revenue_share");
  });

  it("carries the venue's commitment fee", () => {
    expect(body).toContain("venueCommitmentFee");
  });
});

describe("the draft-to-experience publish mapping", () => {
  // Wide enough to reach the venue block near the end of the mapping.
  const body = block("function buildExperienceFromBuilderPayload(", 30_000);

  it("writes every figure a venue deal can carry", () => {
    // One per deal type in VENUE_DEAL_MODELS that takes a number. A deal whose
    // figure is not written here is a deal whose terms are lost on publish.
    for (const field of [
      "venueRevenueSharePct",   // revenue_share, commitment_plus_revenue_share
      "venueCommitmentFee",     // commitment_plus_revenue_share
      "venueFixedFee",          // fixed_fee, upfront_rental, venue_sponsored
      "venuePerHeadAmount",     // per_head
      "venuePerRoomPerNight",   // per_room_night
      "venueMinimumSpend",      // minimum_spend
      "venueTargetDealValue",   // the open/invited target
    ]) {
      expect(body, `${field} is not carried onto the published event`).toContain(field);
    }
  });
});
