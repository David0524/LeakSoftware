"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { decodePins } from "@leakbook/core";
import { mapAlt, mapSrc, missingNote } from "@/lib/day-map";
import { ExpandIcon } from "./icons";
import { InteractiveMap } from "./interactive-map";
import { Sheet } from "./sheet";
import { cx, iconButtonClass } from "./ui";

// A day's map on Schedule (owner, 2026-10-20, docs/plans/route-maps.md: "the maps up top for
// route building"): the shop and the stops as numbered pins in route order, drawn by the server
// (GET /api/map). The box keeps its size while the image loads, so nothing below it moves. If
// the image can't be drawn (maps used up for the day, Mapbox down), it steps aside with one
// quiet line. Enlarge opens a large map beside the day's stops.

/** The day's stops, for Enlarge's list (numbered by their place in the day, as the pins are). */
export interface MapListStop {
  id: string;
  time: string | null;
  customer: string;
  /** Routes (no times): a line under the customer, such as the address. */
  detail?: string;
}

/** Phones: whether day maps are open, remembered on this device (owner decision 4). */
const OPEN_KEY = "sundeck.schedule.dayMapOpen";

function readOpen(): boolean {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    return v === null ? openHere : v !== "0";
  } catch {
    return openHere;
  }
}

let openHere = true;
const OPEN_EVENT = "sundeck:day-map-open";

function writeOpen(open: boolean) {
  openHere = open;
  // The hint the page reads before it's drawn (lib/theme.ts), so a folded map is folded from
  // the first frame instead of folding once the page is live (owner, 2026-10-20: smooth).
  if (open) delete document.documentElement.dataset.mapsFolded;
  else document.documentElement.dataset.mapsFolded = "";
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Storage blocked: this page keeps it until it reloads.
  }
  dispatchEvent(new Event(OPEN_EVENT));
}

function subscribeOpen(fn: () => void) {
  addEventListener(OPEN_EVENT, fn);
  addEventListener("storage", fn);
  return () => {
    removeEventListener(OPEN_EVENT, fn);
    removeEventListener("storage", fn);
  };
}

