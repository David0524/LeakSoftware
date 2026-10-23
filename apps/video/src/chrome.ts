// The Chromium the film's scripts drive: PW_CHROMIUM_PATH (cloud sessions:
// /opt/pw-browsers/chromium), a file or a Playwright browsers folder.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function chromePath(): string {
  const given = process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
  if (existsSync(given) && statSync(given).isFile()) return given;
  const dirs = existsSync(given) ? [given, ...readdirSync(given).map((n) => join(given, n))] : [];
  for (const d of dirs) {
    const c = join(d, "chrome-linux", "chrome");
    if (existsSync(c)) return c;
  }
  throw new Error(`No Chromium at ${given}; set PW_CHROMIUM_PATH to the chrome binary`);
}
