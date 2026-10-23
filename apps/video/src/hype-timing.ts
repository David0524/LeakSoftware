// The 60-second hype cut's clock (docs/plans/launch-video.md, section 10): which narration lines
// it uses, when each starts, the hit after "Not anymore." and the groove's beat grid. The score
// (music/hype_score.py) and the frames (src/film/hype.ts) are both placed from this, so new voice
// takes re-time the whole cut. render-hype.ts writes it to build/hype/timeline.json.

/** The groove's tempo: a bar is two seconds, a cut on every other beat is one second. */
export const HYPE_BPM = 120;
export const HYPE_BEAT = 60 / HYPE_BPM;
export const HYPE_FPS = 60;

/**
 * The lines, in order. Before the hit they follow each other by a fixed gap; from the hit on,
 * each starts on the beat named here (beats after the hit), or the next free beat when the line
 * before runs long.
 */
export const HYPE_LINES: { n: number; gap?: number; beat?: number }[] = [
  { n: 3, gap: 0.3 }, // "And at ten at night… you're at the kitchen table, doing the invoices."
  { n: 5, gap: 0.3 }, // "But the paperwork? The paperwork is running you."
  { n: 6, gap: 0.75 }, // "Not anymore." (the hit lands as its file ends, just after the words)
  { n: 7, beat: 2 }, // "Sundeck Pro. Your whole shop. In your pocket. On every truck."
  { n: 12, beat: 19 }, // "One tap, and the customer gets a text: we're on the way."
  { n: 21, beat: 33 }, // "They tap accept on their own phone, put the deposit down… and you've got the job."
  { n: 30, beat: 48 }, // "Stop chasing money. Watch it come in."
  { n: 31, beat: 55 }, // "And you? You see all of it. Every truck. Every job. Every dollar."
  { n: 39, beat: 68 }, // "Another truck. Another crew. A bigger name in town."
  { n: 40, beat: 77 }, // "Home for dinner. Saturdays at the lake."
  { n: 42, beat: 84 }, // "Sundeck Pro. Build the company you set out to build."
  { n: 43, beat: 92 }, // "Start your free trial at sundeck pro dot com."
];

/** The narration's words, for the captions (they quote it word for word). */
export const HYPE_TEXT: Record<number, string> = {
  3: "And at ten at night... you're at the kitchen table, doing the invoices.",
  5: "But the paperwork? The paperwork is running you.",
  6: "Not anymore.",
  7: "Sundeck Pro. Your whole shop. In your pocket. On every truck.",
  12: "One tap, and the customer gets a text: we're on the way.",
  21: "They tap accept on their own phone, put the deposit down... and you've got the job.",
  30: "Stop chasing money. Watch it come in.",
  31: "And you? You see all of it. Every truck. Every job. Every dollar.",
  39: "Another truck. Another crew. A bigger name in town.",
  40: "Home for dinner. Saturdays at the lake.",
  42: "Sundeck Pro. Build the company you set out to build.",
  43: "Start your free trial at sundeck pro dot com.",
};

/** The smallest silence between two lines after the hit. */
const MIN_GAP = 0.1;
/** After the last line: the end card holds, and the score's last chord rings out. */
const TAIL = 1.4;

export interface HypeLine {
  n: number;
  text: string;
  start: number;
  end: number;
  voice: string | null;
}

export interface HypeTimeline {
  fps: number;
  bpm: number;
  beat: number;
  /** The hard hit just after "Not anymore.": beat 0 of the groove. */
  hit: number;
  /** The lift into the vision (line 39), and the end hit on the logo (just before line 42). */
  vision: number;
  endHit: number;
  lines: HypeLine[];
  total: number;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

export function buildHypeTimeline(
  durations: Map<number, { seconds: number; voice: string | null }>,
): HypeTimeline {
  const lines: HypeLine[] = [];
  let t = 0;
  let hit = 0;
  for (const spec of HYPE_LINES) {
    const d = durations.get(spec.n);
    if (!d) throw new Error(`No voice file for line ${spec.n}`);
    let start: number;
    if (spec.beat === undefined) start = t + (spec.gap ?? 0);
    else {
      let k = spec.beat;
      while (hit + k * HYPE_BEAT < t + MIN_GAP) k++;
      start = hit + k * HYPE_BEAT;
    }
    lines.push({
      n: spec.n,
      text: HYPE_TEXT[spec.n]!,
      start: round(start),
      end: round(start + d.seconds),
      voice: d.voice,
    });
    t = start + d.seconds;
    // The hit lands as "Not anymore." ends: just after the words, never on them.
    if (spec.n === 6) hit = t;
  }
  const at = (n: number) => lines.find((l) => l.n === n)!.start;
  // The end hit lands on the first beat after "Saturdays at the lake." has ended, before
  // "Sundeck Pro." starts: never on top of a word.
  const before42 = lines.find((l) => l.n === 40)!.end + 0.1;
  const endHit = Math.min(at(42), hit + Math.ceil((before42 - hit) / HYPE_BEAT) * HYPE_BEAT);
  return {
    fps: HYPE_FPS,
    bpm: HYPE_BPM,
    beat: HYPE_BEAT,
    hit: round(hit),
    vision: at(39),
    endHit: round(endHit),
    lines,
    total: round(t + TAIL),
  };
}
