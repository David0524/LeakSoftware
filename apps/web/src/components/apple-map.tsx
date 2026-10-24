"use client";

import { useEffect, useRef } from "react";
import { mapView, viewSpan, zoomForSpan } from "@leakbook/core";
import {
  loadMapKit,
  mapkitToken,
  onMapKitFailure,
  startMapKit,
  type MapKit,
  type MkAnnotation,
  type MkMap,
} from "@/lib/mapkit";
import {
  fetchRoutePath,
  liveRouteSizes,
  markSelected,
  pageTheme,
  pinElement,
  routeHex,
  routeLine,
  spreadLivePins,
  stylePin,
  type LivePin,
} from "./map-pins";

// The enlarged day map on Apple Maps (owner, 2026-10-20, docs/plans/apple-maps.md), with the
// same props, pins, colors and route line as the Mapbox map it replaces: pan and zoom, numbered
// stops, the shop as a house, and a pin and its row selected together. MapKit JS comes from
// Apple's CDN only when this opens (or once the page is idle). Light and dark follow the site,
// and moves honor Reduce Motion. If MapKit can't load or the token is refused, `onFail` hands
// over to the Mapbox map. Apple's logo and legal link stay visible in the bottom corners. Since
// 2026-10-23 (owner) the route follows the roads (Apple's paths, from /api/map/path; straight
// until they come, or where there's none), and its line and pins shrink as the map zooms out.
// Since 2026-10-24 (owner: "the stops aren't numbered") every pin keeps its number, and pins
// too close at the map's zoom are drawn apart with a line back to their spot (spreadLivePins).

