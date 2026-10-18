import "server-only";
import { cacheLife } from "next/cache";
import { weatherKind, type Weather } from "@leakbook/core";

// The weather at the shop, from its zip code (owner: no location prompts). The zip becomes a
// point once (Zippopotam.us, GeoNames data, CC BY), then the National Weather Service gives
// the forecast: free, no key, public domain, US only. Asked at most every half hour per zip;
// anything going wrong just leaves the weather off the page.

const UA = `Sundeck Pro (${process.env.APP_BASE_URL ?? "sundeckpro"})`;

async function nws<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/geo+json" },
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  return (await res.json()) as T;
}

interface Period {
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  isDaytime: boolean;
}

const toF = (p: Period) =>
  p.temperatureUnit === "C" ? Math.round((p.temperature * 9) / 5 + 32) : p.temperature;

/** Cached per area; throws (and so caches nothing) when the service doesn't answer. */
async function forecast(lat: number, lng: number): Promise<Weather> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 1_800, expire: 3_600 });
  const point = await nws<{ properties: { forecast: string; forecastHourly: string } }>(
    `https://api.weather.gov/points/${lat},${lng}`,
  );
  const [hourly, daily] = await Promise.all([
    nws<{ properties: { periods: Period[] } }>(point.properties.forecastHourly),
    nws<{ properties: { periods: Period[] } }>(point.properties.forecast),
  ]);
  const now = hourly.properties.periods[0];
  if (!now) throw new Error("NWS: no forecast");
  const today = daily.properties.periods[0];
  return {
    tempF: toF(now),
    conditions: now.shortForecast,
    kind: weatherKind(now.shortForecast),
    isDaytime: now.isDaytime,
    highF: today?.isDaytime ? toF(today) : null,
  };
}

/** Where a US zip code is (its center). Zip codes don't move: kept for a week. */
async function zipPoint(zip: string): Promise<{ lat: number; lng: number }> {
  "use cache";
  cacheLife("weeks");
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) throw new Error(`zip ${res.status}`);
  const body = (await res.json()) as { places?: { latitude: string; longitude: string }[] };
  const place = body.places?.[0];
  if (!place) throw new Error("zip not found");
  return { lat: Number(place.latitude), lng: Number(place.longitude) };
}

/** The weather for the shop's zip code, or null. */
export async function weatherForZip(zip: string | null | undefined): Promise<Weather | null> {
  const five = /^\d{5}/.exec(zip?.trim() ?? "")?.[0];
  if (!five) return null;
  try {
    const at = await zipPoint(five);
    return await forecast(Number(at.lat.toFixed(2)), Number(at.lng.toFixed(2)));
  } catch {
    return null;
  }
}
