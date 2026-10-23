// Copies the iPhone app's real screens into captures/iphone/ for the film: the CI simulator
// screenshots (artifact `iphone-screenshots` from .github/workflows/ci.yml, unzipped), and the
// launch film's own suite when it has run (artifact `launch-video-iphone` from
// .github/workflows/launch-video-iphone.yml). Its `lv-*.png` files win over CI's stills.
//
//   node src/capture-iphone.ts <unzipped artifact folder> [<another folder>…]
//
// Download an artifact with `gh run download <run id> -n iphone-screenshots -D <folder>` (or
// from the run's page on GitHub).

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const out = join(root, "captures", "iphone");
const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error("Usage: node src/capture-iphone.ts <unzipped artifact folder>…");
  process.exit(1);
}
mkdirSync(out, { recursive: true });
let n = 0;
for (const dir of dirs) {
  if (!existsSync(dir)) throw new Error(`No folder ${dir}`);
  for (const f of readdirSync(dir)) {
    // Screens only: lv-*, CI's numbered screens and tab-bar-*.
    if (!/^(lv-|\d\d-|tab-).*\.png$/.test(f)) continue;
    copyFileSync(join(dir, f), join(out, f));
    n++;
  }
}
console.log(`Copied ${n} iPhone screens to captures/iphone/`);
// The simulator's capture leaves SwiftUI's Canvas blank: draw Rebecca's saved signature into
// the Customer Signs screen the way the app does (tools/sign_screen.py).
const signed = join(out, "lv-signed.png");
if (existsSync(signed)) {
  execFileSync("python3", [join(root, "tools", "sign_screen.py"), signed], { stdio: "inherit" });
}
