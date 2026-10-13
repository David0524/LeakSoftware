import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  JOB_INITIAL_STATUSES,
  JOB_SERVER_STATUSES,
  JOB_STATUS_TRANSITIONS,
  JOB_STATUSES,
  canTransition,
  userTransitions,
} from "../src";

const dir = join(import.meta.dirname, "../../../supabase/migrations");
const migration = readFileSync(join(dir, "20261012000300_jobs.sql"), "utf8");
// Later migrations add transitions too (maintenance's Done).
const allMigrations = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"));

function sqlArray(fn: string): string[] {
  const m = migration.match(new RegExp(`${fn}\\(\\)[\\s\\S]*?array\\[([^\\]]*)\\]`));
  if (!m?.[1]) throw new Error(`could not find ${fn} in migration`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
}

describe("job status machine", () => {
  it("matches the database transition table", () => {
    const fromSql = allMigrations
      .flatMap((sql) =>
        sql
          .split("insert into app.job_status_transition")
          .slice(1)
          .map((part) => part.split(";")[0]!),
      )
      .flatMap((block) => [...block.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)])
      .map((m) => `${m[1]}>${m[2]}`)
      .sort();
    const fromTs = Object.entries(JOB_STATUS_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`))
      .sort();
    expect(fromSql.length).toBeGreaterThan(0);
    expect(fromTs).toEqual(fromSql);
  });

  it("matches the database initial and server-only statuses", () => {
    expect([...JOB_INITIAL_STATUSES].sort()).toEqual(sqlArray("job_initial_statuses").sort());
    expect([...JOB_SERVER_STATUSES].sort()).toEqual(sqlArray("job_server_statuses").sort());
  });

  it("only uses known statuses", () => {
    for (const [from, tos] of Object.entries(JOB_STATUS_TRANSITIONS)) {
      expect(JOB_STATUSES).toContain(from);
      for (const to of tos) expect(JOB_STATUSES).toContain(to);
    }
  });

  it("allows the main loop and blocks skipping ahead", () => {
    expect(canTransition("in_progress", "report_sent")).toBe(true);
    expect(canTransition("quote_accepted", "invoiced")).toBe(true);
    expect(canTransition("scheduled", "paid")).toBe(false);
    expect(canTransition("paid", "canceled")).toBe(false);
  });

  it("does not offer server-only statuses to people", () => {
    expect(userTransitions("in_progress")).toEqual(["scheduled", "canceled"]);
  });

  it("offers Done only for maintenance visits", () => {
    expect(userTransitions("in_progress", "detection")).not.toContain("done");
    expect(userTransitions("in_progress", "maintenance")).toEqual([
      "scheduled",
      "canceled",
      "done",
    ]);
    expect(userTransitions("done", "maintenance")).toEqual(["in_progress"]);
  });
});
