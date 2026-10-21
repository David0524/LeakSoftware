import { mapsAppFor, type MapsApp } from "@leakbook/core";
import type { MapProvider } from "./map-provider";

// The website's directions links (docs/plans/apple-maps.md): on Apple Maps, a computer opens
// directions on maps.apple.com (it works in every desktop browser). Phones and tablets keep
// core's choice (Apple Maps on Apple devices, else Google Maps), and a saved choice (More ›
// Directions open in) always wins. Core's mapsAppFor stays as it is for the phone apps.

/** A phone or tablet, by its browser's user agent (iPads that report a Mac count as computers). */
export function isHandheld(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent);
}

export function webMapsApp(
  userAgent: string,
  choice: string | null | undefined,
  provider: MapProvider,
): MapsApp {
  if (choice === "apple" || choice === "google") return choice;
  if (provider === "apple" && !isHandheld(userAgent)) return "apple";
  return mapsAppFor(userAgent, choice);
}
