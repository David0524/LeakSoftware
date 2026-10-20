// Which map service the website draws with (owner, 2026-10-20, docs/plans/apple-maps.md):
// Apple (MapKit JS, Snapshots, address search) once the Apple keys are set, else Mapbox.
// MAP_PROVIDER=mapbox forces Mapbox; MAP_PROVIDER=apple without the keys still means Mapbox,
// since nothing could be signed. Drive times stay on Mapbox either way. Pure, so the client
// can share the type; only the server reads the environment.

export type MapProvider = "apple" | "mapbox";

type Env = Record<string, string | undefined>;

/** All three Apple Maps settings are present (never says what they are). */
export function appleMapsConfigured(env: Env = process.env): boolean {
  return Boolean(
    env.APPLE_MAPS_TEAM_ID?.trim() &&
    env.APPLE_MAPS_KEY_ID?.trim() &&
    env.APPLE_MAPS_PRIVATE_KEY?.trim(),
  );
}

export function resolveMapProvider(env: Env = process.env): MapProvider {
  if (!appleMapsConfigured(env)) return "mapbox";
  return env.MAP_PROVIDER?.trim().toLowerCase() === "mapbox" ? "mapbox" : "apple";
}

/** Whether day maps can be drawn at all: Apple, or a Mapbox key. */
export function mapsConfigured(env: Env = process.env): boolean {
  return resolveMapProvider(env) === "apple" || Boolean(env.MAPBOX_TOKEN);
}
