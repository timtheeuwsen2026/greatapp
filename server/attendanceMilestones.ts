/**
 * Attendance, and the rewards that hang off it.
 *
 * Two counts matter and they are not the same number. The one an organiser
 * cares about is "how many of MY events has this person done" — that is what a
 * loyalty reward is for. The platform-wide total is a different, larger figure
 * and answers a different question.
 *
 * Neither is stored. Both are counted from bookings on demand, because a
 * stored counter drifts the first time somebody cancels, and a loyalty count
 * that quietly overstates is worse than no count at all.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  attendanceMilestoneUnlocks,
  bookings,
  creatorAttendanceMilestones,
  experiences,
} from "@shared/schema";

/** Booking states that mean somebody actually took a place. */
const ATTENDING_STATUSES = ["confirmed", "deposit_paid", "fully_paid"];

export type AttendanceCounts = {
  /** Distinct events attended with one organiser. */
  withOrganiser: number;
  /** Distinct events attended anywhere on the platform. */
  platformWide: number;
};

/**
 * Distinct events a person has attended, per organiser and in total.
 *
 * Distinct events rather than bookings: somebody who books two tickets to one
 * run has been to one run, and rewarding them twice for it would be a bug an
 * organiser notices before we do.
 */
export async function getAttendanceCounts(
  userId: string,
  creatorId?: string | null,
): Promise<AttendanceCounts> {
  if (!userId) return { withOrganiser: 0, platformWide: 0 };

  const rows = await db
    .select({ experienceId: bookings.experienceId, creatorId: experiences.creatorId })
    .from(bookings)
    .leftJoin(experiences, eq(bookings.experienceId, experiences.id))
    .where(and(
      eq(bookings.userId, userId),
      inArray(bookings.status, ATTENDING_STATUSES as any),
    ));

  const everywhere = new Set<string>();
  const withThisOrganiser = new Set<string>();

  for (const row of rows) {
    if (!row.experienceId) continue;
    everywhere.add(row.experienceId);
    if (creatorId && row.creatorId === creatorId) {
      withThisOrganiser.add(row.experienceId);
    }
  }

  return {
    withOrganiser: creatorId ? withThisOrganiser.size : 0,
    platformWide: everywhere.size,
  };
}

/**
 * The same counts for a whole list of people at once.
 *
 * The community tab shows a row per member, and asking the database twice per
 * row turns a page load into a few hundred queries.
 */
export async function getAttendanceCountsForUsers(
  userIds: string[],
  creatorId: string,
): Promise<Map<string, AttendanceCounts>> {
  const counts = new Map<string, AttendanceCounts>();
  if (!userIds.length) return counts;

  const rows = await db
    .select({
      userId: bookings.userId,
      experienceId: bookings.experienceId,
      creatorId: experiences.creatorId,
    })
    .from(bookings)
    .leftJoin(experiences, eq(bookings.experienceId, experiences.id))
    .where(and(
      inArray(bookings.userId, userIds),
      inArray(bookings.status, ATTENDING_STATUSES as any),
    ));

  const everywhere = new Map<string, Set<string>>();
  const withOrganiser = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.userId || !row.experienceId) continue;
    if (!everywhere.has(row.userId)) everywhere.set(row.userId, new Set());
    everywhere.get(row.userId)!.add(row.experienceId);

    if (row.creatorId === creatorId) {
      if (!withOrganiser.has(row.userId)) withOrganiser.set(row.userId, new Set());
      withOrganiser.get(row.userId)!.add(row.experienceId);
    }
  }

  for (const userId of userIds) {
    counts.set(userId, {
      withOrganiser: withOrganiser.get(userId)?.size ?? 0,
      platformWide: everywhere.get(userId)?.size ?? 0,
    });
  }

  return counts;
}

export type MilestoneProgress = {
  milestoneId: string;
  creatorId: string;
  target: number;
  rewardType: string;
  rewardDescription: string;
  fulfillmentInstructions: string | null;
  attended: number;
  remaining: number;
  unlocked: boolean;
  status: string | null;
};

/**
 * Where somebody stands against one organiser's attendance rewards.
 *
 * Returns every active milestone, reached or not, so the participant can see
 * what they are working towards rather than only what they have already got.
 */
export async function getMilestoneProgress(
  userId: string,
  creatorId: string,
): Promise<MilestoneProgress[]> {
  if (!userId || !creatorId) return [];

  const milestones = await db
    .select()
    .from(creatorAttendanceMilestones)
    .where(and(
      eq(creatorAttendanceMilestones.creatorId, creatorId),
      eq(creatorAttendanceMilestones.active, true),
    ));
  if (!milestones.length) return [];

  const { withOrganiser } = await getAttendanceCounts(userId, creatorId);

  const unlocks = await db
    .select()
    .from(attendanceMilestoneUnlocks)
    .where(and(
      eq(attendanceMilestoneUnlocks.userId, userId),
      inArray(attendanceMilestoneUnlocks.milestoneId, milestones.map((row) => row.id)),
    ));
  const unlockByMilestone = new Map(unlocks.map((row) => [row.milestoneId, row]));

  return milestones
    .sort((left, right) => left.target - right.target)
    .map((milestone) => {
      const unlock = unlockByMilestone.get(milestone.id);
      return {
        milestoneId: milestone.id,
        creatorId: milestone.creatorId,
        target: milestone.target,
        rewardType: milestone.rewardType,
        rewardDescription: milestone.rewardDescription,
        // Only shown once they have actually reached it — the instructions are
        // the organiser's handover note, not a teaser.
        fulfillmentInstructions: unlock ? milestone.fulfillmentInstructions : null,
        attended: withOrganiser,
        remaining: Math.max(0, milestone.target - withOrganiser),
        unlocked: !!unlock || withOrganiser >= milestone.target,
        status: unlock?.status ?? null,
      };
    });
}

/**
 * Records any milestone this person has just reached.
 *
 * Called after a booking confirms. The unique index on (milestone, user) is
 * what actually guarantees once-only, not this check — two confirmations
 * landing together would otherwise both see "not unlocked yet".
 */
export async function recordAttendanceUnlocks(
  userId: string,
  creatorId: string,
): Promise<number> {
  if (!userId || !creatorId) return 0;

  const milestones = await db
    .select()
    .from(creatorAttendanceMilestones)
    .where(and(
      eq(creatorAttendanceMilestones.creatorId, creatorId),
      eq(creatorAttendanceMilestones.active, true),
    ));
  if (!milestones.length) return 0;

  const { withOrganiser } = await getAttendanceCounts(userId, creatorId);
  const reached = milestones.filter((milestone) => withOrganiser >= milestone.target);
  if (!reached.length) return 0;

  let recorded = 0;
  for (const milestone of reached) {
    const [inserted] = await db
      .insert(attendanceMilestoneUnlocks)
      .values({
        milestoneId: milestone.id,
        userId,
        attendedCount: withOrganiser,
        // An instant reward needs nothing from the organiser, so it is handed
        // over the moment it is earned rather than sitting in their queue.
        status: milestone.rewardType === "instant" ? "fulfilled" : "unlocked",
        fulfilledAt: milestone.rewardType === "instant" ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) recorded += 1;
  }

  return recorded;
}
