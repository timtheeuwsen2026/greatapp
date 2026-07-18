import { describe, expect, it } from "vitest";
import { resolveBaseUrl } from "./utils";

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
