import { describe, it, expect } from "vitest";
import {
  calculateAverageTurnout,
  formatTurnoutClaim,
  getTurnoutConfidence,
  summariseEventAttendance,
  type TurnoutEventInput,
} from "./attendance";

// Point 7: "I average 45 people per event" beats a blank percentage field — but
// only if the number is real. Point 11 adds QR scanning, which must NOT become
// the source of this figure.

describe("who turned up at one event", () => {
  it("counts people, not bookings", () => {
    const summary = summariseEventAttendance([
      { attendanceStatus: "attended", ticketQuantity: 3 },
      { attendanceStatus: "attended", ticketQuantity: 1 },
      { attendanceStatus: "no_show", ticketQuantity: 2 },
    ]);

    expect(summary.attended).toBe(4);
    expect(summary.noShow).toBe(2);
    expect(summary.booked).toBe(6);
    expect(summary.isConfirmed).toBe(true);
  });

  it("treats an unmarked event as silent, not as nobody coming", () => {
    const summary = summariseEventAttendance([
      { attendanceStatus: "unknown", ticketQuantity: 5 },
      { ticketQuantity: 2 },
    ]);

    expect(summary.attended).toBe(0);
    expect(summary.unmarked).toBe(7);
    expect(summary.isConfirmed).toBe(false);
  });

  it("counts a legacy booking with no quantity as one person", () => {
    expect(summariseEventAttendance([{ attendanceStatus: "attended" }]).attended).toBe(1);
  });

  it("handles an event with no bookings at all", () => {
    expect(summariseEventAttendance([]).isConfirmed).toBe(false);
    expect(summariseEventAttendance(null).booked).toBe(0);
  });
});

const finishedEvent = (id: string, attended: number, confirmed = true): TurnoutEventInput => ({
  experienceId: id,
  hasFinished: true,
  attendance: {
    attended,
    noShow: 0,
    unmarked: confirmed ? 0 : attended,
    booked: attended,
    isConfirmed: confirmed,
  },
});

describe("an organiser's average verified turnout", () => {
  it("averages attendance across confirmed completed events", () => {
    const summary = calculateAverageTurnout([
      finishedEvent("a", 40),
      finishedEvent("b", 50),
      finishedEvent("c", 45),
    ]);

    expect(summary?.averageTurnout).toBe(45);
    expect(summary?.eventsCounted).toBe(3);
    expect(summary?.totalAttendees).toBe(135);
  });

  it("never counts the event currently being proposed", () => {
    // Otherwise anyone could claim a figure by listing a large-capacity event.
    const summary = calculateAverageTurnout(
      [finishedEvent("past", 40), finishedEvent("proposal", 500)],
      { excludeExperienceId: "proposal" },
    );

    expect(summary?.averageTurnout).toBe(40);
    expect(summary?.eventsCounted).toBe(1);
  });

  it("ignores events that have not happened yet", () => {
    const upcoming: TurnoutEventInput = { ...finishedEvent("future", 100), hasFinished: false };

    expect(calculateAverageTurnout([finishedEvent("past", 30), upcoming])?.averageTurnout).toBe(30);
  });

  it("leaves unconfirmed events out rather than scoring them zero", () => {
    // An organiser who forgot to mark a list has not had a bad turnout.
    const summary = calculateAverageTurnout([
      finishedEvent("marked", 40),
      finishedEvent("forgotten", 0, false),
    ]);

    expect(summary?.averageTurnout).toBe(40);
    expect(summary?.eventsCounted).toBe(1);
    expect(summary?.eventsUnconfirmed).toBe(1);
  });

  it("claims nothing at all when nothing has been confirmed", () => {
    expect(calculateAverageTurnout([finishedEvent("a", 0, false)])).toBeNull();
    expect(calculateAverageTurnout([])).toBeNull();
    expect(calculateAverageTurnout(null)).toBeNull();
    expect(formatTurnoutClaim(null)).toBeNull();
  });

  it("records a genuine zero turnout when the organiser confirmed one", () => {
    // Nobody came, and the organiser said so. That is a measurement.
    const summary = calculateAverageTurnout([
      finishedEvent("empty", 0),
      finishedEvent("busy", 20),
    ]);

    expect(summary?.eventsCounted).toBe(2);
    expect(summary?.averageTurnout).toBe(10);
  });

  it("rounds to one decimal so a proposal reads cleanly", () => {
    expect(calculateAverageTurnout([
      finishedEvent("a", 10),
      finishedEvent("b", 11),
      finishedEvent("c", 11),
    ])?.averageTurnout).toBe(10.7);
  });
});

describe("how much the figure is worth", () => {
  it("separates a track record from a single data point", () => {
    expect(getTurnoutConfidence(calculateAverageTurnout([finishedEvent("a", 40)]))).toBe("provisional");
    expect(getTurnoutConfidence(calculateAverageTurnout([
      finishedEvent("a", 40), finishedEvent("b", 40), finishedEvent("c", 40),
    ]))).toBe("established");
    expect(getTurnoutConfidence(null)).toBe("none");
  });

  it("states the claim with the evidence behind it", () => {
    const claim = formatTurnoutClaim(calculateAverageTurnout([
      finishedEvent("a", 40), finishedEvent("b", 50),
    ]));

    expect(claim).toContain("45");
    expect(claim).toContain("2 completed events");
  });
});
