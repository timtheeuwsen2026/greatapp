import { describe, expect, it } from "vitest";
import { suggestedCityForIp } from "../visitorCity";

// 66.24: the visitor's city from the country of their internet address,
// looked up on our own server.
describe("visitor city", () => {
  it("offers Amsterdam to a Dutch address and Barcelona to a Spanish one", () => {
    expect(suggestedCityForIp("145.131.0.1")).toEqual({ city: "Amsterdam", country: "NL" });
    expect(suggestedCityForIp("::ffff:88.26.0.1")).toEqual({ city: "Barcelona", country: "ES" });
  });

  it("offers nothing when the country has no live city or is unknown", () => {
    expect(suggestedCityForIp("8.8.8.8").city).toBeNull();
    expect(suggestedCityForIp("127.0.0.1")).toEqual({ city: null, country: null });
    expect(suggestedCityForIp(undefined)).toEqual({ city: null, country: null });
  });
});

describe("visitor address behind Railway's edge", () => {
  it("reads the visitor, not the edge", async () => {
    const { visitorIp } = await import("../visitorCity");
    expect(visitorIp({ headers: { "x-real-ip": "145.131.0.1" }, ip: "10.0.0.1" })).toBe("145.131.0.1");
    expect(visitorIp({ headers: { "x-forwarded-for": "88.26.0.1, 103.1.1.1" }, ip: "103.1.1.1" })).toBe("88.26.0.1");
    expect(visitorIp({ headers: {}, ip: "8.8.8.8" })).toBe("8.8.8.8");
  });
});
