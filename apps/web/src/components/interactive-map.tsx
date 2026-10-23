"use client";

import { useEffect, useRef } from "react";
import { ROUTE_STYLE } from "@leakbook/core";
import { markSelected, pinElement, routeHex, routeLine, type LivePin } from "./map-pins";

// The enlarged day map, live (HIG maps.md › Best practices: "In general, make your map
// interactive"): pan and zoom, the same pins as the map image (numbers in the tech's color, the
// shop as a house), the route in the tech's color through the stops in order, and a pin and its row in the list
// selected together. Mapbox GL JS loads only when this opens, so the Schedule page never
// carries it. A muted style (light, or dark in dark mode) keeps the pins forward.

export type { LivePin } from "./map-pins";

type MapboxGl = typeof import("mapbox-gl").default;
type MapboxMap = import("mapbox-gl").Map;
type MapboxMarker = import("mapbox-gl").Marker;

export function InteractiveMap({
  company,
  token,
  pins,
  color,
  selected,
  onSelect,
  onFail,
  label,
}: {
  /** The shop, for the load permit. */
  company: string;
  token: string;
  pins: LivePin[];
  /** The tech's team color (a palette key), or null: water blue. */
  color?: string | null;
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
      const hex = routeHex(color, dark ? "dark" : "light");
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
        const line = routeLine(pins);
        if (line.length > 1) {
          made.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: line.map((p) => [p.at.lng, p.at.lat]) },
            },
          });
          // The route in the tech's color on a white casing, so it reads on any street.
          made.addLayer({
            id: "route-casing",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": ROUTE_STYLE.casingWidth },
          });
          made.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": hex, "line-width": ROUTE_STYLE.lineWidth },
          });
        }
      });
      markers.current = pins.map((p) =>
        new gl.Marker({ element: pinElement(p, hex, () => select.current(p.label)) })
          .setLngLat([p.at.lng, p.at.lat])
          .addTo(made!),
      );
      markSelected(
        markers.current.map((m) => m.getElement()),
        selected,
      );
    })();
    return () => {
      gone = true;
      markers.current = [];
      made?.remove();
      map.current = null;
    };
    // The map is made once per set of pins; selection is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, token, pins, color]);

  useEffect(() => {
    markSelected(
      markers.current.map((m) => m.getElement()),
      selected,
    );
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
