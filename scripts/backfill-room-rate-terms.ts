/**
 * Repairs Per Room / Per Night contracts written before room rates were copied
 * onto them.
 *
 * The Event Builder only ever displayed the venue's published room rates, so
 * the contract reached the venue's dashboard with perRoomPerNight = 0 and a
 * payout estimate of zero. New contracts now carry the rates; this fills in the
 * ones already sitting in someone's Pending Offers.
 *
 * Rates are read from the linked venue's own profile — the same source the
 * creator saw — so nothing is invented here.
 *
 * Dry run (default):
 *   node --env-file=.env --import tsx scripts/backfill-room-rate-terms.ts
 * Apply:
 *   node --env-file=.env --import tsx scripts/backfill-room-rate-terms.ts --apply
 */

import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { venueContracts, venues } from "../shared/schema";
import { normalizeVenueDealModel } from "../shared/venueDealModels";

const apply = process.argv.includes("--apply");

const contracts = await db.select().from(venueContracts);
const perRoom = contracts.filter((c) => normalizeVenueDealModel(c.model) === "per_room_night");

console.log(`${contracts.length} contract(s); ${perRoom.length} on Per Room / Per Night.`);

let repaired = 0;
let skipped = 0;

for (const contract of perRoom) {
  const terms: any = contract.terms || {};
  if (Number(terms.perRoomPerNight) > 0 && Array.isArray(terms.roomRates) && terms.roomRates.length) {
    skipped += 1;
    continue;
  }

  const [venue] = await db.select().from(venues).where(eq(venues.id, contract.venueId));
  const rooms = ((venue as any)?.venueRoomTypes || []) as any[];
  const roomRates = rooms
    .map((room) => ({
      name: room.name || room.type || "Room",
      quantity: Number(room.quantity) > 0 ? Number(room.quantity) : 1,
      capacity: Number(room.capacity) || null,
      pricePerNight: Number(room.pricePerNight) || 0,
    }))
    .filter((room) => room.pricePerNight > 0);

  if (roomRates.length === 0) {
    console.log(` skip ${contract.id.slice(0, 8)} — ${(venue as any)?.name || "venue"} has no published room rates`);
    skipped += 1;
    continue;
  }

  const perRoomPerNight = Math.min(...roomRates.map((r) => r.pricePerNight));
  const nextTerms = { ...terms, perRoomPerNight, roomRates };

  console.log(
    ` ${apply ? "repair" : "would repair"} ${contract.id.slice(0, 8)} — ${(venue as any)?.name}: ` +
    `${terms.perRoomPerNight ?? 0} -> ${perRoomPerNight} (${roomRates.length} room type(s))`,
  );

  if (apply) {
    await db
      .update(venueContracts)
      .set({ terms: nextTerms, updatedAt: new Date() })
      .where(eq(venueContracts.id, contract.id));
  }
  repaired += 1;
}

console.log(`\n${apply ? "Repaired" : "Would repair"}: ${repaired} | untouched: ${skipped}`);
if (!apply && repaired > 0) console.log("Re-run with --apply to write these.");
process.exit(0);
