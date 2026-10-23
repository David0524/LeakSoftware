// The licensed music tracks (music/track.py, apps/video/audio/track/track.json). When a film's
// track file is there, its beat grid uses the track's tempo and its hit lands on the track's
// band entry; without one the film keeps its own tempo and the code score.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "audio", "track");

export interface TrackInfo {
  file: string;
  bpm: number;
  /** Where the full band comes in (seconds into the file, a downbeat): the film's hit. */
  band_entry: number;
  /** The hype cut: the downbeat of the track's last chord. */
  final_chord?: number;
}

/** The film's track settings, or null when its track file isn't there. */
export function trackInfo(film: "launch" | "hype"): TrackInfo | null {
  const file = join(dir, "track.json");
  if (!existsSync(file)) return null;
  const info = (JSON.parse(readFileSync(file, "utf8")) as Record<string, TrackInfo>)[film];
  if (!info || !existsSync(join(dir, info.file))) return null;
  return info;
}
