import { expect, it } from "vitest";
import { compareHappeningEvents, splitHomepageRows } from "./homepageOrder";

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

// The homepage as it stood on 2 October 2026: six finished events, all still
// "confirmed", sat between the one confirmed upcoming event and the two new
// ones a visitor could actually join.
const now = new Date("2026-10-02T12:00:00");
const feed = [
  { id: "run-swim-run", lifecycleStatus: "confirmed", currentParticipants: 106, startDate: "2026-10-03", endDate: "2026-10-03" },
  { id: "noor", lifecycleStatus: "confirmed", currentParticipants: 44, startDate: "2026-08-23", endDate: "2026-08-23" },
  { id: "bandido-aug", lifecycleStatus: "confirmed", currentParticipants: 43, startDate: "2026-08-30", endDate: "2026-08-30" },
  { id: "k-coffee", lifecycleStatus: "confirmed", currentParticipants: 34, startDate: "2026-09-27", endDate: "2026-09-27" },
  { id: "nobody-came", lifecycleStatus: "confirmed", currentParticipants: 0, startDate: "2026-09-20", endDate: "2026-09-20" },
  { id: "miners", lifecycleStatus: "forming", currentParticipants: 4, startDate: "2026-10-04", endDate: "2026-10-04" },
  { id: "bandido-oct", lifecycleStatus: "forming", currentParticipants: 1, startDate: "2026-10-11", endDate: "2026-10-11" },
];

it("keeps the top row to events that can still be joined, and puts finished ones below", () => {
  const { happening, proven } = splitHomepageRows(feed, now);

  expect(happening.map(event => event.id)).toEqual(["run-swim-run", "miners", "bandido-oct"]);
  // Finished events, by how many came. One nobody joined proves nothing.
  expect(proven.map(event => event.id)).toEqual(["noor", "bandido-aug", "k-coffee"]);
  // Nothing is shown twice.
  expect(happening.filter(event => proven.includes(event))).toEqual([]);
});

it("keeps an event in the top row until the end of its last day", () => {
  const today = [{ id: "tonight", lifecycleStatus: "confirmed", currentParticipants: 12, startDate: "2026-10-02T07:00:00", endDate: "2026-10-02T09:00:00" }];
  expect(splitHomepageRows(today, now).happening.map(event => event.id)).toEqual(["tonight"]);
  expect(splitHomepageRows(today, new Date("2026-10-03T00:30:00")).happening).toEqual([]);
  expect(splitHomepageRows(today, new Date("2026-10-03T00:30:00")).proven.map(event => event.id)).toEqual(["tonight"]);
});

it("shows an upcoming sold-out event as proof as well, and never an undated one as finished", () => {
  const { happening, proven } = splitHomepageRows([
    { id: "full", lifecycleStatus: "confirmed", currentParticipants: 30, maxParticipants: 30, startDate: "2026-10-10" },
    { id: "undated", lifecycleStatus: "forming", currentParticipants: 3 },
  ], now);
  expect(happening.map(event => event.id)).toEqual(["full", "undated"]);
  expect(proven.map(event => event.id)).toEqual(["full"]);
  expect(splitHomepageRows(null, now)).toEqual({ happening: [], proven: [] });
});
