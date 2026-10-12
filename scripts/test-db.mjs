// Run database migrations, seed, and pgTAP tests.
//
// Two modes:
//   docker  Real Supabase via the CLI (`supabase db start/reset`, `supabase test db`). Used in CI.
//   local   Plain Postgres + supabase/test-shim (for environments without Docker).
//
// Mode: DB_TEST_MODE=docker|local, default docker if `docker info` works, else local.
// Local mode connects with TEST_DATABASE_URL (superuser, any database) if set; otherwise it
// starts the Debian/Ubuntu Postgres cluster and connects as the postgres OS user.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const sb = join(root, "supabase");
const TEST_DB = "leakbook_test";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function dockerAvailable() {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

const mode = process.env.DB_TEST_MODE ?? (dockerAvailable() ? "docker" : "local");
console.log(`test:db mode: ${mode}`);

if (mode === "docker") {
  const supabase = ["exec", "supabase"];
  run("pnpm", [...supabase, "db", "start"]);
  run("pnpm", [...supabase, "db", "reset", "--local"]);
  run("pnpm", [...supabase, "test", "db"]);
  process.exit(0);
}

// ---- local mode -------------------------------------------------------------
const adminUrl = process.env.TEST_DATABASE_URL;

function psql(db, args, capture = false) {
  const base = ["-X", "-q", "-v", "ON_ERROR_STOP=1"];
  let cmd, full;
  if (adminUrl) {
    const url = new URL(adminUrl);
    if (db) url.pathname = `/${db}`;
    cmd = "psql";
    full = [url.toString(), ...base, ...args];
  } else {
    cmd = "runuser";
    full = ["-u", "postgres", "--", "psql", ...(db ? ["-d", db] : []), ...base, ...args];
  }
  if (capture) {
    const r = spawnSync(cmd, full, { cwd: "/", encoding: "utf8" });
    return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
  }
  const r = spawnSync(cmd, full, { cwd: "/", stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!adminUrl) {
  // Start the packaged cluster if it is down (idempotent).
  try {
    execFileSync("pg_ctlcluster", ["16", "main", "start"], { stdio: "ignore" });
  } catch {
    // already running, or not a Debian cluster; psql below reports real problems
  }
  const tap = "/usr/share/postgresql/16/extension/pgtap.control";
  if (!existsSync(tap)) {
    console.error("pgTAP is not installed. Run: apt-get install -y postgresql-16-pgtap");
    process.exit(1);
  }
}

psql(null, ["-c", `drop database if exists ${TEST_DB} with (force)`]);
psql(null, ["-c", `create database ${TEST_DB}`]);
psql(TEST_DB, ["-o", "/dev/null", "-f", join(sb, "test-shim", "supabase_shim.sql")]);

const migrations = readdirSync(join(sb, "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const m of migrations) {
  console.log(`migrate ${m}`);
  psql(TEST_DB, ["-o", "/dev/null", "-f", join(sb, "migrations", m)]);
}
if (existsSync(join(sb, "seed.sql"))) {
  console.log("seed");
  psql(TEST_DB, ["-o", "/dev/null", "-f", join(sb, "seed.sql")]);
}

const tests = readdirSync(join(sb, "tests"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
let failed = 0;
let total = 0;
for (const t of tests) {
  const { status, out } = psql(TEST_DB, ["-t", "-A", "-f", join(sb, "tests", t)], true);
  const lines = out.split("\n").filter((l) => l.trim());
  const notOk = lines.filter((l) => l.startsWith("not ok"));
  const ok = lines.filter((l) => l.startsWith("ok"));
  const planWarn = lines.filter((l) => /Looks like you (planned|failed)/.test(l));
  total += ok.length + notOk.length;
  const bad = status !== 0 || notOk.length > 0 || planWarn.length > 0 || ok.length === 0;
  console.log(`${bad ? "FAIL" : "ok  "} ${t} (${ok.length} passed, ${notOk.length} failed)`);
  if (bad) {
    failed++;
    console.log(out);
  }
}
console.log(`\n${tests.length} files, ${total} assertions, ${failed} failing files`);
process.exit(failed ? 1 : 0);
