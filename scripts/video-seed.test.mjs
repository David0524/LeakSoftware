// node scripts/video-seed.test.mjs — checks the video shops' generator (no database).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildVideo, CANYON_ID, ID_PREFIX, MESA_ID, SHOPS_TEAM } from "./video-seed.mjs";

const today = "2026-10-21"; // a Wednesday
const video = buildVideo(today);
const [canyon, mesa] = video.shops;
assert.equal(canyon.id, CANYON_ID);
assert.equal(mesa.id, MESA_ID);

// The same shops every run: names, places and amounts (job ids are new each run).
const strip = (v) =>
  JSON.stringify(v, (k, x) =>
    ["id", "report", "from_quote", "parent_id", "finding_id", "plan_id", "quote_id"].includes(k)
      ? undefined
      : x,
  );
assert.equal(
  strip(buildVideo(today).shops.map((s) => s.customers)),
  strip(video.shops.map((s) => s.customers)),
);
assert.equal(
  strip(buildVideo(today).shops.map((s) => s.jobs)),
  strip(video.shops.map((s) => s.jobs)),
);

// Fixed ids are in their own range, never demo-reset's (00000000-0000-4000-8000-…).
const fixed = [
  ...video.shops.flatMap((s) => [s.id, ...s.customers.flatMap((c) => [c.id, c.property_id])]),
  ...Object.values(SHOPS_TEAM)
    .flat()
    .map((t) => t.id),
];
for (const id of fixed) assert.ok(id.startsWith(ID_PREFIX), id);
assert.equal(new Set(fixed).size, fixed.length, "fixed ids are unique");

// demo-reset's test-run cleanup can't match a name here, and nothing says "demo".
const source = readFileSync(join(import.meta.dirname, "demo-reset.mjs"), "utf8");
const testName = new RegExp(source.match(/TEST_NAME = String\.raw`([^`]+)`/)[1]);
const names = video.shops.flatMap((s) => [
  s.name,
  ...s.customers.map((c) => c.name),
  ...s.team.map((t) => t.name),
]);
for (const name of names) assert.ok(!testName.test(name), `${name} looks like a test run's`);
assert.ok(!/demo/i.test(JSON.stringify(video.shops)), "nothing visible says demo");

// Canyon State: Rebecca Soto is Dana's first stop today, 9:30, not started.
const dana = SHOPS_TEAM.canyon.find((t) => t.key === "dana").id;
const todays = canyon.jobs
  .filter((j) => j.tech === dana && j.start?.startsWith(today))
  .sort((p, q) => (p.start < q.start ? -1 : 1));
assert.equal(todays[0].customer, "Rebecca Soto");
assert.equal(todays[0].start, `${today} 09:30`);
assert.equal(todays[0].checklist, "pending");
assert.equal(todays[0].started, undefined);
assert.ok(todays.length >= 2);

// Gregory Lin, the day before: the same story finished.
const gregory = canyon.jobs.find((j) => j.customer === "Gregory Lin" && j.type === "detection");
assert.equal(gregory.start, "2026-10-20 13:00");
assert.deepEqual(
  gregory.tests.filter((t) => t.outcome === "fail").map((t) => `${t.type} ${t.component}`),
  ["pressure return", "dye light", "bucket null"],
);
assert.equal(gregory.tests.find((t) => t.component === "return").computed.drop_psi, 8);
assert.ok(gregory.report);
const [q] = gregory.quotes;
assert.equal(q.lines.length, 3);
assert.equal(q.total, 184000);
assert.equal(q.deposit, 92000);
assert.equal(q.status, "accepted");
assert.equal(q.deposit_method, "card");
assert.deepEqual(gregory.path, ["report_sent", "quote_sent", "quote_accepted", "invoiced", "paid"]);

// Blue Mesa: 50 plans; Priya has 12 today with Megan Price 4th.
assert.equal(mesa.plans.length, 50);
assert.deepEqual(mesa.priyaToday.length, 12);
assert.equal(mesa.priyaToday[3], "Megan Price");
assert.ok(mesa.invoices.filter((i) => i.payments.length).length > mesa.invoices.length * 0.9);
assert.ok(
  mesa.jobs.some((j) => j.findings.some((f) => f.title === "Pump noise") && j.quotes.length),
);
const priya = SHOPS_TEAM.mesa.find((t) => t.key === "priya").id;
assert.ok(
  !mesa.jobs.some((j) => j.tech === priya && j.start?.startsWith(today)),
  "only plan visits",
);

// Nothing has happened after the end of the working day before today.
const events = video.shops.flatMap((s) =>
  s.jobs.flatMap((j) => [
    j.created,
    j.completed,
    j.report?.sent_at,
    ...j.quotes.flatMap((x) => [x.sent_at, x.accepted_at]),
    ...j.invoices.flatMap((i) => [i.sent_at, ...i.payments.map((p) => p.paid_at)]),
  ]),
);
for (const e of events.filter(Boolean)) assert.ok(e <= "2026-10-20 19:30", e);

// A weekend "today" still works: Priya's big day is Monday, Rebecca is still today.
const weekend = buildVideo("2026-10-24");
assert.equal(weekend.shops[1].bigDay, 1);
assert.ok(
  weekend.shops[0].jobs.some(
    (j) => j.customer === "Rebecca Soto" && j.start === "2026-10-24 09:30",
  ),
);

console.log("video-seed: ok");
