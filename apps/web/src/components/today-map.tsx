"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { missingNote } from "@/lib/day-map";
import { DayMap, type MapListStop } from "./day-map";

// Today's Map, beside the day on a computer (owner, 2026-10-21: "The desktop today page looks
// awkwardly wide"; docs/design/2026-10-20-today-card.md, Desktop). The Schedule's day map
// (docs/plans/route-maps.md): the start, the stops as numbered pins in order, Enlarge for the
// live Apple map. Phones keep Today in one column with no map, so nothing here loads on them:
// the map mounts only once the window is wide, in a box of the map's shape until then.

const WIDE = "(min-width: 64rem)";

function subscribeWide(fn: () => void) {
  const q = matchMedia(WIDE);
  q.addEventListener("change", fn);
  return () => q.removeEventListener("change", fn);
}

/** A quiet box in the map's shape: while the page comes alive, or when there's no map. */
function MapBox({ children }: { children?: ReactNode }) {
  return (
    <div className="grid aspect-[2/1] place-items-center rounded-[1.25rem] bg-text/[0.04] px-4 text-center text-[0.9375rem] text-text-muted">
      {children}
    </div>
  );
}

export function TodayMap({
  company,
  pins,
  stops,
  missing,
  tech,
  day,
}: {
  /** The shop, for the map image; null when this site has no map service. */
  company: string | null;
  pins: string | null;
  stops: MapListStop[];
  missing: number;
  /** "Priya Shah", for the map's spoken name. */
  tech: string;
  /** "Tuesday". */
  day: string;
}) {
  const wide = useSyncExternalStore(
    subscribeWide,
    () => matchMedia(WIDE).matches,
    () => false,
  );
  if (stops.length === 0) return <MapBox>No stops today</MapBox>;
  if (!company) return <MapBox>Map not available</MapBox>;
  if (!pins)
    return (
      <>
        <MapBox>Not on the map</MapBox>
        <p className="mt-1.5 text-[0.9375rem] text-text-muted">{missingNote(missing)}</p>
      </>
    );
  if (!wide) {
    const note = missingNote(missing);
    return (
      <>
        <div aria-hidden="true" className="aspect-[2/1] rounded-[1.25rem] bg-fill" />
        {note ? <p className="mt-1.5 text-[0.9375rem] text-text-muted">{note}</p> : null}
      </>
    );
  }
  return (
    <DayMap
      company={company}
      pins={pins}
      stops={stops}
      missing={missing}
      tech={tech}
      day={day}
      className=""
    />
  );
}
