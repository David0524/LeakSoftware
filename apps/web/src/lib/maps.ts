import "server-only";
import { cookies, headers } from "next/headers";
import type { MapsApp } from "@leakbook/core";
import { resolveMapProvider } from "./map-provider";
import { webMapsApp } from "./web-maps-app";

/** The maps app this device opens (More › Directions open in, else by device), as /maps picks it. */
export async function mapsAppForRequest(): Promise<MapsApp> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  return webMapsApp(h.get("user-agent") ?? "", c.get("lb_maps")?.value, resolveMapProvider());
}
