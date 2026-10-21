// Renders every composition to out/<id>.mp4 (H.264, AAC), with the session's Chromium.
// Usage: pnpm --filter @leakbook/video render [composition ids...]
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const all = ["LeakWide", "LeakTall", "PoolWide", "PoolTall"];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;

execFileSync("node", [join(app, "scripts/prepare.mjs")], { stdio: "inherit" });

const shell = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const browser = process.env.REMOTION_BROWSER ?? (existsSync(shell) ? shell : undefined);

for (const id of ids) {
  const args = ["remotion", "render", "src/index.ts", id, `out/${id}.mp4`, "--audio-codec=aac"];
  if (browser) args.push(`--browser-executable=${browser}`);
  execFileSync("pnpm", ["exec", ...args], { cwd: app, stdio: "inherit" });
}
