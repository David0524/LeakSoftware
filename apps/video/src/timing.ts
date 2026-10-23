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
import { trackInfo } from "./track.ts";

export const FPS = 60;
/**
 * The groove's tempo (the licensed track's when there is one, music/track.py). Lines and
 * chapters after the turn start on its beats.
 */
export const BPM = trackInfo("launch")?.bpm ?? 92;
export const BEAT = 60 / BPM;
/** With the licensed track, the end card and the film's end land on its bar lines. */
const ON_BARS = trackInfo("launch") !== null;

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
  /** Just after "Not anymore.": the hit, and beat 0 of the groove. */
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
  const snapCard = (start: number, end: number) => {
    const onBeat = snap(start, 1);
    return onBeat <= end - 0.5 * BEAT ? onBeat : start;
  };

  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    const newChapter = prev && prev.chapter !== line.chapter;
    if (prev) {
      const extra = EXTRA_AFTER[prev.n] ?? 0;
      // With the track a card holds a beat longer, since it cuts in on the beat after the line.
      const cardBeat = newChapter && ON_BARS && hit ? BEAT : 0;
      const gap =
        (line.n === 6 ? DROP_GAP : newChapter ? CHAPTER_GAP : LINE_GAP) + extra + cardBeat;
      // Extra air stays with the line before, so a chapter card keeps its short length.
      const cardStart = t + (newChapter ? extra : 0);
      t += gap;
      // The hit rings a full second before the tour starts (as in the hype cut).
      if (line.n === 7) t = Math.max(t, hit + 1.0);
      // "Sundeck Pro…" (the end card) on a downbeat of the track.
      if (hit) t = snap(t, line.n === 42 && ON_BARS ? 4 : 1);
      if (newChapter) {
        // The vision has no card: the voice and the photos carry it.
        const hasCard = !["turn", "vision", "end"].includes(line.chapter);
        chapterStarts[line.chapter] = hasCard ? (hit ? snapCard(cardStart, t) : cardStart) : t;
        // The card cuts in on a beat too (the next one after the line before ends).
        if (hasCard) cards.push({ chapter: line.chapter, start: snapCard(cardStart, t), end: t });
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
    // The hit lands just after "Not anymore." (never under the word); the groove counts from it.
    if (line.n === 6) hit = t + 0.08;
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
    // With the track, the film ends on a bar line, so its fade covers whole bars.
    total: round(ON_BARS ? snap(t + TAIL, 4) : t + TAIL),
    mode: voiced === 0 ? "placeholder" : voiced === out.length ? "voice" : "mixed",
  };
}

const round = (x: number) => Math.round(x * 1000) / 1000;
