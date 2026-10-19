import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import type { RuleCases } from "./case";
import { modules } from "./cases";

// Runs the rules in @leakbook/core over each case and writes the results to
// apps/ios/Tests/Fixtures/<module>.json, which the Swift tests must match
// (docs/plans/swift-app.md). Without UPDATE_FIXTURES it checks the files are current.

const dir = fileURLToPath(new URL("../Tests/Fixtures/", import.meta.url));

function outcome(run: (...args: never[]) => unknown, args: unknown[]) {
  try {
    const result = run(...(structuredClone(args) as never[]));
    return { args, result: result === undefined ? null : result };
  } catch (e) {
    return { args, throws: e instanceof Error ? e.message : String(e) };
  }
}

for (const [name, cases] of Object.entries(modules)) {
  it(`${name} fixtures are current`, () => {
    const out: Record<string, unknown[]> = {};
    for (const [fn, c] of Object.entries(cases) as [string, RuleCases][])
      out[fn] = c.args.map((a: unknown[]) => outcome(c.run, a));
    const text = `${JSON.stringify(out, null, 2)}\n`;
    const path = `${dir}${name}.json`;
    if (process.env.UPDATE_FIXTURES) {
      writeFileSync(path, text);
      return;
    }
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      // Missing file: fails below.
    }
    expect(current, `${name}.json is out of date: run pnpm --filter @leakbook/ios fixtures`).toBe(
      text,
    );
  });
}
