// Renders the 60-second hype cut (docs/plans/launch-video.md, section 10): times it to its
// narration lines (src/hype-timing.ts), makes its score (music/hype_score.py), serves its frames
// page (src/film/hype-main.ts), draws every frame in headless Chromium and encodes them with
// ffmpeg, with the mix under them.
//
//   node src/render-hype.ts                      # the cut → out/sundeck-pro-hype.mp4
//   node src/render-hype.ts --stills 12.5,40     # single frames → build/hype/stills/*.png
//   node src/render-hype.ts --from 30 --to 40    # a stretch → out/hype-part-30-40.mp4 (no audio)
//   options: --workers 4, --no-music (keep build/hype/mix.wav as it is),
//            --ready quote-open,report (draw these re-capture slots from the current captures,
//            to check the motion; see SLOTS in src/film/hype.ts)
//
// Everything it makes goes under build/hype/ and out/sundeck-pro-hype.mp4; it never touches the
// long film's build/timeline.json, build/manifest.json, build/clips/ or its mix.
//
// Needs ffmpeg and ffprobe, python3 with numpy, and Chromium (PW_CHROMIUM_PATH, see chrome.ts).

import { execFileSync, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.ts";
import { HYPE_LINES, buildHypeTimeline, type HypeTimeline } from "./hype-timing.ts";
import { writeJson } from "./json.ts";

const root = join(import.meta.dirname, "..");
const repo = join(root, "..", "..");
const build = join(root, "build", "hype");
const outDir = join(root, "out");
const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const FILM = "sundeck-pro-hype.mp4";

// ---------------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------------

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

function timeline(): HypeTimeline {
  const durations = new Map<number, { seconds: number; voice: string | null }>();
  for (const { n } of HYPE_LINES) {
    const name = String(n).padStart(2, "0");
    const file = ["mp3", "wav", "m4a"]
      .map((ext) => join(root, "audio", "voice", `${name}.${ext}`))
      .find((f) => existsSync(f));
    if (!file) throw new Error(`The hype cut needs audio/voice/${name}.mp3`);
    durations.set(n, { seconds: seconds(file), voice: file.slice(root.length + 1) });
  }
  return buildHypeTimeline(durations);
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** A PNG's or JPEG's size, read from its header. */
function imageSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47)
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length) {
    const marker = b.readUInt16BE(i);
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3)
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error(`Can't read the size of ${file}`);
}

const CLIP_FPS = 60;
/** Frames wide enough for a push-in to 2.4× on a 420-pixel phone. */
const CLIP_WIDTH = 1080;
/** The owner's recordings the cut uses. */
const CLIPS = ["01", "02", "03", "05"];

/** The owner's recordings (the smoothed assets/owner/smooth/NN-*.mp4 first), as frames. */
function extractClips() {
  const owner = join(root, "assets", "owner");
  const found = new Map<string, string>();
  for (const dir of [owner, join(owner, "smooth")]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = f.match(/^(\d\d)-.*\.(mov|mp4)$/i);
      if (m && CLIPS.includes(m[1]!) && !f.includes(".tmp")) found.set(m[1]!, join(dir, f));
    }
  }
  const clips: Record<
    string,
    { frames: number; fps: number; width: number; height: number; duration: number; dir: string }
  > = {};
  for (const [n, file] of [...found].sort()) {
    const dir = join(build, "clips", n);
    const stamp = join(dir, "source.txt");
    const source = {
      file: file.slice(root.length + 1),
      mtime: statSync(file).mtimeMs,
      width: CLIP_WIDTH,
      fps: CLIP_FPS,
    };
    const fresh = existsSync(stamp) && readFileSync(stamp, "utf8") === JSON.stringify(source);
    if (!fresh) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      console.log(`  frames from ${source.file}`);
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        file,
        "-vf",
        `fps=${CLIP_FPS},scale=${CLIP_WIDTH}:-2:flags=lanczos`,
        "-q:v",
        "2",
        join(dir, "%05d.jpg"),
      ]);
      writeFileSync(stamp, JSON.stringify(source));
    }
    const frames = readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
    clips[n] = {
      frames,
      fps: CLIP_FPS,
      ...imageSize(join(dir, "00001.jpg")),
      duration: frames / CLIP_FPS,
      dir: `build/hype/clips/${n}`,
    };
  }
  return clips;
}

