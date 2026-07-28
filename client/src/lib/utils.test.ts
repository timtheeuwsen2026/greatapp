import { describe, expect, it } from "vitest";
import { resolveBaseUrl, getVenueImage } from "./utils";

// V14: venue photos rendered as blank spaces in the admin, creator and venue
// dashboards. Each read a different field — logoUrl, venue.images[0] — and the
// Venue Builder saves neither; it writes coverImageUrl and galleryImages.
describe("getVenueImage", () => {
  const SUPABASE = "https://drjkorchthdnyqnvcfnf.supabase.co/storage/v1/object/public/uploads/a/images/b.jpg";

  it("uses the cover photo the venue builder actually saves", () => {
    expect(getVenueImage({ coverImageUrl: SUPABASE, logoUrl: null })).toBe(SUPABASE);
  });

  it("falls back to the first gallery photo when there is no cover", () => {
    expect(getVenueImage({ coverImageUrl: null, galleryImages: [SUPABASE] })).toBe(SUPABASE);
  });

  it("falls back to the logo last", () => {
    expect(getVenueImage({ coverImageUrl: null, galleryImages: [], logoUrl: SUPABASE })).toBe(SUPABASE);
  });

  it("prefers the cover photo over the logo", () => {
    const logo = "https://example.test/logo.png";
    expect(getVenueImage({ coverImageUrl: SUPABASE, logoUrl: logo })).toBe(SUPABASE);
  });

  it("returns null when a venue genuinely has no photo, so the placeholder shows", () => {
    expect(getVenueImage({ coverImageUrl: null, galleryImages: [], logoUrl: null })).toBeNull();
    expect(getVenueImage({ coverImageUrl: "  ", logoUrl: "" })).toBeNull();
    expect(getVenueImage(null)).toBeNull();
  });
});

describe("resolveBaseUrl", () => {
  it("uses the configured public URL", () => {
    expect(resolveBaseUrl("https://app.great.example/", "https://runtime.example", true))
      .toBe("https://app.great.example");
  });

  it("never uses a configured localhost URL on a public production origin", () => {
    expect(resolveBaseUrl("http://localhost:3000", "https://app.great.example", true))
      .toBe("https://app.great.example");
  });

  it("uses the runtime origin when no URL is configured", () => {
    expect(resolveBaseUrl(undefined, "http://localhost:4000", false))
      .toBe("http://localhost:4000");
  });
});
