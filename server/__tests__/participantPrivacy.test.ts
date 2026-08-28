import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards the payloads that leaked attendee personal data.
 *
 * The two email projections fired on an ordinary event page load, so anyone who
 * opened the page and read the JSON in devtools had the roster's inboxes. The
 * columns are easy to re-add by copying a neighbouring query, which is roughly
 * how they arrived, so the projections are asserted directly.
 */

const selectProjections: unknown[] = [];
const whereClauses: unknown[] = [];

function chainableResult(): any {
  const chain: any = new Proxy(function () {}, {
    get(_target, prop) {
      // Awaiting any point in the builder yields an empty result set.
      if (prop === "then") return (resolve: (rows: unknown[]) => unknown) => resolve([]);
      if (prop === "where") {
        return (clause: unknown) => {
          whereClauses.push(clause);
          return chain;
        };
      }
      return () => chain;
    },
    apply: () => chain,
  });
  return chain;
}

vi.mock("../db", () => ({
  db: {
    select: (projection?: unknown) => {
      selectProjections.push(projection);
      return chainableResult();
    },
  },
}));

const { storage } = await import("../storage");

function projectedKeys(projection: any, group: string): string[] {
  return Object.keys(projection?.[group] ?? {});
}

/**
 * Flattens a drizzle SQL fragment to text.
 *
 * Chunks are either raw string pieces or Column objects; the column is the part
 * this test cares about, so its name is spliced back in.
 */
function sqlText(clause: any): string {
  const chunks = clause?.queryChunks ?? [];
  return chunks
    .map((chunk: any) => {
      if (Array.isArray(chunk?.value)) return chunk.value.join("");
      return typeof chunk?.name === "string" ? chunk.name : "";
    })
    .join(" ")
    .toLowerCase();
}

describe("participant payload privacy", () => {
  beforeEach(() => {
    selectProjections.length = 0;
    whereClauses.length = 0;
  });

  it("does not put attendee email addresses in the event chat payload", async () => {
    await storage.getMessages("experience-1");

    const userKeys = projectedKeys(selectProjections.at(-1), "user");

    expect(userKeys).toContain("firstName");
    expect(userKeys).not.toContain("email");
  });

  it("does not put attendee email addresses in the participants-with-skills payload", async () => {
    await storage.getParticipantsWithSkillsAndRoles("experience-1");

    const userKeys = projectedKeys(selectProjections.at(-1), "user");

    expect(userKeys).toContain("firstName");
    expect(userKeys).not.toContain("email");
  });

  it("leaves private profiles out of the public community directory", async () => {
    await storage.getAllParticipantProfiles();

    // The directory is served unauthenticated, so the member's own visibility
    // setting has to be applied in the query rather than left to the caller.
    expect(whereClauses).toHaveLength(1);
    expect(sqlText(whereClauses[0])).toContain("profile_visibility");
    expect(sqlText(whereClauses[0])).toContain("private");
  });
});
