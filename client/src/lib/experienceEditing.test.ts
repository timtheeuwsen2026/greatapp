import { afterEach, describe, expect, it, vi } from "vitest";
import { experienceToBuilderFields, fetchJsonOrNull } from "./experienceEditing";

const PLATFORM_PCT = 15;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(responses: Record<string, { ok: boolean; body?: any }>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    const match = responses[url] ?? { ok: false };
    return {
      ok: match.ok,
      status: match.ok ? 200 : 404,
      json: async () => match.body,
      text: async () => JSON.stringify(match.body ?? { message: "Not found" }),
    } as any;
  }));
  return calls;
}

// V1: "when i want to edit it, its blank". The builder probes the drafts table
// first and the experiences table second, but the shared apiRequest helper
// throws on any non-2xx — so a published event's 404 from /experience-drafts
// aborted the whole load before the second lookup ran, and the creator got an
// empty form with a toast.
describe("fetchJsonOrNull", () => {
  it("returns null on a miss instead of throwing, so the next lookup runs", async () => {
    stubFetch({
      "/api/experience-drafts/exp-1": { ok: false },
      "/api/experiences/exp-1": { ok: true, body: { id: "exp-1", title: "Noor Coffee Morning" } },
    });

    const draft = await fetchJsonOrNull("/api/experience-drafts/exp-1");
    expect(draft).toBeNull();

    const experience = await fetchJsonOrNull("/api/experiences/exp-1");
    expect(experience?.title).toBe("Noor Coffee Morning");
  });

  it("returns the parsed body on a hit", async () => {
    stubFetch({ "/api/experience-drafts/d-1": { ok: true, body: { id: "d-1", status: "draft" } } });
    await expect(fetchJsonOrNull("/api/experience-drafts/d-1")).resolves.toEqual({ id: "d-1", status: "draft" });
  });
});

describe("experienceToBuilderFields", () => {
  const experience = {
    id: "exp-1",
    title: "Noor Coffee Morning",
    experienceType: "one-day",
    linkedVenueId: "venue-9",
    venueType: null,
    termsAndConditions: "Bring your own mug.",
    services: [{ id: "chef", name: "Chef" }, { id: "photographer", name: "Photographer" }],
    amenities: [{ id: "wifi", name: "Wi-Fi" }],
    price: "24.50",
    pricePerPerson: "24.50",
    maxParticipants: 40,
    standingCapacity: "40",
    seatedCapacity: null,
    minimumParticipants: 8,
    startDate: "2026-09-10T00:00:00.000Z",
    mvgDeadline: "2026-09-05T00:00:00.000Z",
    depositPercentage: "20.00",
    creatorRevenuePercentage: "85.00",
    platformRevenuePercentage: "15.00",
    // Projections the detail endpoint adds on read.
    stats: { views: 12 },
    bookings: [{ id: "b-1" }],
    reviews: [],
    mvgProgressData: { currentBookings: 3 },
    lifecycleStatus: "forming",
    creatorName: "Timothy",
  };

  const mapped = experienceToBuilderFields(experience, PLATFORM_PCT) as any;

  it("maps the columns the builder names differently", () => {
    expect(mapped.type).toBe("one-day");
    expect(mapped.selectedVenueId).toBe("venue-9");
    expect(mapped.customTerms).toBe("Bring your own mug.");
  });

  it("falls back to catalog when a linked venue predates the venueType column", () => {
    expect(mapped.venueType).toBe("catalog");
  });

  it("turns service and amenity objects back into the id lists the steps bind to", () => {
    expect(mapped.selectedServiceIds).toEqual(["chef", "photographer"]);
    expect(mapped.selectedAmenityIds).toEqual(["wifi"]);
  });

  it("coerces decimal columns to numbers", () => {
    expect(mapped.price).toBe(24.5);
    expect(mapped.pricePerPerson).toBe(24.5);
    expect(mapped.standingCapacity).toBe(40);
    expect(mapped.depositPercentage).toBe(20);
    expect(mapped.platformRevenuePercentage).toBe(15);
  });

  it("rebuilds the MVG deadline as the number of days the step edits", () => {
    expect(mapped.mvgDeadlineDays).toBe(5);
  });

  it("drops the read-only projections so they are never echoed back on save", () => {
    for (const key of ["stats", "bookings", "reviews", "mvgProgressData", "lifecycleStatus", "creatorName"]) {
      expect(mapped).not.toHaveProperty(key);
    }
  });

  it("treats the terms as already accepted, so saving an edit is not re-gated", () => {
    expect(mapped.termsAccepted).toBe(true);
  });

  it("defaults the deadline when the event never carried one", () => {
    const withoutDeadline = experienceToBuilderFields(
      { ...experience, mvgDeadline: null },
      PLATFORM_PCT,
    ) as any;
    expect(withoutDeadline.mvgDeadlineDays).toBe(7);
  });

  it("reads an unlinked event with a typed-in address as a manual venue", () => {
    const manual = experienceToBuilderFields(
      { ...experience, linkedVenueId: null, venueType: null, manualVenueName: "Noor Coffee" },
      PLATFORM_PCT,
    ) as any;
    expect(manual.venueType).toBe("manual");
    expect(manual.selectedVenueId).toBe("");
  });
});
