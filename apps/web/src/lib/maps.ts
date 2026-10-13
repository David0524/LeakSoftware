import "server-only";
import { cookies, headers } from "next/headers";
import { mapsAppFor, type MapsApp } from "@leakbook/core";

/** The maps app this device opens (More › Directions open in, else by device), as /maps picks it. */
export async function mapsAppForRequest(): Promise<MapsApp> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  return mapsAppFor(h.get("user-agent") ?? "", c.get("lb_maps")?.value);
}