export function AppleMap({
  company,
  pins,
  color,
  selected,
  onSelect,
  onFail,
  label,
}: {
  /** The shop, for the token (counted against Apple's free allowance). */
  company: string;
  /** Kept for the same props as the Mapbox map; Apple's token comes from the server. */
  token?: string;
  pins: LivePin[];
  /** The tech's team color (a palette key), or null: water blue. */
  color?: string | null;
  /** The selected stop's label ("1", "2", …), or null. */
  selected: string | null;
  onSelect: (label: string) => void;
  /** MapKit couldn't load or was refused: show the Mapbox map instead. */
  onFail: () => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MkMap | null>(null);
  const mk = useRef<MapKit | null>(null);
  const pinEls = useRef<HTMLElement[]>([]);
  const select = useRef(onSelect);
  const fail = useRef(onFail);
  useEffect(() => {
    select.current = onSelect;
    fail.current = onFail;
  });

  useEffect(() => {
    let gone = false;
    let made: MkMap | null = null;
    let theme: MutationObserver | null = null;
    const stop = new AbortController();
    const stopListening = onMapKitFailure(() => {
      if (!gone) fail.current();
    });
    (async () => {
      let kit: MapKit;
      try {
        // The token first: a refusal (signed out, used up, not set up) means the Mapbox map.
        const [loaded, token] = await Promise.all([loadMapKit(), mapkitToken(company)]);
        if (!token) {
          if (!gone) fail.current();
          return;
        }
        kit = loaded;
      } catch {
        if (!gone) fail.current();
        return;
      }
      if (gone || !box.current) return;
      mk.current = kit;
      const dark = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
      try {
        startMapKit(kit);
        made = new kit.Map(box.current, {
          colorScheme: dark(),
          isRotationEnabled: false,
          showsMapTypeControl: false,
          showsZoomControl: true,
          showsCompass: kit.FeatureVisibility?.Hidden ?? "hidden",
          // The pins stay forward, as on the muted Mapbox style.
          ...(kit.PointOfInterestFilter
            ? { pointOfInterestFilter: kit.PointOfInterestFilter.excludingAllCategories }
            : { showsPointsOfInterest: false }),
        });
      } catch {
        return fail.current();
      }
      map.current = made;
      const coord = (p: LivePin) => new kit.Coordinate(p.at.lat, p.at.lng);
      const hex = routeHex(color, pageTheme());
      const els: HTMLElement[] = [];
      const annotations: MkAnnotation[] = pins.map((p) => {
        const el = pinElement(p, hex, () => select.current(p.label));
        els.push(el);
        return new kit.Annotation(coord(p), () => el, {
          // The 44 pt button's middle sits on the place. MapKit anchors the bottom middle, and a
          // positive y moved the pins up a whole pin (owner, 2026-10-22: "The numbers on the map
          // don't sit on points"), so half a pin the other way.
          anchorOffset: new DOMPoint(0, -22),
          calloutEnabled: false,
          animates: false,
          accessibilityLabel: el.getAttribute("aria-label"),
          data: { label: p.label },
        });
      });
      pinEls.current = els;
      const line = routeLine(pins).map((p) => p.at);
      // The route's sizes at the map's zoom (owner, 2026-10-23: smaller when zoomed out).
      const sizes = () =>
        liveRouteSizes(
          made?.region?.span?.longitudeDelta ?? 0,
          box.current?.clientWidth ?? 0,
          pins,
        );
      // What's drawn: the casing and line overlays, at the line's width, along `path`.
      const route = { casing: null as unknown, line: null as unknown, width: 0, path: line };
      // The route in the tech's color on a white casing, so it reads on any street.
      const drawRoute = (path: { lat: number; lng: number }[]) => {
        if (!made || path.length < 2) return;
        const s = sizes();
        const stroke = (strokeColor: string, lineWidth: number) =>
          new kit.PolylineOverlay(
            path.map((p) => new kit.Coordinate(p.lat, p.lng)),
            {
              style: new kit.Style({
                strokeColor,
                lineWidth,
                strokeOpacity: 1,
                lineJoin: "round",
                lineCap: "round",
              }),
            },
          );
        const casing = stroke("#ffffff", s.casingWidth);
        const stroked = stroke(hex, s.lineWidth);
        if (route.line) {
          made.removeOverlay(route.casing);
          made.removeOverlay(route.line);
        }
        made.addOverlay(casing);
        made.addOverlay(stroked);
        Object.assign(route, { casing, line: stroked, width: s.lineWidth, path });
      };
      if (line.length > 1) drawRoute(line);
      // Restyled as the map zooms, once a frame at most.
      let frame = 0;
      const restyle = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!made || gone) return;
          const s = sizes();
          for (const el of els) stylePin(el, s);
          spreadLivePins(
            els,
            pins,
            zoomForSpan(made.region?.span?.longitudeDelta ?? 0, box.current?.clientWidth ?? 0),
            s,
          );
          if (route.line && route.width !== s.lineWidth) drawRoute(route.path);
        });
      };
      made.addEventListener("region-change-end", restyle);
      made.addEventListener("zoom-end", restyle);
      // The road path, once the server has it.
      if (line.length > 1)
        void fetchRoutePath(company, pins, "apple", stop.signal).then((path) => {
          const same =
            path?.length === route.path.length &&
            path.every((p, i) => p.lat === route.path[i]!.lat && p.lng === route.path[i]!.lng);
          if (path && !same && !gone) drawRoute(path);
        });
      made.addAnnotations(annotations);
      // Framed as the map images are (core mapView; owner, 2026-10-24: tight, every pin whole).
      const size = { w: box.current?.clientWidth || 640, h: box.current?.clientHeight || 480 };
      const view = mapView(pins, size);
      const span = viewSpan(view, size);
      made.setRegionAnimated(
        new kit.CoordinateRegion(
          new kit.Coordinate(view.center.lat, view.center.lng),
          new kit.CoordinateSpan(span.latDelta, span.lngDelta),
        ),
        false,
      );
      restyle();
      made.addEventListener("select", (e) => {
        const l = e.annotation?.data?.label;
        if (typeof l === "string") select.current(l);
      });
      markSelected(els, selected);
      // Light and dark follow the site's appearance as it changes.
      theme = new MutationObserver(() => {
        if (made) made.colorScheme = dark();
      });
      theme.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    })();
    return () => {
      gone = true;
      stop.abort();
      stopListening();
      theme?.disconnect();
      pinEls.current = [];
      made?.destroy();
      map.current = null;
    };
    // The map is made once per set of pins; selection is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, pins, color]);

  useEffect(() => {
    markSelected(pinEls.current, selected);
    const pin = pins.find((p) => p.label === selected && p.tone !== "shop");
    const m = map.current;
    const kit = mk.current;
    if (!pin || !m || !kit) return;
    const r = m.region.toBoundingRegion();
    const inside =
      pin.at.lat <= r.northLatitude &&
      pin.at.lat >= r.southLatitude &&
      pin.at.lng <= r.eastLongitude &&
      pin.at.lng >= r.westLongitude;
    if (!inside)
      m.setCenterAnimated(
        new kit.Coordinate(pin.at.lat, pin.at.lng),
        !matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
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
        data-testid="apple-map"
        className="absolute inset-0 size-full"
      />
    </>
  );
}
