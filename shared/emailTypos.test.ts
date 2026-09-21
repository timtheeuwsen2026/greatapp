import { describe, expect, it } from "vitest";
import { checkEmailForTypos } from "./emailTypos";

describe("checkEmailForTypos", () => {
  // Both of these are real stuck sign-ups from production.
  it("refuses a domain with no ending, and says what was probably meant", () => {
    const result = checkEmailForTypos("denise@gmail");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("denise@gmail.com");
  });

  it("questions a near-miss of a common provider without refusing it", () => {
    expect(checkEmailForTypos("jon@nylworld.com")).toEqual({
      ok: true,
      suggestion: "jon@ntlworld.com",
    });
    expect(checkEmailForTypos("ana@gmial.com")).toEqual({ ok: true, suggestion: "ana@gmail.com" });
    expect(checkEmailForTypos("ana@hotmial.com")).toEqual({ ok: true, suggestion: "ana@hotmail.com" });
  });

  it("leaves a correct or unfamiliar address alone", () => {
    expect(checkEmailForTypos("chris@gmail.com")).toEqual({ ok: true });
    // A real company domain is nowhere near a common provider.
    expect(checkEmailForTypos("info@strng.club")).toEqual({ ok: true });
    expect(checkEmailForTypos("co@mapabakery.com")).toEqual({ ok: true });
  });

  it("refuses something that is not an address at all", () => {
    expect(checkEmailForTypos("chris").ok).toBe(false);
    expect(checkEmailForTypos("@gmail.com").ok).toBe(false);
    expect(checkEmailForTypos("chris@").ok).toBe(false);
  });
});
