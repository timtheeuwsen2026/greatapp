import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { experiences } from "@shared/schema";

/**
 * Every column the builder owns must survive being published.
 *
 * `buildExperienceFromBuilderPayload` maps a draft onto an experience row by
 * listing fields one at a time. A column missing from that list is not left
 * alone — it is written as the table default, which for a jsonb array means
 * the creator's data is replaced with `[]`.
 *
 * That is how "Early Bird — 2.00 EUR off" reached the form, reached the draft,
 * and then did not exist on the published event: pressing Create shareable link
 * returned "That discount is not set up on this event", and it wasn't. Three
 * more were going the same way unnoticed — a day space's standing and seated
 * capacity, and whether the participant perk is venue-backed.
 *
 * So this inverts the default. Add a column to `experiences` that the builder
 * sets, and this test fails until the mapping carries it. Add one the builder
 * has no business writing, and you say so here, once, in a list whose entries
 * each have a reason.
 */

const routes = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");
const start = routes.indexOf("function buildExperienceFromBuilderPayload(");
// The mapping's object literal is passed through `applyMarketplaceEconomics`,
// which sets a few columns of its own, so both bodies count as "written".
const economicsStart = routes.indexOf("function applyMarketplaceEconomics(");
const mapping = routes.slice(start, start + 30_000)
  + routes.slice(economicsStart, economicsStart + 4_000);

/**
 * Columns the builder does not own, and why.
 *
 * Everything here is written by something other than a creator filling in the
 * builder — the review workflow, the booking engine, the payout scheduler, or
 * the database itself.
 */
const NOT_THE_BUILDERS: Record<string, string> = {
  id: "assigned by the database",
  slug: "minted at publish from the title",
  createdAt: "database",
  updatedAt: "database",
  creatorId: "taken from the session, never the payload",
  status: "the review workflow owns this",
  rejectionCount: "admin decision",
  reviewedBy: "admin decision",
  reviewedAt: "admin decision",
  reviewNotes: "admin decision",
  previewToken: "minted at publish",
  manualDealUnlocked: "admin unlock, per event",
  ticketPlatformFeePct: "admin fee override, per event",
  addonPlatformFeePct: "admin fee override, per event",
  platformFeesUpdatedAt: "admin fee audit",
  platformFeesUpdatedBy: "admin fee audit",
  currentParticipants: "counted from bookings",
  currentReservations: "counted from soft holds",
  balanceAmount: "derived per booking, not per event",
  mvgStatus: "the MVG scheduler owns this",
  mvgResolvedAt: "the MVG scheduler owns this",
  mvgFailedAt: "the MVG scheduler owns this",
  mvgLastCheckedAt: "the MVG scheduler owns this",
  archivedAt: "archive action",
  archivedBy: "archive action",
  cancelledAt: "cancellation flow",
  cancellationReason: "cancellation flow",
  venueStatus: "derived from the venue type at publish",
  linkedVenueId: "mapped from selectedVenueId at the call site",
  stripeConnectAccountId: "resolved from the creator's profile",
  chatGroupId: "created with the event chat",
  payoutAccountHolderName: "lives on the creator profile",
  payoutIbanOrAccount: "lives on the creator profile",
  payoutSwiftBic: "lives on the creator profile",
  payoutBankName: "lives on the creator profile",
  payoutCountry: "lives on the creator profile",
  // Legacy columns with no builder control behind them.
  managementType: "legacy, no builder field",
  venueBookedByGreat: "legacy, no builder field",
  servicesBookedByGreat: "legacy, no builder field",
  linkedServiceIds: "legacy, superseded by selectedServiceIds",
  tasks: "legacy, no builder field",
  roomImages: "legacy, rooms carry their own gallery",
  showParticipantList: "legacy, no builder field",
  virtualMeetingPassword: "legacy, no builder field",
  participantReferralVenueApprovedAt: "set when the venue signs the perk off",
};

describe("buildExperienceFromBuilderPayload", () => {
  it("writes every experience column the builder owns", () => {
    const missing = Object.keys(getTableColumns(experiences)).filter((name) => {
      if (name in NOT_THE_BUILDERS) return false;
      return !mapping.includes(`${name}:`) && !mapping.includes(`${name},`);
    });

    expect(
      missing,
      `These columns are set in the builder and dropped on publish, which writes `
        + `the table default over the creator's data: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("carries the fields that were found missing", () => {
    // Named so a regression reads as itself rather than as a count changing.
    for (const field of [
      "discounts",
      "standingCapacity",
      "seatedCapacity",
      "participantReferralVenueBacked",
    ]) {
      expect(mapping, `${field} is dropped on publish`).toContain(field);
    }
  });

  it("keeps the exclusion list honest — every entry is a real column", () => {
    const columns = new Set(Object.keys(getTableColumns(experiences)));
    const stale = Object.keys(NOT_THE_BUILDERS).filter((name) => !columns.has(name));
    expect(stale, `no longer columns on experiences: ${stale.join(", ")}`).toEqual([]);
  });
});
