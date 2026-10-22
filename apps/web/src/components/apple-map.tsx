"use client";

import { useEffect, useRef } from "react";
import { tokens } from "@leakbook/tokens";
import {
  loadMapKit,
  mapkitToken,
  onMapKitFailure,
  startMapKit,
  type MapKit,
  type MkAnnotation,
  type MkMap,
} from "@/lib/mapkit";
import { markSelected, pinElement, routeLine, type LivePin } from "./map-pins";

// The enlarged day map on Apple Maps (owner, 2026-10-20, docs/plans/apple-maps.md), with the
// same props, pins, colors and route line as the Mapbox map it replaces: pan and zoom, numbered
// stops, the shop as a house, and a pin and its row selected together. MapKit JS comes from
// Apple's CDN only when this opens (or once the page is idle). Light and dark follow the site,
// and moves honor Reduce Motion. If MapKit can't load or the token is refused, `onFail` hands
// over to the Mapbox map. Apple's logo and legal link stay visible in the bottom corners.

export function AppleMap({
  company,
  pins,
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
      const els: HTMLElement[] = [];
      const annotations: MkAnnotation[] = pins.map((p) => {
        const el = pinElement(p, () => select.current(p.label));
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
      const line = routeLine(pins);
      const items: unknown[] = [...annotations];
      if (line.length > 1) {
        const overlay = new kit.PolylineOverlay(line.map(coord), {
          style: new kit.Style({
            strokeColor: tokens.color.brand.water,
            lineWidth: 3,
            strokeOpacity: 0.55,
            lineJoin: "round",
            lineCap: "round",
          }),
        });
        made.addOverlay(overlay);
        items.push(overlay);
      }
      made.addAnnotations(annotations);
      made.showItems(items, {
        animate: false,
        padding: new kit.Padding(56, 56, 56, 56),
        minimumSpan: new kit.CoordinateSpan(0.012, 0.012),
      });
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
      stopListening();
      theme?.disconnect();
      pinEls.current = [];
      made?.destroy();
      map.current = null;
    };
    // The map is made once per set of pins; selection is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, pins]);

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
