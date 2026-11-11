// Picks the demo shop's jobs for the Android store screenshots (.github/workflows/
// android-screenshots.yml) and prints them as KEY=value lines for $GITHUB_ENV. Signs in as the
// demo owner (the demo password is public: scripts/demo-reset.mjs) on the backend the build
// uses, config/supabase-<backend>.json. Run `pnpm demo:reset -- --apply` first so today's route
// is current.
//
//   node apps/mobile/maestro/targets.mjs dev
import { readFileSync } from "node:fs";

const backend = process.argv[2] ?? "dev";
const cfg = JSON.parse(
  readFileSync(new URL(`../../../config/supabase-${backend}.json`, import.meta.url), "utf8"),
);
const EMAIL = "owner@demo.leakbook.test";
const PASSWORD = "leakbook-demo";

const auth = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: cfg.publishableKey, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!auth.ok) throw new Error(`Demo owner sign-in failed: ${auth.status} ${await auth.text()}`);
const { access_token: token } = await auth.json();

async function first(label, query) {
  const res = await fetch(`${cfg.url}/rest/v1/job?select=id&deleted_at=is.null&limit=1&${query}`, {
    headers: { apikey: cfg.publishableKey, authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${label}: ${res.status} ${await res.text()}`);
  const [row] = await res.json();
  if (!row) throw new Error(`${label}: no job found. Run pnpm demo:reset -- --apply.`);
  return row.id;
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date());

const targets = {
  EMAIL,
  PASSWORD,
  // A leak detection being worked: its checklist, and Review with Customer.
  LEAK_JOB: await first(
    "leak detection in progress",
    "type=eq.detection&status=eq.in_progress&order=scheduled_start.desc",
  ),
  // A finished leak detection: Wrap-Up with its sent report.
  SENT_JOB: await first(
    "leak detection with a sent report",
    "type=eq.detection&status=eq.report_sent&order=scheduled_start.desc",
  ),
  // Today's (or the next) pool service visit: its checklist.
  VISIT_JOB: await first(
    "pool service visit",
    `type=eq.maintenance&plan_date=gte.${today}&order=plan_date.asc,route_order.asc`,
  ),
};
for (const [k, v] of Object.entries(targets)) console.log(`${k}=${v}`);
