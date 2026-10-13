import { type NextRequest, NextResponse } from "next/server";
import { mapsAppFor, mapsLinks } from "@leakbook/core";

/**
 * Every address links here; this sends it on to directions in Apple Maps or Google Maps.
 * Deciding on the server, from the device's saved choice (More › Directions open in) or its
 * browser, means the link is the same from the first tap: deciding in the page swapped it
 * after loading, so early taps went to the other app. Only ever redirects to Apple or
 * Google Maps.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const address = (params.get("to") ?? "").slice(0, 300);
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const located =
    params.has("lat") &&
    params.has("lng") &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  if (!address && !located) return new NextResponse("No address.", { status: 400 });
  const links = mapsLinks({ address, location: located ? { lat, lng } : null });
  const app = mapsAppFor(
    request.headers.get("user-agent") ?? "",
    request.cookies.get("lb_maps")?.value,
  );
  return NextResponse.redirect(links[app], 302);
}
