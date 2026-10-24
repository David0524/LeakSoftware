// node scripts/review-account.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  DEMO_OWNER,
  OWNER,
  TECH,
  buildReviewShop,
  makePassword,
  reviewSql,
} from "./review-account.mjs";

const script = join(import.meta.dirname, "review-account.mjs");

// Applying to the dev project needs the owner's say-so (--allow-dev); refused before any query.
const refused = spawnSync(process.execPath, [script, "--apply"], { encoding: "utf8" });
assert.equal(refused.status, 2);
assert.match(refused.stderr, /dev project/);

// Passwords meet the rule (10+ characters, lower, upper, digit, symbol) and differ every time.
for (let i = 0; i < 200; i++) {
  const p = makePassword();
  assert.equal(p.length, 20);
  assert.match(p, /[a-z]/);
  assert.match(p, /[A-Z]/);
  assert.match(p, /[0-9]/);
  assert.match(p, /[!#%+=?@]/);
}
assert.notEqual(makePassword(), makePassword());

// Nothing reaches a real person: example.com addresses and 555-0100 to 555-0199 numbers only.
for (const withTech of [false, true]) {
  const shop = buildReviewShop({ withTech });
  assert.equal(shop.customers.length, 24);
  for (const c of shop.customers) {
    assert.match(c.email, /^[a-z.]+@example\.com$/);
    assert.match(c.phone, /^\(602\) 555-01\d\d$/);
    assert.ok(c.lat > 33.4 && c.lat < 33.6 && c.lng > -112.1 && c.lng < -111.9, c.name);
  }
  // A route every day of the week, three stops a day.
  for (let wd = 1; wd <= 7; wd++) {
    assert.equal(shop.plans.filter((p) => p.weekday === wd).length, 3);
  }
  assert.equal(
    shop.plans.some((p) => p.tech === "tech"),
    withTech,
  );
  assert.deepEqual(
    shop.detections.map((d) => [d.day, d.state]),
    [
      [-1, "finished"],
      [0, "scheduled"],
      [1, "scheduled"],
    ],
  );
}

// The SQL never names the demo company's rows, only finds it to stay away from it, and takes
// password hashes, never passwords.
const sql = reviewSql(buildReviewShop({ withTech: true }), {
  ownerHash: "$2a$10$owner",
  techHash: "$2a$10$tech",
});
assert.ok(sql.includes(DEMO_OWNER));
assert.ok(!/Demo Leak Co\./.test(sql));
assert.ok(!/00000000-0000-4000-8000-/.test(sql), "no seeded demo ids");
assert.ok(sql.includes(OWNER.email) && sql.includes(TECH.email));
assert.ok(sql.includes("admin_set_demo") && sql.includes("admin_extend_trial"));
assert.ok(
  !reviewSql(buildReviewShop({ withTech: false }), { ownerHash: "h", techHash: null }).includes(
    TECH.email,
  ),
);

console.log("review-account: ok");
