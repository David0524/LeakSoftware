import { describe, expect, it } from "vitest";
import { weatherKind } from "../src";

describe("weather icons", () => {
  it("picks the icon for the National Weather Service's words", () => {
    expect(weatherKind("Sunny")).toBe("clear");
    expect(weatherKind("Clear")).toBe("clear");
    expect(weatherKind("Mostly Sunny")).toBe("partly");
    expect(weatherKind("Partly Cloudy")).toBe("partly");
    expect(weatherKind("Mostly Cloudy")).toBe("cloudy");
    expect(weatherKind("Chance Rain Showers")).toBe("rain");
    expect(weatherKind("Slight Chance Showers And Thunderstorms")).toBe("storm");
    expect(weatherKind("Blowing Dust")).toBe("dust");
    expect(weatherKind("Patchy Fog")).toBe("fog");
    expect(weatherKind("Sunny and Breezy")).toBe("wind");
    expect(weatherKind("Light Snow")).toBe("snow");
  });
});
