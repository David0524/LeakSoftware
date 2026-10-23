// The film's clock: when each narration line starts and ends, where the chapter cards sit, and
// the music's beat grid. Everything on screen and in the score is placed from this, so dropping
// in the real voice files re-times the whole film (prepare.ts writes it to build/timeline.json).

import {
  CHAPTER_GAP,
  DROP_GAP,
  EXTRA_AFTER,
  LINE_GAP,
  PRE_ROLL,
  TAIL,
  lines,
  placeholderSeconds,
  type ChapterId,
} from "./script.ts";

export const FPS = 60;
/** The groove's tempo. Cuts after the turn land on its beats; chapters on every other beat. */
export const BPM = 92;
export const BEAT = 60 / BPM;

export interface TimedLine {
  n: number;
  chapter: ChapterId;
  text: string;
  start: number;
  end: number;
  /** The voice file, relative to apps/video, when it exists. */
  voice: string | null;
}

export interface Timeline {
  fps: number;
  bpm: number;
  beat: number;
  /** "Not anymore.": the hit, and beat 0 of the groove. */
  hit: number;
  lines: TimedLine[];
  /** Each chapter card's window (the break before the chapter's first line). */
  cards: { chapter: ChapterId; start: number; end: number }[];
  /** When each chapter starts (its card, else its first line). */
  chapters: Partial<Record<ChapterId, number>>;
  total: number;
  /** "placeholder" until every voice file is in; "voice" after. */
  mode: "placeholder" | "voice" | "mixed";
}

/**
 * Builds the timeline from each line's length (measured from its voice file, else read at the
 * placeholder pace).
 */
export function buildTimeline(
  durations: Map<number, { seconds: number; voice: string | null }>,
): Timeline {
  const out: TimedLine[] = [];
  const cards: Timeline["cards"] = [];
  const chapterStarts: Timeline["chapters"] = { open: 0 };
  let t = PRE_ROLL;
  let hit = 0;
  const snap = (time: number, every: number) =>
    hit ? hit + Math.ceil((time - hit) / (every * BEAT) - 1e-6) * every * BEAT : time;

  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    const newChapter = prev && prev.chapter !== line.chapter;
    if (prev) {
      const gap =
        (line.n === 6 ? DROP_GAP : newChapter ? CHAPTER_GAP : LINE_GAP) +
        (EXTRA_AFTER[prev.n] ?? 0);
      const cardStart = t;
      t += gap;
      if (line.n === 6) hit = t;
      else if (hit) t = snap(t, newChapter ? 2 : 1);
      if (newChapter) {
        const hasCard = !["turn", "end"].includes(line.chapter);
        chapterStarts[line.chapter] = hasCard ? cardStart : t;
        if (hasCard) cards.push({ chapter: line.chapter, start: cardStart, end: t });
      }
    }
    const d = durations.get(line.n) ?? { seconds: placeholderSeconds(line.text), voice: null };
    out.push({
      n: line.n,
      chapter: line.chapter,
      text: line.text,
      start: round(t),
      end: round(t + d.seconds),
      voice: d.voice,
    });
    t += d.seconds;
  });
  const voiced = out.filter((l) => l.voice).length;
  return {
    fps: FPS,
    bpm: BPM,
    beat: BEAT,
    hit: round(hit),
    lines: out,
    cards: cards.map((c) => ({ ...c, start: round(c.start), end: round(c.end) })),
    chapters: Object.fromEntries(
      Object.entries(chapterStarts).map(([k, v]) => [k, round(v ?? 0)]),
    ) as Timeline["chapters"],
    total: round(t + TAIL),
    mode: voiced === 0 ? "placeholder" : voiced === out.length ? "voice" : "mixed",
  };
}

const round = (x: number) => Math.round(x * 1000) / 1000;
