// Apply pending migrations (and optionally the demo seed) to a hosted Supabase project
// through the Management API. Used where direct Postgres connections are unavailable,
// such as Claude cloud sessions; the API token is attached by the environment's network
// secret, or by SUPABASE_ACCESS_TOKEN when set.
//
//   NODE_USE_ENV_PROXY=1 node scripts/deploy-db.mjs [--seed] [--dry-run] [--ref <project-ref>]
//
// Applied migrations are recorded in supabase_migrations.schema_migrations, the same table
// the Supabase CLI uses, so `supabase db push` can take over later.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const refArg = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : undefined;
const ref =
  refArg ?? JSON.parse(readFileSync(join(root, "config", "supabase-dev.json"), "utf8")).projectRef;

async function query(sql) {
  const headers = { "content-type": "application/json" };
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    headers.authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${body.message ?? JSON.stringify(body)}`);
  }
  return body;
}

const quote = (s) => `'${s.replaceAll("'", "''")}'`;

await query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text);
`);
const applied = new Set(
  (await query("select version from supabase_migrations.schema_migrations")).map((r) => r.version),
);

const files = readdirSync(join(root, "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const pending = files.filter((f) => !applied.has(f.split("_")[0]));

console.log(`project ${ref}: ${applied.size} applied, ${pending.length} pending`);
for (const f of pending) {
  const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
  const name = rest.join("_");
  console.log(`${flag("--dry-run") ? "would apply" : "apply"} ${f}`);
  if (flag("--dry-run")) continue;
  const sql = readFileSync(join(root, "supabase", "migrations", f), "utf8");
  await query(`begin;
${sql}
;
insert into supabase_migrations.schema_migrations (version, name, statements)
values (${quote(version)}, ${quote(name)}, array[]::text[]);
commit;`);
}

if (flag("--seed") && !flag("--dry-run")) {
  const exists = await query(
    "select count(*)::int as n from public.company where name = 'Demo Leak Co.'",
  );
  if (exists[0].n > 0) {
    console.log("seed: demo company already present, skipped");
  } else {
    await query(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
    console.log("seed: applied");
  }
  // Idempotent: adds the sample inspection once.
  await query(readFileSync(join(root, "supabase", "seed_sample_job.sql"), "utf8"));
  console.log("seed: sample inspection checked");
  // Idempotent: more techs, customers, and a two-week schedule, once.
  await query(readFileSync(join(root, "supabase", "seed_demo_schedule.sql"), "utf8"));
  console.log("seed: demo schedule checked");
  // Idempotent: fuller routes (four or five stops a tech a weekday), once.
  await query(readFileSync(join(root, "supabase", "seed_demo_routes.sql"), "utf8"));
  console.log("seed: demo routes checked");
}
console.log("done");
