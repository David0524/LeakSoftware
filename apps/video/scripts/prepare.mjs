// Makes the music and copies the brand files the video needs into assets/generated (gitignored).
// The music's scene times must match src/timing.ts; this fails if they drift.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(app, "../..");
const out = join(app, "assets/generated");
mkdirSync(out, { recursive: true });

execFileSync("python3", [join(app, "audio/score.py")], { stdio: "inherit" });

const sectionsPerTrack = {};
for (const track of ["leak", "pool"]) {
  copyFileSync(join(app, `audio/out/${track}.wav`), join(out, `${track}.wav`));
  const timing = JSON.parse(readFileSync(join(app, `audio/out/${track}.timing.json`), "utf8"));
  sectionsPerTrack[track] = timing.sections;
}

const expected = JSON.parse(
  execFileSync(
    "node",
    [
      "--experimental-strip-types",
      "--no-warnings",
      "-e",
      "import('./src/timing.ts').then(m => console.log(JSON.stringify(m.SECTIONS)))",
    ],
    {
      cwd: app,
      encoding: "utf8",
    },
  ),
);
for (const [track, sections] of Object.entries(sectionsPerTrack)) {
  const got = sections.map((s) => [s.id, s.start, s.end]);
  const want = expected.map((s) => [s.id, s.start, s.end]);
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${track}: the music's sections no longer match src/timing.ts`);
  }
}

copyFileSync(
  join(repo, "brand/fonts/BarlowSemiCondensed-ExtraBold.ttf"),
  join(out, "BarlowSemiCondensed-ExtraBold.ttf"),
);
copyFileSync(join(repo, "brand/fonts/PublicSans[wght].ttf"), join(out, "PublicSans-Variable.ttf"));
for (const logo of ["sundeck-logo-reverse.svg", "sundeck-logo.svg"]) {
  copyFileSync(join(repo, "brand/logo", logo), join(out, logo));
}
console.log("assets ready in assets/generated");
