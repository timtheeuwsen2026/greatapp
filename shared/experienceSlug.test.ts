import { describe, expect, it, vi } from "vitest";

vi.mock("../server/storage", () => ({ storage: { getExperienceBySlug: async () => undefined } }));
const { slugifyTitle } = await import("../server/experienceSlug");

// A shared link was greatexperiences.ai/event/70ee63bb-5871-4454-89f9-7625673f5cac,
// which nobody can read in a WhatsApp message or say out loud.
describe("slugifyTitle", () => {
  it("turns a title into something readable", () => {
    expect(slugifyTitle("AFTERbreathWORK")).toBe("afterbreathwork");
    expect(slugifyTitle("Good Soles Sunday Social 5km")).toBe("good-soles-sunday-social-5km");
  });

  it("collapses punctuation and spacing into single hyphens", () => {
    expect(slugifyTitle("Shake & Stir:  The  Craft Cocktail Masterclass"))
      .toBe("shake-stir-the-craft-cocktail-masterclass");
    expect(slugifyTitle("  Sunset  Beach  Volleyball!!  ")).toBe("sunset-beach-volleyball");
  });

  it("keeps accented words instead of dropping the letters", () => {
    expect(slugifyTitle("Café Con Leche Run")).toBe("cafe-con-leche-run");
    expect(slugifyTitle("Züri Morning Yoga")).toBe("zuri-morning-yoga");
  });

  it("never produces an empty slug", () => {
    expect(slugifyTitle("")).toBe("event");
    expect(slugifyTitle("🔥🔥🔥")).toBe("event");
    expect(slugifyTitle("...")).toBe("event");
  });

  // A slug of "admin" or "checkout" would shadow a real route.
  it("refuses to take a word a route already owns", () => {
    expect(slugifyTitle("Admin")).toBe("event");
    expect(slugifyTitle("checkout")).toBe("event");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugifyTitle("A ridiculously long event title that just keeps going and going and going forever");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});
