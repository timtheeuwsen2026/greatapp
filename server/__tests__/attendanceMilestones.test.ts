import { describe, expect, it, vi, beforeEach } from "vitest";

// The counting is the whole feature. Getting it wrong hands somebody a free
// t-shirt they did not earn, or refuses one they did.

const rows: Array<{ userId: string; experienceId: string | null; creatorId: string | null }> = [];

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: async () => rows,
        }),
      }),
    }),
  },
}));

const { getAttendanceCounts, getAttendanceCountsForUsers } = await import("../attendanceMilestones");

const GOOD_SOLES = "creator-good-soles";
const OTHER = "creator-other";

beforeEach(() => {
  rows.length = 0;
});

describe("getAttendanceCounts", () => {
  it("separates events with one organiser from the platform-wide total", async () => {
    rows.push(
      { userId: "u1", experienceId: "run-1", creatorId: GOOD_SOLES },
      { userId: "u1", experienceId: "run-2", creatorId: GOOD_SOLES },
      { userId: "u1", experienceId: "yoga-1", creatorId: OTHER },
    );

    const counts = await getAttendanceCounts("u1", GOOD_SOLES);
    expect(counts.withOrganiser).toBe(2);
    expect(counts.platformWide).toBe(3);
  });

  // Two tickets to one run is one run attended. Counting bookings instead of
  // events would let somebody buy their way to a loyalty reward.
  it("counts an event once however many tickets were bought", async () => {
    rows.push(
      { userId: "u1", experienceId: "run-1", creatorId: GOOD_SOLES },
      { userId: "u1", experienceId: "run-1", creatorId: GOOD_SOLES },
      { userId: "u1", experienceId: "run-1", creatorId: GOOD_SOLES },
    );

    const counts = await getAttendanceCounts("u1", GOOD_SOLES);
    expect(counts.withOrganiser).toBe(1);
    expect(counts.platformWide).toBe(1);
  });

  it("counts nothing for an organiser they have never been to", async () => {
    rows.push({ userId: "u1", experienceId: "yoga-1", creatorId: OTHER });

    const counts = await getAttendanceCounts("u1", GOOD_SOLES);
    expect(counts.withOrganiser).toBe(0);
    expect(counts.platformWide).toBe(1);
  });

  it("returns zeroes rather than throwing on a missing user", async () => {
    expect(await getAttendanceCounts("", GOOD_SOLES)).toEqual({ withOrganiser: 0, platformWide: 0 });
  });

  it("leaves the per-organiser count at zero when no organiser is named", async () => {
    rows.push({ userId: "u1", experienceId: "run-1", creatorId: GOOD_SOLES });

    const counts = await getAttendanceCounts("u1", null);
    expect(counts.withOrganiser).toBe(0);
    expect(counts.platformWide).toBe(1);
  });
});

describe("getAttendanceCountsForUsers", () => {
  it("counts a whole community in one pass", async () => {
    rows.push(
      { userId: "u1", experienceId: "run-1", creatorId: GOOD_SOLES },
      { userId: "u1", experienceId: "run-2", creatorId: GOOD_SOLES },
      { userId: "u1", experienceId: "yoga-1", creatorId: OTHER },
      { userId: "u2", experienceId: "run-1", creatorId: GOOD_SOLES },
    );

    const counts = await getAttendanceCountsForUsers(["u1", "u2"], GOOD_SOLES);
    expect(counts.get("u1")).toEqual({ withOrganiser: 2, platformWide: 3 });
    expect(counts.get("u2")).toEqual({ withOrganiser: 1, platformWide: 1 });
  });

  it("gives someone with no bookings an explicit zero rather than nothing", async () => {
    rows.push({ userId: "u1", experienceId: "run-1", creatorId: GOOD_SOLES });

    const counts = await getAttendanceCountsForUsers(["u1", "u3"], GOOD_SOLES);
    expect(counts.get("u3")).toEqual({ withOrganiser: 0, platformWide: 0 });
  });

  it("does no work for an empty list", async () => {
    expect((await getAttendanceCountsForUsers([], GOOD_SOLES)).size).toBe(0);
  });
});
