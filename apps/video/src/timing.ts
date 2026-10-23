// The music's grid (audio/score.py): 128 BPM, so a bar is 1.875 s and 45 s is 24 bars.
// A 2-bar intro, six 3-bar scenes, a 4-bar end card. scripts/prepare.mjs checks these match
// the music's timing.json.

export const FPS = 30;
export const BPM = 128;
export const BAR = (60 / BPM) * 4;
export const LENGTH = 24 * BAR;

export type SectionId = "intro" | `scene${1 | 2 | 3 | 4 | 5 | 6}` | "end";

export const SECTIONS: { id: SectionId; start: number; end: number }[] = [
  { id: "intro", start: 0, end: 2 * BAR },
  ...([1, 2, 3, 4, 5, 6] as const).map((n) => ({
    id: `scene${n}` as const,
    start: (2 + 3 * (n - 1)) * BAR,
    end: (2 + 3 * n) * BAR,
  })),
  { id: "end", start: 20 * BAR, end: 24 * BAR },
];

/** Seconds to the nearest whole frame. */
export const frames = (seconds: number) => Math.round(seconds * FPS);

export const TOTAL_FRAMES = frames(LENGTH);

/** The slide-and-scale between scenes. */
export const TRANSITION = frames(0.5);