function manifest(tl: HypeTimeline) {
  const webDir = join(root, "captures", "web");
  const boxes = existsSync(join(webDir, "boxes.json"))
    ? (JSON.parse(readFileSync(join(webDir, "boxes.json"), "utf8")) as Record<
        string,
        { boxes: unknown }
      >)
    : {};
  const web: Record<string, unknown> = {};
  for (const f of existsSync(webDir) ? readdirSync(webDir) : []) {
    if (!f.endsWith(".png")) continue;
    const name = f.slice(0, -4);
    web[name] = { ...imageSize(join(webDir, f)), boxes: boxes[name]?.boxes ?? {} };
  }
  const phoneDir = join(root, "captures", "iphone");
  const iphone: Record<string, unknown> = {};
  for (const f of existsSync(phoneDir) ? readdirSync(phoneDir) : []) {
    if (f.endsWith(".png")) iphone[f.slice(0, -4)] = imageSize(join(phoneDir, f));
  }
  const launchDir = join(root, "assets", "photos", "launch");
  const photos: Record<string, string | null> = {};
  for (let i = 1; i <= 11; i++) {
    const n = String(i).padStart(2, "0");
    const f = existsSync(launchDir)
      ? readdirSync(launchDir).find((x) => x.startsWith(`${n}-`) && /\.(jpe?g|png|webp)$/i.test(x))
      : undefined;
    photos[n] = f ? `/assets/photos/launch/${f}` : null;
  }
  const stock: Record<string, string> = {};
  for (const f of readdirSync(join(root, "assets", "photos"))) {
    if (/\.(jpe?g|png)$/i.test(f)) stock[f.replace(/\.\w+$/, "")] = `/assets/photos/${f}`;
  }
  const ownerStills: Record<string, unknown> = {};
  const owner = join(root, "assets", "owner");
  for (const f of existsSync(owner) ? readdirSync(owner) : []) {
    const m = f.match(/^(\d\d)-.*\.(jpe?g|png)$/i);
    if (m) ownerStills[m[1]!] = { url: `/assets/owner/${f}`, ...imageSize(join(owner, f)) };
  }
  const ready = (opt("--ready") ?? "").split(",").filter(Boolean);
  return { timeline: tl, web, iphone, photos, stock, clips: extractClips(), ownerStills, ready };
}

// ---------------------------------------------------------------------------
// The page server
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".js": "text/javascript",
};

