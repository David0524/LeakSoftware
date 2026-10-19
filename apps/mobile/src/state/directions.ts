import { useSyncExternalStore } from "react";
import { Linking, Platform } from "react-native";
import { mapsLinks, nativeMapsUrl, type MapPlace, type MapsApp } from "@leakbook/core";
import { getServices } from "../lib/services";

// More › On This Device › Directions open in (spec 5.8): a setting on this phone. Automatic
// is the phone's own maps app (Apple Maps on iPhone; on Android whatever opens map links).

export type DirectionsChoice = "automatic" | MapsApp;
const KEY = "directions_app";
const listeners = new Set<() => void>();

function read(): DirectionsChoice {
  const v = getServices().kv.get(KEY);
  return v === "apple" || v === "google" ? v : "automatic";
}

export function useDirectionsChoice(): [DirectionsChoice, (v: DirectionsChoice) => void] {
  const value = useSyncExternalStore((l) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, read);
  return [
    value,
    (v) => {
      getServices().kv.set(KEY, v);
      for (const l of listeners) l();
    },
  ];
}

/** The maps app a day's route opens in. */
export function mapsAppFor(choice: DirectionsChoice): MapsApp {
  if (choice !== "automatic") return choice;
  return Platform.OS === "ios" ? "apple" : "google";
}

/** Directions to one place in the chosen app. */
export function openDirections(place: MapPlace, choice: DirectionsChoice) {
  const url =
    choice === "automatic"
      ? nativeMapsUrl(place, Platform.OS)
      : choice === "apple"
        ? mapsLinks(place).apple
        : mapsLinks(place).google;
  void Linking.openURL(url);
}
