import { backLegLabel, durationLabel, type RouteStartLabel } from "@leakbook/core";

// Schedule tiles (docs/design/2026-10-21-schedule-tile.md; owner, 2026-10-21: "I like the
// chip. Do that for both schedule pages"): the drive to a stop sits on its tile as a small
// chip ("🚗 23"), the first stop's from the shop or home, and the drive home is the last line
// of the tech's block. The same rules as the website's lib/schedule-tile.ts.

/**
 * The minutes on a stop's drive chip: the drive in from the stop before (or from the start for
 * the first stop). Null, no chip, when the drive isn't known: no leg for it (still working it
 * out), the stop is off the map, or the place the drive starts from is (`fromOffMap`: the stop
 * before, or the shop or home for the first stop; see `driveFromOffMap`). The iPhone app's rule.
 */
export function driveChipMinutes(
  legMin: number | null,
  notOnMap: boolean,
  fromOffMap = false,
): number | null {
  if (legMin == null || notOnMap || fromOffMap || !Number.isFinite(legMin)) return null;
  return Math.max(0, Math.round(legMin));
}

/**
 * Whether the drive into stop `index` starts off the map: the stop before it is off the map,
 * or, for the first stop, the start (the shop or home) has no map point.
 */
export function driveFromOffMap(
  index: number,
  offMap: readonly boolean[],
  startOnMap: boolean,
): boolean {
  return index === 0 ? !startOnMap : (offMap[index - 1] ?? true);
}

/** What a screen reader says for the chip: "23 minute drive". */
export function driveSpoken(minutes: number): string {
  return `${minutes} minute drive`;
}

/** The block's last line: "27 min back to the shop" or "27 min back home"; null when none. */
export function driveHomeLine(
  backLegMin: number | null,
  startLabel: RouteStartLabel = "shop",
): string | null {
  if (backLegMin == null || !Number.isFinite(backLegMin) || Math.round(backLegMin) <= 0) {
    return null;
  }
  return `${durationLabel(backLegMin)} ${backLegLabel(startLabel)}`;
}
