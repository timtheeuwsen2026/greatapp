import { expect, it } from "vitest";
import { compareHappeningEvents } from "./homepageOrder";

it("leads with confirmed events by signup count, then date, without elevating missing dates", () => {
  const events = [
    { id: "forming", lifecycleStatus: "forming", currentParticipants: 70, startDate: "2026-10-01" },
    { id: "run-swim-run", lifecycleStatus: "confirmed", currentParticipants: 46, startDate: "2026-11-01" },
    { id: "no-date", lifecycleStatus: "confirmed", currentParticipants: 10 },
    { id: "sooner", lifecycleStatus: "confirmed", currentParticipants: 10, startDate: "2026-10-01" },
    { id: "later", lifecycleStatus: "confirmed", currentParticipants: 10, startDate: "2026-10-02" },
  ];
  expect(events.sort(compareHappeningEvents).map(event => event.id)).toEqual([
    "run-swim-run", "sooner", "later", "no-date", "forming",
  ]);
});