/** The map image in a box of fixed shape; reports when it can't be drawn. */
/** The page's appearance (data-theme, set before paint), or null before the page is live. */
function subscribeTheme(fn: () => void) {
  const o = new MutationObserver(fn);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => o.disconnect();
}
const readTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function MapImage({
  src,
  alt,
  ratio,
  width,
  height,
  lazy,
  onFail,
}: {
  src: string;
  alt: string;
  ratio: string;
  width: number;
  height: number;
  lazy: boolean;
  onFail: () => void;
}) {
  const img = useRef<HTMLImageElement>(null);
  // Dark mode gets the dark map. It's picked once the page is live, so one image loads, never
  // a light one first: each counts against Mapbox's free tier.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => null);
  const url = theme === null ? null : theme === "dark" ? `${src}&theme=dark` : src;
  // An image that failed before the page came alive fired its error too early for React.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0 && el.currentSrc) onFail();
  }, [url, onFail]);
  return (
    <div className={cx("relative overflow-hidden rounded-[1.25rem] bg-fill", ratio)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- drawn by our own /api/map
        <img
          ref={img}
          src={url}
          alt={alt}
          width={width}
          height={height}
          loading={lazy ? "lazy" : "eager"}
          decoding="async"
          onError={onFail}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {/* A hairline inside the edge, so the map sits in the card rather than on it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-text/[0.08] ring-inset"
      />
    </div>
  );
}

const LIVE_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/**
 * The large map and the day's stops beside it (below it on phones). With a browser token the
 * map is live (pan, zoom, tap a pin); without one, a larger image.
 */
function EnlargeSheet({
  open,
  onClose,
  company,
  pins,
  tech,
  day,
  stops,
  missing,
}: {
  open: boolean;
  onClose: () => void;
  company: string;
  pins: string;
  tech: string;
  day: string;
  stops: MapListStop[];
  missing: number;
}) {
  const [failed, setFailed] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const fail = useCallback(() => setFailed(true), []);
  const liveFail = useCallback(() => setLiveFailed(true), []);
  const live = useMemo(() => (LIVE_TOKEN ? decodePins(pins) : null), [pins]);
  const list = useRef<HTMLOListElement>(null);
  const note = missingNote(missing);
  const alt = mapAlt(tech, day, stops.length);
  const pick = useCallback((label: string) => {
    setSelected(label);
    list.current
      ?.querySelector(`[data-stop="${label}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  const closeSheet = useCallback(() => {
    setSelected(null);
    onClose();
  }, [onClose]);
  return (
    <Sheet open={open} onClose={closeSheet} title={`${tech} · ${day}`} wide>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          {live && !liveFailed ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-fill md:aspect-auto md:h-[min(32rem,70dvh)]">
              <InteractiveMap
                company={company}
                token={LIVE_TOKEN}
                pins={live}
                selected={selected}
                onSelect={pick}
                onFail={liveFail}
                label={alt}
              />
            </div>
          ) : failed ? (
            <p className="text-[0.9375rem] text-text-muted">The map couldn’t be drawn right now.</p>
          ) : (
            <MapImage
              src={mapSrc(company, pins, { w: 960, h: 640 })}
              alt={alt}
              ratio="aspect-[3/2]"
              width={960}
              height={640}
              lazy={false}
              onFail={fail}
            />
          )}
          {note ? <p className="mt-2 text-[0.9375rem] text-text-muted">{note}</p> : null}
        </div>
        <ol
          ref={list}
          className="grouped self-start md:max-h-[min(32rem,70dvh)] md:overflow-y-auto"
          aria-label={`Stops on ${day}`}
        >
          {stops.map((s, i) => {
            const label = String(i + 1);
            const on = selected === label;
            return (
              <li key={s.id} data-stop={label}>
                <button
                  type="button"
                  aria-pressed={live && !liveFailed ? on : undefined}
                  onClick={() => setSelected(on ? null : label)}
                  className={cx(
                    "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                    on ? "bg-link/10" : "hover:bg-text/[0.03] active:bg-text/[0.06]",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "grid size-7 shrink-0 place-items-center rounded-full font-display text-[0.9375rem] font-bold",
                      on ? "bg-link text-white" : "bg-fill",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="sr-only">Stop {i + 1}: </span>
                    {s.time == null && s.detail != null ? (
                      // Routes: the customer, then their address.
                      <>
                        <span className="block truncate font-semibold">{s.customer}</span>
                        <span className="block truncate text-[0.9375rem] text-text-muted">
                          {s.detail}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="block font-semibold tabular-nums">
                          {s.time ?? "No time"}
                        </span>
                        <span className="block truncate text-[0.9375rem] text-text-muted">
                          {s.customer}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </Sheet>
  );
}

/** The chevron of the phone's Map disclosure row: down when open, right when closed. */
function Disclosure({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cx(
        "size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
        open && "rotate-90",
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * A tech's day as a map. `column`: at the top of a tech's day, with Enlarge over the map's
 * corner; on phones a Map row above it folds it away (remembered on the device). `week`: one
 * of the week's row of small maps, with Enlarge and the caller's `action` (Optimize) under
 * it.
 */
export function DayMap({
  company,
  pins,
  stops,
  missing,
  tech,
  day,
  variant = "column",
  action,
  className = "mt-3",
}: {
  company: string;
  /** encodePins of the day's pins; null when no stop is on the map. */
  pins: string | null;
  stops: MapListStop[];
  missing: number;
  tech: string;
  /** "Monday". */
  day: string;
  variant?: "column" | "week";
  /** Week: the day's Optimize, beside Enlarge. */
  action?: ReactNode;
  /** Column: spacing around it (default: a gap above). */
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  // Every day map on the page opens and closes together, as one setting.
  const open = useSyncExternalStore(subscribeOpen, readOpen, () => true);
  const boxId = useId();
  const week = variant === "week";
  const size = week ? { w: 360, h: 240 } : { w: 640, h: 320 };
  const src = pins ? mapSrc(company, pins, size) : null;
  const failed = src !== null && failedSrc === src;
  const fail = useCallback(() => setFailedSrc(src), [src]);
  const close = useCallback(() => setEnlarged(false), []);
  const note = missingNote(missing);
  const alt = mapAlt(tech, day, stops.length);
  const shown = !!src && !failed;
  const enlarge = (
    <button
      type="button"
      aria-label={week ? `Enlarge ${day}’s Map` : "Enlarge Map"}
      aria-haspopup="dialog"
      title="Enlarge"
      onClick={() => setEnlarged(true)}
      className={iconButtonClass(
        week
          ? undefined
          : "absolute top-2 right-2 bg-surface/90 shadow-sm backdrop-blur hover:bg-surface",
      )}
    >
      <ExpandIcon className="size-5" />
    </button>
  );
  const image = shown ? (
    <div className="relative">
      {/* The map itself opens Enlarge too (Enlarge is the button for keyboards and readers). */}
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setEnlarged(true)}
        className="block w-full cursor-zoom-in"
      >
        <MapImage
          src={src}
          alt={alt}
          ratio={week ? "aspect-[3/2]" : "aspect-[2/1]"}
          width={size.w}
          height={size.h}
          lazy
          onFail={fail}
        />
      </button>
      {!week ? enlarge : null}
    </div>
  ) : null;

  if (week)
    return (
      <div data-testid="day-map">
        {image ?? (
          // The same shape as a map, so the row stays even.
          <div className="grid aspect-[3/2] place-items-center rounded-[1.25rem] bg-text/[0.04] px-2 text-center text-[0.9375rem] text-text-muted">
            {failed ? "Map not available" : stops.length ? "Not on the map" : "No stops"}
          </div>
        )}
        {note && shown ? (
          <p className="mt-1 px-1 text-[0.8125rem] text-text-muted">{note}</p>
        ) : null}
        {shown || action ? (
          <div className="mt-2 flex items-center gap-2">
            {shown ? enlarge : null}
            {action}
          </div>
        ) : null}
        {pins && shown ? (
          <EnlargeSheet
            open={enlarged}
            onClose={close}
            company={company}
            pins={pins}
            tech={tech}
            day={day}
            stops={stops}
            missing={missing}
          />
        ) : null}
      </div>
    );

  return (
    <div data-testid="day-map" className={className}>
      {shown ? (
        // Phones: a Map row folds the map away, so the stops can start near the top.
        <button
          type="button"
          aria-expanded={open}
          aria-controls={boxId}
          onClick={() => writeOpen(!open)}
          className="-mx-1 mb-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-2 rounded-full px-1 text-left sm:hidden"
        >
          <span className="flex-1 font-semibold">Map</span>
          <span className="text-[0.9375rem] text-text-muted">
            {open ? "Hide" : `${stops.length} ${stops.length === 1 ? "stop" : "stops"}`}
          </span>
          <span className="text-text-muted">
            <Disclosure open={open} />
          </span>
        </button>
      ) : null}
      {image ? (
        <div
          id={boxId}
          className={cx(
            "day-map-box grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "max-sm:invisible max-sm:grid-rows-[0fr] max-sm:opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">{image}</div>
        </div>
      ) : null}
      {failed ? (
        <p className="text-[0.9375rem] text-text-muted">Map not available right now.</p>
      ) : note ? (
        <p className={cx("mt-1.5 text-[0.9375rem] text-text-muted", !open && "max-sm:hidden")}>
          {note}
        </p>
      ) : null}
      {pins && shown ? (
        <EnlargeSheet
          open={enlarged}
          onClose={close}
          company={company}
          pins={pins}
          tech={tech}
          day={day}
          stops={stops}
          missing={missing}
        />
      ) : null}
    </div>
  );
}
