/**
 * Keeps imported venue calendars fresh.
 *
 * The PRD asks for the system to "continuously fetch" blocked dates. Hourly is
 * the right cadence: Airbnb and Booking.com regenerate their feeds on roughly
 * that scale, and a venue that sells a week elsewhere should not be bookable
 * here for more than an hour afterwards.
 */

import cron from "node-cron";
import { syncAllVenueIcalFeeds } from "./icalSync";

export function startIcalSyncScheduler() {
  cron.schedule("17 * * * *", async () => {
    await runIcalSync("hourly");
  });

  // A restart should not leave stale dates standing until the next hour mark.
  setImmediate(() => {
    void runIcalSync("startup");
  });

  console.log("[iCal Sync] Started — importing venue calendars hourly");
}

async function runIcalSync(trigger: string) {
  try {
    const result = await syncAllVenueIcalFeeds();
    if (result.venues > 0) {
      console.log(
        `[iCal Sync] ${trigger}: ${result.venues} venue(s), ${result.feeds} feed(s)` +
        (result.failed ? `, ${result.failed} failed` : ""),
      );
    }
  } catch (error) {
    console.error(`[iCal Sync] ${trigger} run failed:`, error);
  }
}
