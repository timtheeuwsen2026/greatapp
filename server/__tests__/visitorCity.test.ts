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
