import { describe, expect, it } from "vitest";
import { poolSummary } from "./pool-equipment";

describe("poolSummary", () => {
  it("lists what's known, in order", () => {
    expect(
      poolSummary({
        pool_type: "gunite_plaster",
        has_spa: true,
        approx_gallons: 20000,
        sanitizer: "salt",
        heater: "gas",
        has_solar_heater: true,
      }),
    ).toBe("Gunite / plaster · Pool and spa · 20,000 gallons · Salt · Gas heater · Solar heater");
  });
  it("leaves out what isn't", () => {
    expect(poolSummary({ has_spa: false })).toBe("Pool");
    expect(poolSummary({ has_spa: false, heater: "none", sanitizer: "other" })).toBe(
      "Pool · Other sanitizer · No heater",
    );
  });
});
