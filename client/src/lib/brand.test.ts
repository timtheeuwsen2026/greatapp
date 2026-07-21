import { describe, expect, it } from "vitest";
import { PUBLIC_APP_URL, PUBLIC_BRAND_DOMAIN } from "./brand";

describe("public brand URLs", () => {
  it("uses the production Great Experiences domain", () => {
    expect(PUBLIC_BRAND_DOMAIN).toBe("greatexperiences.ai");
    expect(PUBLIC_APP_URL).toBe("https://www.greatexperiences.ai");
    expect(PUBLIC_BRAND_DOMAIN).not.toContain("greatapp.ai");
    expect(PUBLIC_BRAND_DOMAIN).not.toContain("great.app");
  });
});
