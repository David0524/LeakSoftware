// Writes the scripts' JSON (timeline, manifest, capture boxes) the way the repo's Prettier
// would, so `pnpm format:check` passes on a working copy that has rendered the film.

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const prettier = require("prettier") as typeof import("prettier");

export async function writeJson(file: string, value: unknown) {
  writeFileSync(file, await prettier.format(JSON.stringify(value), { parser: "json" }));
}
