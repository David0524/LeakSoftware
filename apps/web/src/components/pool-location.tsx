"use client";

import { useState, useTransition } from "react";
import { setPoolLocation, setShopLocation, type RouteResult } from "@/app/actions/routes";
import { buttonClass } from "./ui";

function here(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser can’t share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "Location is off for this site. Turn it on in the browser’s settings."
              : "Couldn’t find where you are. Try again outside.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

/**
 * Use the phone's GPS for a map location: at the pool (exact, and free; better than the
 * address for big lots and new builds), or at the shop for where routes start.
 */
export function MarkLocationHere({
  target,
  label,
}: {
  target: { property: string } | "shop";
  label: string;
}) {
  const [result, setResult] = useState<RouteResult>({});
  const [pending, start] = useTransition();
  function mark() {
    start(async () => {
      try {
        const p = await here();
        setResult(
          target === "shop"
            ? await setShopLocation(p.lat, p.lng)
            : await setPoolLocation(target.property, p.lat, p.lng),
        );
      } catch (e) {
        setResult({ error: (e as Error).message });
      }
    });
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3">
      <button
        type="button"
        className={buttonClass("quiet", "px-2")}
        onClick={mark}
        disabled={pending}
      >
        {pending ? "Finding You…" : label}
      </button>
      <span role="status" className="text-[15px]">
        {result.error ? (
          <span className="text-status-fail">{result.error}</span>
        ) : (
          <span className="text-status-pass">{result.message}</span>
        )}
      </span>
    </span>
  );
}
