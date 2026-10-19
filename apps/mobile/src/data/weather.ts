import { useEffect, useState } from "react";
import type { Weather } from "@leakbook/core";
import { API_URL } from "../lib/config";
import { getServices } from "../lib/services";

// The weather at the shop's zip code on Today (spec 5.1), from the website's /api/weather (the
// same National Weather Service forecast the website's Today shows). Left out offline, without
// a zip code, or when the server doesn't answer.

/** A signed-in GET to the Sundeck Pro server; null when it can't be reached or refuses. */
export async function getJson<T>(path: string): Promise<T | null> {
  if (!API_URL) return null;
  try {
    const token = await getServices().sync.accessToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; weather: Weather | null }>();
const FRESH_MS = 15 * 60_000;

export function useWeather(zip: string | null | undefined): Weather | null {
  const z = zip?.trim().slice(0, 5) ?? "";
  const valid = /^\d{5}$/.test(z);
  // Re-render once the answer is in the cache.
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!valid) return;
    const hit = cache.get(z);
    if (hit && Date.now() - hit.at < FRESH_MS) return;
    let gone = false;
    void getJson<{ weather: Weather | null }>(`/api/weather?zip=${z}`).then((r) => {
      if (!r) return;
      cache.set(z, { at: Date.now(), weather: r.weather });
      if (!gone) setVersion((v) => v + 1);
    });
    return () => {
      gone = true;
    };
  }, [z, valid]);
  return valid ? (cache.get(z)?.weather ?? null) : null;
}
