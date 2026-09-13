import { describe, expect, it } from "vitest";
import {
  experienceClosesAt,
  hasExperiencePassed,
} from "./eventLifecycle";

const at = (iso: string) => new Date(iso);

describe("hasExperiencePassed", () => {
  it("is false during the event's own final day", () => {
    const experience = { startDate: "2026-09-10", endDate: "2026-09-12" };
    expect(hasExperiencePassed(experience, at("2026-09-12T19:30:00"))).toBe(false);
    expect(hasExperiencePassed(experience, at("2026-09-12T23:59:00"))).toBe(false);
  });

  it("is true the day after it ends", () => {
    expect(
      hasExperiencePassed(
        { startDate: "2026-09-10", endDate: "2026-09-12" },
        at("2026-09-13T00:01:00"),
      ),
    ).toBe(true);
  });

  it("closes a single-day event at the end of its start date", () => {
    const dayEvent = { startDate: "2026-09-10" };
    expect(hasExperiencePassed(dayEvent, at("2026-09-10T22:00:00"))).toBe(false);
    expect(hasExperiencePassed(dayEvent, at("2026-09-11T09:00:00"))).toBe(true);
  });

  it("never reports an undated draft as passed", () => {
    expect(hasExperiencePassed({}, at("2030-01-01T00:00:00"))).toBe(false);
    expect(hasExperiencePassed({ startDate: null, endDate: "" })).toBe(false);
    expect(experienceClosesAt({})).toBeNull();
  });

  it("ignores an unparseable date rather than guessing", () => {
    expect(hasExperiencePassed({ endDate: "not a date" }, at("2030-01-01T00:00:00"))).toBe(false);
  });

  it("falls back to the start date when there is no end date", () => {
    expect(
      hasExperiencePassed({ startDate: "2026-01-05", endDate: null }, at("2026-01-06T00:01:00")),
    ).toBe(true);
  });
});
