import { describe, it, expect } from "vitest";
import { z } from "zod";
import { insertVenueAvailabilitySchema } from "../../shared/schema";

// Reported from production: "Add Block" returned
//   400 {"code":"invalid_type","expected":"date","received":"string",
//        "path":["startDate"],"message":"Expected date, received string"}
//
// The generated insert schema types timestamp columns as z.date(), so it
// demanded real Date objects. JSON has no Date type — every browser
// necessarily sends an ISO string — so no client could ever have satisfied
// it. Blocking dates was impossible from both the builder and the dashboard.
//
// This mirrors the validation the POST route runs, so the shape the browser
// actually sends is what gets checked.

const availabilityInputSchema = insertVenueAvailabilitySchema
  .omit({ externalFeedUrl: true, externalUid: true, source: true })
  .extend({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "End date cannot be before start date",
  });

/** Exactly what the Add Date Block dialog puts on the wire. */
const browserPayload = {
  venueId: "venue-1",
  startDate: "2026-08-21T00:00:00.000Z",
  endDate: "2026-09-21T00:00:00.000Z",
  status: "blocked",
  source: "manual",
  notes: "Closed for renovation",
};

describe("venue availability input", () => {
  it("accepts the ISO strings a browser sends", () => {
    const parsed = availabilityInputSchema.parse(browserPayload);
    expect(parsed.startDate).toBeInstanceOf(Date);
    expect(parsed.endDate).toBeInstanceOf(Date);
    expect(parsed.startDate.toISOString()).toBe("2026-08-21T00:00:00.000Z");
  });

  it("accepts a single-day block", () => {
    const parsed = availabilityInputSchema.parse({
      ...browserPayload,
      endDate: browserPayload.startDate,
    });
    expect(parsed.endDate.getTime()).toBe(parsed.startDate.getTime());
  });

  it("still refuses an end date before the start", () => {
    const result = availabilityInputSchema.safeParse({
      ...browserPayload,
      endDate: "2026-08-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/end date cannot be before/i);
    }
  });

  it("works without optional notes", () => {
    const { notes, ...withoutNotes } = browserPayload;
    expect(availabilityInputSchema.safeParse(withoutNotes).success).toBe(true);
  });

  it("refuses a caller who tries to look like an imported booking", () => {
    // externalUid is how the sync recognises its own rows. Letting a client
    // set it would let them overwrite a real Airbnb booking.
    const parsed: Record<string, unknown> = availabilityInputSchema.parse({
      ...browserPayload,
      externalUid: "hosted-booking-1@airbnb.com",
      externalFeedUrl: "https://airbnb.com/calendar/ical/1.ics",
    } as any);

    expect(parsed.externalUid).toBeUndefined();
    expect(parsed.externalFeedUrl).toBeUndefined();
  });

  it("does not let the caller choose the source", () => {
    // The route stamps source: "manual" itself. A block labelled ical_import
    // would be deleted as an orphan by the next sync.
    const parsed: Record<string, unknown> = availabilityInputSchema.parse({
      ...browserPayload,
      source: "ical_import",
    } as any);
    expect(parsed.source).toBeUndefined();
  });

  it("rejects a date that is not a date at all", () => {
    expect(availabilityInputSchema.safeParse({
      ...browserPayload,
      startDate: "not a date",
    }).success).toBe(false);
  });
});

// UAT: a venue in UTC+5 blocked 13-22 September. The dialog sent local
// midnight as an instant, so it stored "12 Sept 19:00Z" and the platform
// blocked 12-21 instead — leaving the 22nd bookable on a week the venue
// had closed, and blocking the 12th which they never touched.

import { startOfUtcDay } from "../ical";

const dayAnchoredSchema = insertVenueAvailabilitySchema
  .omit({ externalFeedUrl: true, externalUid: true, source: true })
  .extend({
    startDate: z.coerce.date().transform(startOfUtcDay),
    endDate: z.coerce.date().transform(startOfUtcDay),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "End date cannot be before start date",
  });

describe("manual blocks cover whole days", () => {
  const base = { venueId: "venue-1", status: "blocked", notes: null };

  it("anchors a plain calendar date to UTC midnight", () => {
    const parsed = dayAnchoredSchema.parse({ ...base, startDate: "2026-09-13", endDate: "2026-09-22" });
    expect(parsed.startDate.toISOString()).toBe("2026-09-13T00:00:00.000Z");
    expect(parsed.endDate.toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("pulls a UTC+5 local-midnight instant back onto its own day", () => {
    // What the old dialog sent for "13 September" from Asia/Karachi.
    const parsed = dayAnchoredSchema.parse({
      ...base, startDate: "2026-09-12T19:00:00.000Z", endDate: "2026-09-21T19:00:00.000Z",
    });
    expect(parsed.startDate.toISOString()).toBe("2026-09-12T00:00:00.000Z");
    expect(parsed.endDate.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("keeps a date-only string on the day the venue clicked", () => {
    // The fix: the client now sends the calendar date, so no shift happens.
    for (const day of ["2026-09-13", "2026-01-01", "2026-12-31"]) {
      expect(dayAnchoredSchema.parse({ ...base, startDate: day, endDate: day })
        .startDate.toISOString().slice(0, 10)).toBe(day);
    }
  });

  it("still allows a single-day block", () => {
    const parsed = dayAnchoredSchema.parse({ ...base, startDate: "2026-09-13", endDate: "2026-09-13" });
    expect(parsed.startDate.getTime()).toBe(parsed.endDate.getTime());
  });
});