function serve(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!));
    try {
      if (path === "/") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(
          `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/film/hype-main.ts"></script></body></html>`,
        );
        return;
      }
      if (path.endsWith(".ts")) {
        const src = readFileSync(join(root, "src", path), "utf8");
        const js = ts.transpileModule(src, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            verbatimModuleSyntax: true,
          },
        }).outputText;
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(js);
        return;
      }
      const base = path.startsWith("/brand/") ? repo : root;
      const file = join(base, path);
      if (!file.startsWith(base)) throw new Error("outside");
      const body = readFileSync(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      });
      res.end(body);
    } catch {
      console.warn(`  404 ${path}`);
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      resolve({ server, url: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}/` });
    }),
  );
}

async function openFilm(url: string) {
  const browser = await chromium.launch({
    executablePath: chromePath(),
    args: ["--disable-dev-shm-usage", "--font-render-hinting=none", "--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready || window.__error, undefined, {
    timeout: 180000,
    polling: 200,
  });
  const error = await page.evaluate(() => window.__error);
  if (error) throw new Error(`The hype page failed: ${error}`);
  const cdp = await page.context().newCDPSession(page);
  const frame = async (n: number, format: "jpeg" | "png" = "jpeg") => {
    await page.evaluate((f) => window.__seek(f), n);
    const shot = (await cdp.send("Page.captureScreenshot", {
      format,
      ...(format === "jpeg" ? { quality: 94 } : {}),
    })) as { data: string };
    return Buffer.from(shot.data, "base64");
  };
  return { browser, page, frame };
}

async function renderRange(
  url: string,
  from: number,
  to: number,
  file: string,
  label: string,
  fps: number,
) {
  const film = await openFilm(url);
  const ff = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-c:v",
      "mjpeg",
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "17",
      "-maxrate",
      "28M",
      "-bufsize",
      "56M",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise<void>((resolve, reject) =>
    ff.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))),
  );
  const started = Date.now();
  for (let f = from; f < to; f++) {
    const jpg = await film.frame(f).catch((e: Error) => {
      throw new Error(`${label}: frame ${f} (${(f / fps).toFixed(2)} s): ${e.message}`);
    });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - from) % 300 === 0) {
      const rate = (f - from) / ((Date.now() - started) / 1000);
      console.log(`  ${label}: frame ${f - from}/${to - from} (${rate.toFixed(1)} fps)`);
    }
  }
  ff.stdin.end();
  await done;
  await film.browser.close();
}

async function main() {
  mkdirSync(build, { recursive: true });
  const tl = timeline();
  await writeJson(join(build, "timeline.json"), tl);
  console.log(
    `Hype cut: ${tl.total.toFixed(2)} s; the hit at ${tl.hit.toFixed(2)} s; ${tl.lines
      .map((l) => `${l.n}@${l.start.toFixed(2)}`)
      .join(" ")}`,
  );
  const stills = opt("--stills");
  const ranged = args.includes("--from") || args.includes("--to");
  if (!stills && !ranged && !args.includes("--no-music")) {
    execFileSync("python3", [join(root, "music", "hype_score.py")], { stdio: "inherit" });
  }
  await writeJson(join(build, "manifest.json"), manifest(tl));
  const { server, url } = await serve();
  const total = Math.ceil(tl.total * tl.fps);

  try {
    if (stills) {
      const dir = join(build, "stills");
      mkdirSync(dir, { recursive: true });
      const film = await openFilm(url);
      for (const s of stills.split(",")) {
        const t = Number(s);
        const png = await film.frame(Math.round(t * tl.fps), "png");
        const file = join(dir, `t${t.toFixed(2).padStart(6, "0")}.png`);
        writeFileSync(file, png);
        console.log(`  ${file}`);
      }
      await film.browser.close();
      return;
    }

    const from = Math.round(Number(opt("--from") ?? 0) * tl.fps);
    const to = Math.min(total, Math.round(Number(opt("--to") ?? tl.total) * tl.fps));
    const workers = Math.max(1, Number(opt("--workers") ?? 4));
    const per = Math.ceil((to - from) / workers);
    const segs: string[] = [];
    const jobs: Promise<void>[] = [];
    for (let w = 0; w < workers; w++) {
      const a = from + w * per;
      const b = Math.min(to, a + per);
      if (a >= b) break;
      const seg = join(build, `seg-${w}.mp4`);
      segs.push(seg);
      jobs.push(renderRange(url, a, b, seg, `worker ${w + 1}`, tl.fps));
    }
    const started = Date.now();
    await Promise.all(jobs);
    console.log(`Frames done in ${Math.round((Date.now() - started) / 1000)} s`);
    writeFileSync(join(build, "segments.txt"), segs.map((s) => `file '${s}'`).join("\n") + "\n");
    const video = join(build, "video.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      join(build, "segments.txt"),
      "-c",
      "copy",
      video,
    ]);
    mkdirSync(outDir, { recursive: true });
    const whole = from === 0 && to === total;
    const out = whole
      ? join(outDir, FILM)
      : join(outDir, `hype-part-${from / tl.fps}-${to / tl.fps}.mp4`);
    const mix = join(build, "mix.wav");
    if (whole && existsSync(mix)) {
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        video,
        "-i",
        mix,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        "-shortest",
        out,
      ]);
    } else {
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-i",
        video,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        out,
      ]);
    }
    for (const f of [...segs, video]) rmSync(f, { force: true });
    console.log(`Wrote ${out}`);
  } finally {
    server.close();
  }
}

await main();
