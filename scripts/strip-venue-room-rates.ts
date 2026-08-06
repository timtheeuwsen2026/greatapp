/**
 * Clears venue-published room rates off existing contracts.
 *
 * Venues no longer publish prices of any kind. Per Room / Per Night contracts
 * written before that change carry a `roomRates` table copied from the venue's
 * profile, and their `perRoomPerNight` was the cheapest room rather than a
 * figure either party agreed to. Both are now misleading, so this drops the
 * table and records how many rooms the deal covers instead.
 *
 * Contracts that already have a creator-set rate keep it. Ones that don't are
 * listed so the creator can be asked to name their number — nothing is invented
 * here.
 *
 * Dry run (default):
 *   node --env-file=.env --import tsx scripts/strip-venue-room-rates.ts
 * Apply:
 *   node --env-file=.env --import tsx scripts/strip-venue-room-rates.ts --apply
 */

import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { venueContracts, experiences } from "../shared/schema";
import { normalizeVenueDealModel } from "../shared/venueDealModels";

const apply = process.argv.includes("--apply");

const contracts = await db.select().from(venueContracts);
const stale = contracts.filter((c) => {
  const terms: any = c.terms || {};
  return Array.isArray(terms.roomRates) || terms.roomCount === undefined;
});

console.log(`${contracts.length} contract(s); ${stale.length} carrying venue-published rates or missing a room count.`);

let cleaned = 0;
let needsRate = 0;

for (const contract of stale) {
  const terms: any = { ...(contract.terms || {}) };
  const hadRoomRates = Array.isArray(terms.roomRates);
  delete terms.roomRates;

  // Rooms the creator asked for, from the event itself.
  const [experience] = await db
    .select()
    .from(experiences)
    .where(eq(experiences.id, contract.experienceId));
  const rooms = ((experience as any)?.rooms || []) as any[];
  terms.roomCount = rooms.reduce(
    (total: number, room: any) => total + (parseInt(room?.quantity, 10) || 0),
    0,
  );

  const isPerRoom = normalizeVenueDealModel(contract.model) === "per_room_night";
  if (isPerRoom && !(Number(terms.perRoomPerNight) > 0)) {
    needsRate += 1;
    console.log(
      ` ⚠ ${contract.id.slice(0, 8)} — ${(experience as any)?.title || "experience"}: ` +
      `Per Room / Per Night with no agreed rate. The creator must set one in the Event Builder.`,
    );
  }

  console.log(
    ` ${apply ? "clean" : "would clean"} ${contract.id.slice(0, 8)} — ` +
    `${hadRoomRates ? "dropped venue room table, " : ""}roomCount=${terms.roomCount}`,
  );

  if (apply) {
    await db
      .update(venueContracts)
      .set({ terms, updatedAt: new Date() })
      .where(eq(venueContracts.id, contract.id));
  }
  cleaned += 1;
}

console.log(`\n${apply ? "Cleaned" : "Would clean"}: ${cleaned} | needing a creator-set rate: ${needsRate}`);
if (!apply && cleaned > 0) console.log("Re-run with --apply to write these.");
process.exit(0);
