import { describe, expect, it, vi } from "vitest";
import { HAPTIC_MOMENTS, HAPTIC_WEB_MS, buzz } from "../src/lib/haptics";

describe("haptics on the website", () => {
  it("buzzes ten milliseconds where the browser can vibrate", () => {
    const vibrate = vi.fn(() => true);
    expect(
      buzz("jobCompleted", { navigator: { vibrate }, matchMedia: () => ({ matches: false }) }),
    ).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_WEB_MS);
    expect(HAPTIC_WEB_MS).toBe(10);
  });

  it("does nothing without a vibration motor", () => {
    expect(buzz("reportSent", { navigator: {}, matchMedia: () => ({ matches: false }) })).toBe(
      false,
    );
    expect(buzz("reportSent", undefined)).toBe(false);
  });

  it("does nothing when reduced motion is asked for", () => {
    const vibrate = vi.fn(() => true);
    expect(
      buzz("paymentRecorded", { navigator: { vibrate }, matchMedia: () => ({ matches: true }) }),
    ).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("lists the same six moments as the apps", () => {
    expect(Object.keys(HAPTIC_MOMENTS)).toEqual([
      "checklistItemDone",
      "chemicalAdded",
      "allChemicalsAdded",
      "jobCompleted",
      "reportSent",
      "paymentRecorded",
    ]);
  });
});
