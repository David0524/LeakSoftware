"use client";

import { useEffect, useRef } from "react";
import { tokens } from "@leakbook/tokens";
import type { LatLng, PinTone } from "@leakbook/core";

// The enlarged day map, live (HIG maps.md › Best practices: "In general, make your map
// interactive"): pan and zoom, the same pins as the map image (numbers in their colors, the shop
// as a house), a thin line through the stops in order, and a pin and its row in the list
// selected together. Mapbox GL JS loads only when this opens, so the Schedule page never
// carries it. A muted style (light, or dark in dark mode) keeps the pins forward.

export interface LivePin {
  label: string;
  at: LatLng;
  tone: PinTone;
}

const TONE_COLOR: Record<PinTone, string> = {
  shop: tokens.color.brand.navy,
  todo: tokens.color.brand.water,
  current: tokens.color.brand.safety,
  done: tokens.color.status.pass,
};

const HOUSE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></svg>';

type MapboxGl = typeof import("mapbox-gl").default;
type MapboxMap = import("mapbox-gl").Map;
type MapboxMarker = import("mapbox-gl").Marker;

function pinElement(pin: LivePin, onSelect: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.label = pin.label;
  el.setAttribute("aria-label", pin.tone === "shop" ? "The shop" : `Stop ${pin.label}`);
  // 44 pt to tap; the visible dot inside is 28.
  el.style.cssText =
    "width:44px;height:44px;display:grid;place-items:center;background:none;border:0;padding:0;cursor:pointer";
  const dot = document.createElement("span");
  dot.style.cssText = `width:28px;height:28px;border-radius:9999px;display:grid;place-items:center;background:${TONE_COLOR[pin.tone]};color:#fff;font:700 13px/1 system-ui,-apple-system,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgb(0 0 0/.35);transition:transform .15s ease`;
  if (pin.tone === "shop") dot.innerHTML = HOUSE;
  else dot.textContent = pin.label;
  el.appendChild(dot);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect();
  });
  return el;
}

/** Marks the selected stop's pin: larger, with a ring. */
function markSelected(markers: MapboxMarker[], selected: string | null) {
  for (const m of markers) {
    const el = m.getElement();
    const dot = el.firstElementChild as HTMLElement | null;
    const on = el.dataset.label === selected && selected !== "";
    el.setAttribute("aria-pressed", String(on));
    if (dot) {
      dot.style.transform = on ? "scale(1.25)" : "";
      dot.style.outline = on ? `3px solid ${tokens.color.brand.water}` : "";
      dot.style.outlineOffset = on ? "2px" : "";
    }
    el.style.zIndex = on ? "2" : "";
  }
}

export function InteractiveMap({
  company,
  token,
  pins,
  selected,
  onSelect,
  onFail,
  label,
}: {
  /** The shop, for the load permit. */
  company: string;
  token: string;
  pins: LivePin[];
  /** The selected stop's label ("1", "2", …), or null. */
  selected: string | null;
  onSelect: (label: string) => void;
  /** Mapbox couldn't load (no WebGL, blocked, bad token): show the image instead. */
  onFail: () => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef<MapboxMarker[]>([]);
  const select = useRef(onSelect);
  const fail = useRef(onFail);
  useEffect(() => {
    select.current = onSelect;
    fail.current = onFail;
  });

  useEffect(() => {
    let gone = false;
    let made: MapboxMap | null = null;
    (async () => {
      // Each live map counts against Mapbox's monthly free tier for every shop together (owner,
      // 2026-10-20: "ensure I do not surpass the free tier"): ask first, once per opening.
      try {
        const permit = await fetch("/api/map/load", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ company_id: company }),
        });
        if (permit.status !== 204) {
          if (!gone) fail.current();
          return;
        }
      } catch {
        if (!gone) fail.current();
        return;
      }
      if (gone) return;
      let gl: MapboxGl;
      try {
        const [mod] = await Promise.all([
          import("mapbox-gl"),
          import("mapbox-gl/dist/mapbox-gl.css"),
        ]);
        gl = mod.default;
      } catch {
        if (!gone) fail.current();
        return;
      }
      if (gone || !box.current) return;
      if (typeof gl.supported === "function" && !gl.supported()) return fail.current();
      const dark = document.documentElement.dataset.theme === "dark";
      gl.accessToken = token;
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      try {
        made = new gl.Map({
          container: box.current,
          style: dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11",
          bounds: boundsOf(pins),
          fitBoundsOptions: { padding: 56, maxZoom: 14 },
          attributionControl: true,
          cooperativeGestures: false,
          fadeDuration: reduce ? 0 : 300,
        });
      } catch {
        return fail.current();
      }
      map.current = made;
      made.addControl(new gl.NavigationControl({ showCompass: false }), "top-right");
      made.on("error", (e) => {
        // A bad token or blocked style: nothing would draw.
        const status = (e.error as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403) fail.current();
      });
      made.on("load", () => {
        if (!made) return;
        const shop = pins.find((p) => p.tone === "shop");
        const stops = pins.filter((p) => p.tone !== "shop");
        const line = [...(shop ? [shop] : []), ...stops, ...(shop && stops.length ? [shop] : [])];
        if (line.length > 1) {
          made.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: line.map((p) => [p.at.lng, p.at.lat]) },
            },
          });
          made.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": tokens.color.brand.water,
              "line-width": 3,
              "line-opacity": 0.55,
            },
          });
        }
      });
      markers.current = pins.map((p) =>
        new gl.Marker({ element: pinElement(p, () => select.current(p.label)) })
          .setLngLat([p.at.lng, p.at.lat])
          .addTo(made!),
      );
      markSelected(markers.current, selected);
    })();
    return () => {
      gone = true;
      markers.current = [];
      made?.remove();
      map.current = null;
    };
    // The map is made once per set of pins; selection is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, token, pins]);

  useEffect(() => {
    markSelected(markers.current, selected);
    const pin = pins.find((p) => p.label === selected && p.tone !== "shop");
    const m = map.current;
    if (pin && m && !m.getBounds()?.contains([pin.at.lng, pin.at.lat]))
      m.easeTo({ center: [pin.at.lng, pin.at.lat] });
  }, [selected, pins]);

  return (
    <>
      <p
        aria-hidden="true"
        className="absolute inset-0 grid place-items-center text-[0.9375rem] text-text-muted"
      >
        Loading map…
      </p>
      <div
        ref={box}
        role="region"
        aria-label={label}
        className="absolute inset-0 size-full [&_.mapboxgl-ctrl-attrib]:text-[0.75rem]"
      />
    </>
  );
}

function boundsOf(pins: LivePin[]): [[number, number], [number, number]] {
  const lngs = pins.map((p) => p.at.lng);
  const lats = pins.map((p) => p.at.lat);
  const pad = pins.length === 1 ? 0.01 : 0;
  return [
    [Math.min(...lngs) - pad, Math.min(...lats) - pad],
    [Math.max(...lngs) + pad, Math.max(...lats) + pad],
  ];
}
