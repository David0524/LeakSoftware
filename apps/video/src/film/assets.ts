// What the film can use, found on disk by render.ts and handed to the page: the website and
// iPhone captures, the owner's photos and recordings, and the timeline.

import type { Timeline } from "../timing.ts";
import type { Clip } from "./devices.ts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Manifest {
  timeline: Timeline;
  /** Website captures: captures/web/<name>.png with their size and named boxes (image pixels). */
  web: Record<string, { width: number; height: number; boxes: Record<string, Box> }>;
  /** iPhone screens: captures/iphone/<name>.png. */
  iphone: Record<string, { width: number; height: number }>;
  /** The launch photos (section 6 of the plan) by number, "01" … "11": a URL or null. */
  photos: Record<string, string | null>;
  /** The owner's earlier photos in assets/photos/ by name. */
  stock: Record<string, string>;
  /** The owner's iPhone recordings by number ("01"), as extracted frames. */
  clips: Record<
    string,
    { frames: number; fps: number; width: number; height: number; duration: number; dir: string }
  >;
  /** The owner's iPhone stills (assets/owner/*.jpg|png) by number. */
  ownerStills: Record<string, { url: string; width: number; height: number }>;
}

export let manifest: Manifest;

export function setManifest(m: Manifest) {
  manifest = m;
}

/** The launch photos to make (docs/plans/launch-video.md, section 6). */
export const PHOTOS: Record<string, { file: string; label: string }> = {
  "01": { file: "01-dawn-truck.jpg", label: "Photo 1: dawn truck" },
  "02": { file: "02-whiteboard.jpg", label: "Photo 2: whiteboard chaos" },
  "03": { file: "03-kitchen-table.jpg", label: "Photo 3: kitchen table at night" },
  "04": { file: "04-phone-buzzing.jpg", label: "Photo 4: phone buzzing" },
  "05": { file: "05-hands-on-gauge.jpg", label: "Photo 5: hands on the gauge" },
  "06": { file: "06-tech-at-pool.jpg", label: "Photo 6: tech at the pool" },
  "07": { file: "07-handshake.jpg", label: "Photo 7: handshake at the door" },
  "08": { file: "08-fleet.jpg", label: "Photo 8: the fleet" },
  "09": { file: "09-crew-meeting.jpg", label: "Photo 9: crew meeting" },
  "10": { file: "10-home-on-time.jpg", label: "Photo 10: home on time" },
  "11": { file: "11-lake-tailgate.jpg", label: "Photo 11: Saturday at the lake" },
};

export function photoRef(n: string) {
  const p = PHOTOS[n]!;
  return {
    url: manifest.photos[n] ?? null,
    label: p.label,
    file: `assets/photos/launch/${p.file}`,
  };
}

export function stockRef(name: string) {
  return { url: manifest.stock[name] ?? null, label: name, file: `assets/photos/${name}.jpg` };
}

/** The first iPhone screen that exists, by name (the launch suite's lv-* before CI's). */
export function iphone(...names: string[]): { src: string; width: number; height: number } | null {
  for (const n of names) {
    const s = manifest.iphone[n];
    if (s) return { src: `/captures/iphone/${n}.png`, ...s };
  }
  return null;
}

export function web(name: string) {
  const w = manifest.web[name];
  if (!w) throw new Error(`No website capture ${name}; run src/capture-web.ts`);
  return { src: `/captures/web/${name}.png`, ...w };
}

/** The owner's recording number `n`, when it has arrived. */
export function clip(n: string): Clip | null {
  const c = manifest.clips[n];
  if (!c) return null;
  return {
    ...c,
    frame: (i: number) => `/${c.dir}/${String(i).padStart(5, "0")}.jpg`,
  };
}

export function ownerStill(n: string) {
  return manifest.ownerStills[n] ?? null;
}

/**
 * The photos, for preloading. Screens load with the shot that shows them (a frame waits for
 * them), so a browser holds only what it renders.
 */
export function allImages(): string[] {
  return [
    ...Object.values(manifest.photos).filter((u): u is string => !!u),
    ...Object.values(manifest.stock),
    ...Object.values(manifest.ownerStills).map((s) => s.url),
  ];
}
