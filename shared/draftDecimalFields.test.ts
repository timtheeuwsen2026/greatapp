import { describe, it, expect } from "vitest";
import { insertExperienceDraftSchema, experienceDrafts } from "./schema";

/**
 * QA D-01: a pricing step vanished on every save.
 *
 * The builder posts money fields as numbers. The draft schema accepts each
 * decimal column as a string unless it is explicitly listed with a
 * number-to-string transform, and `venueCommitmentFee` never was — so the
 * moment a creator chose Commitment Fee + Revenue Split, the whole draft update
 * failed validation with a 400. Not just that field: the entire save, so the
 * venue percentage went with it, while the header still read "Saved 7:47 PM".
 *
 * The failure mode is silent and total, so it is worth a test that walks every
 * decimal column rather than the one that happened to be reported.
 */

function decimalColumnNames(): string[] {
  return Object.entries(experienceDrafts as unknown as Record<string, any>)
    .filter(([, column]) => column?.columnType === "PgNumeric" || column?.dataType === "string" && column?.columnType === "PgNumeric")
    .map(([name]) => name);
}

describe("draft money fields accept the numbers the builder sends", () => {
  it("has decimal columns to check", () => {
    expect(decimalColumnNames().length).toBeGreaterThan(0);
  });

  it("accepts a number for every decimal column on the drafts table", () => {
    const rejected: string[] = [];

    for (const field of decimalColumnNames()) {
      const result = insertExperienceDraftSchema.partial().safeParse({ [field]: 12.5 });
      if (!result.success) rejected.push(field);
    }

    // Any name here 400s the whole draft save the moment a creator touches it.
    expect(rejected).toEqual([]);
  });

  it("still accepts the strings the database itself round-trips", () => {
    for (const field of decimalColumnNames()) {
      expect(insertExperienceDraftSchema.partial().safeParse({ [field]: "12.50" }).success).toBe(true);
    }
  });

  it("accepts the commitment fee specifically, as a number", () => {
    // The reported case, kept by name so a regression is obvious.
    const result = insertExperienceDraftSchema.partial().safeParse({
      venueCommitmentFee: 75,
      venueRevenueSharePct: 20,
    });
    expect(result.success).toBe(true);
  });

  it("keeps single-day event times, which the drafts table used to drop", () => {
    // QA D-02: the columns did not exist, so the ORM discarded them and the
    // creator's times were gone after a reload while the date survived.
    expect("startTime" in experienceDrafts).toBe(true);
    expect("endTime" in experienceDrafts).toBe(true);

    const result = insertExperienceDraftSchema.partial().safeParse({
      startTime: "18:00",
      endTime: "21:00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startTime).toBe("18:00");
      expect(result.data.endTime).toBe("21:00");
    }
  });
});
