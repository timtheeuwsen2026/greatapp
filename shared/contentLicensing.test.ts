import { describe, it, expect } from "vitest";
import {
  canUseCommercially,
  canViewContent,
  licenseExpired,
  sanitiseLicense,
  visibleContent,
  type ContentLicense,
} from "./contentLicensing";

const EVENT_DATE = new Date("2026-09-01T10:00:00Z");

function license(overrides: Partial<ContentLicense> = {}): ContentLicense {
  return {
    createdByRole: "organizer",
    createdByUserId: "organiser-1",
    scope: "event_only",
    expiresDaysAfterEvent: null,
    commercialOptIn: false,
    attribution: null,
    ...overrides,
  };
}

describe("licenseExpired — counted from the event, not the upload", () => {
  it("lapses N days after the event date", () => {
    const terms = { expiresDaysAfterEvent: 30 };
    expect(licenseExpired(terms, EVENT_DATE, new Date("2026-09-20T00:00:00Z"))).toBe(false);
    expect(licenseExpired(terms, EVENT_DATE, new Date("2026-10-05T00:00:00Z"))).toBe(true);
  });

  it("never lapses when the duration is indefinite", () => {
    expect(licenseExpired({ expiresDaysAfterEvent: null }, EVENT_DATE, new Date("2030-01-01"))).toBe(false);
  });

  it("never lapses when the event has no date to count from", () => {
    // A missing date must not silently expire everything.
    expect(licenseExpired({ expiresDaysAfterEvent: 30 }, null, new Date("2030-01-01"))).toBe(false);
  });
});

describe("canViewContent — the library is filtered by scope", () => {
  const sponsor = { userId: "sponsor-1", isConfirmedPartner: true };
  const stranger = { userId: "stranger-1" };

  it("shows a confirmed partner what was licensed to all partners", () => {
    expect(canViewContent(license({ scope: "all_partners" }), sponsor, EVENT_DATE)).toBe(true);
  });

  it("hides the organiser's own restricted shots from a sponsor", () => {
    expect(canViewContent(license({ scope: "event_only" }), sponsor, EVENT_DATE)).toBe(false);
    expect(canViewContent(license({ scope: "uploader_promotion" }), sponsor, EVENT_DATE)).toBe(false);
  });

  it("shows the organiser everything on their own event", () => {
    expect(canViewContent(
      license({ scope: "event_only", createdByRole: "participant", createdByUserId: "p-1" }),
      { userId: "organiser-1", isOrganizer: true },
      EVENT_DATE,
    )).toBe(true);
  });

  it("keeps the uploader's own file visible even after the licence lapses", () => {
    // A photographer losing sight of their own work would be absurd.
    expect(canViewContent(
      license({ createdByUserId: "marta", scope: "all_partners", expiresDaysAfterEvent: 30 }),
      { userId: "marta" },
      EVENT_DATE,
      new Date("2027-01-01"),
    )).toBe(true);
  });

  it("stops showing an expired licence to a partner", () => {
    expect(canViewContent(
      license({ scope: "all_partners", expiresDaysAfterEvent: 30 }),
      sponsor,
      EVENT_DATE,
      new Date("2026-10-05"),
    )).toBe(false);
  });

  it("shows nothing to somebody with no relationship to the event", () => {
    expect(canViewContent(license({ scope: "all_partners" }), stranger, EVENT_DATE)).toBe(false);
  });

  it("filters a list in the order it was given", () => {
    const items = [
      { id: "a", license: license({ scope: "event_only" }) },
      { id: "b", license: license({ scope: "all_partners" }) },
      { id: "c", license: license({ scope: "great_marketing" }) },
    ];
    expect(visibleContent(items, sponsor, EVENT_DATE).map((item) => item.id)).toEqual(["b", "c"]);
  });
});

describe("canUseCommercially — participant consent is the hard rule", () => {
  const organiser = { userId: "organiser-1", isOrganizer: true };

  it("refuses the organiser a participant's photo without that participant's opt-in", () => {
    const participantUpload = license({
      createdByRole: "participant",
      createdByUserId: "p-1",
      scope: "all_partners",
      commercialOptIn: false,
    });
    expect(canUseCommercially(participantUpload, organiser, EVENT_DATE)).toBe(false);
  });

  it("allows it once that participant has opted in", () => {
    const participantUpload = license({
      createdByRole: "participant",
      createdByUserId: "p-1",
      scope: "all_partners",
      commercialOptIn: true,
    });
    expect(canUseCommercially(participantUpload, organiser, EVENT_DATE)).toBe(true);
  });

  it("still lets the participant use their own photo either way", () => {
    const participantUpload = license({
      createdByRole: "participant",
      createdByUserId: "p-1",
      scope: "event_only",
      commercialOptIn: false,
    });
    expect(canUseCommercially(participantUpload, { userId: "p-1" }, EVENT_DATE)).toBe(true);
  });

  it("refuses commercial reuse of an event-only licence to anyone else", () => {
    expect(canUseCommercially(
      license({ scope: "event_only", createdByUserId: "organiser-1" }),
      { userId: "sponsor-1", isConfirmedPartner: true },
      EVENT_DATE,
    )).toBe(false);
  });

  it("refuses an expired licence even to a confirmed partner", () => {
    expect(canUseCommercially(
      license({ scope: "all_partners", expiresDaysAfterEvent: 30 }),
      { userId: "sponsor-1", isConfirmedPartner: true },
      EVENT_DATE,
      new Date("2026-10-05"),
    )).toBe(false);
  });
});

describe("sanitiseLicense — the safe answer at every turn", () => {
  it("defaults the scope to the narrowest option", () => {
    expect(sanitiseLicense({}).scope).toBe("event_only");
    expect(sanitiseLicense({ scope: "everything_everywhere" }).scope).toBe("event_only");
  });

  it("treats a missing commercial opt-in as no, never as yes", () => {
    expect(sanitiseLicense({}).commercialOptIn).toBe(false);
    expect(sanitiseLicense({ commercialOptIn: "true" }).commercialOptIn).toBe(false);
    expect(sanitiseLicense({ commercialOptIn: 1 }).commercialOptIn).toBe(false);
    expect(sanitiseLicense({ commercialOptIn: true }).commercialOptIn).toBe(true);
  });

  it("defaults an unknown uploader role to participant, the most restricted one", () => {
    expect(sanitiseLicense({ createdByRole: "ceo" }).createdByRole).toBe("participant");
  });

  it("reads a zero or negative duration as indefinite rather than instantly expired", () => {
    expect(sanitiseLicense({ expiresDaysAfterEvent: 0 }).expiresDaysAfterEvent).toBeNull();
    expect(sanitiseLicense({ expiresDaysAfterEvent: -10 }).expiresDaysAfterEvent).toBeNull();
    expect(sanitiseLicense({ expiresDaysAfterEvent: "30" }).expiresDaysAfterEvent).toBe(30);
  });
});
