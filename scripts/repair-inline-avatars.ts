/**
 * One-off repair for participant avatars saved as inline base64 data URIs.
 *
 * Participant onboarding used to store the chosen photo as a
 * `data:image/...;base64,...` string directly in participant_profiles.avatar_url.
 * New saves are uploaded properly and repaired on write, but rows written before
 * that fix still carry megabytes of inline text. This uploads each one to
 * storage and swaps in the URL.
 *
 * Dry run (default — prints what it would do, changes nothing):
 *   node --env-file=.env --import tsx scripts/repair-inline-avatars.ts
 *
 * Apply:
 *   node --env-file=.env --import tsx scripts/repair-inline-avatars.ts --apply
 */

import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { participantProfiles } from "../shared/schema";
import { isInlineImageData, persistInlineImage } from "../server/inlineImages";

const apply = process.argv.includes("--apply");

const rows = await db
  .select({
    id: participantProfiles.id,
    userId: participantProfiles.userId,
    displayName: participantProfiles.displayName,
    avatarUrl: participantProfiles.avatarUrl,
  })
  .from(participantProfiles);

const inline = rows.filter((row) => isInlineImageData(row.avatarUrl));

console.log(`${rows.length} participant profile(s); ${inline.length} with an inline base64 avatar.`);
if (inline.length === 0) process.exit(0);

if (!apply) {
  for (const row of inline) {
    const kb = Math.round((row.avatarUrl?.length || 0) / 1024);
    console.log(` would repair ${row.displayName || row.userId} — ${kb} KB inline`);
  }
  console.log("\nDry run. Re-run with --apply to upload these and store the URLs.");
  process.exit(0);
}

let repaired = 0;
for (const row of inline) {
  const url = await persistInlineImage(row.avatarUrl, row.userId);
  if (typeof url !== "string" || isInlineImageData(url)) {
    console.error(` FAILED ${row.displayName || row.userId} — left unchanged`);
    continue;
  }
  await db
    .update(participantProfiles)
    .set({ avatarUrl: url })
    .where(eq(participantProfiles.id, row.id));
  console.log(` repaired ${row.displayName || row.userId} -> ${url}`);
  repaired += 1;
}

console.log(`\nDone: ${repaired}/${inline.length} repaired.`);
process.exit(0);
