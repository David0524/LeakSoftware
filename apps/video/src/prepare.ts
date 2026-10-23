// Times the film to the narration: measures each voice file in audio/voice/ (01.mp3 … 43.mp3, or
// .wav) with ffprobe, falls back to the placeholder pace for any line without one, and writes
// build/timeline.json for the score (music/launch_score.py) and the frames (render.ts).
//
//   node src/prepare.ts

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeJson } from "./json.ts";
import { lines } from "./script.ts";
import { buildTimeline } from "./timing.ts";

const root = join(import.meta.dirname, "..");
const voiceDir = join(root, "audio", "voice");

function seconds(file: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  const d = Number.parseFloat(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Can't read the length of ${file}`);
  return d;
}

const durations = new Map<number, { seconds: number; voice: string | null }>();
for (const line of lines) {
  const name = String(line.n).padStart(2, "0");
  const file = ["mp3", "wav", "m4a"]
    .map((ext) => join(voiceDir, `${name}.${ext}`))
    .find((f) => existsSync(f));
  if (file) durations.set(line.n, { seconds: seconds(file), voice: file.slice(root.length + 1) });
}

const timeline = buildTimeline(durations);
mkdirSync(join(root, "build"), { recursive: true });
await writeJson(join(root, "build", "timeline.json"), timeline);

const mmss = (t: number) => {
  const tenths = Math.round(t * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
};
console.log(
  `Timeline: ${mmss(timeline.total)} (${timeline.mode}; ${durations.size} of ${lines.length} voice files)`,
);
for (const [id, t] of Object.entries(timeline.chapters)) console.log(`  ${mmss(t ?? 0)}  ${id}`);
