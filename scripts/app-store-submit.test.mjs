// node scripts/app-store-submit.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fieldText, plan, plistVersion } from "./app-store-submit.mjs";

const v = (id, versionString, appVersionState) => ({
  id,
  attributes: { versionString, appVersionState },
});

// A new version is made once the last one is out.
assert.deepEqual(plan([v("a", "1.0.0", "READY_FOR_DISTRIBUTION")], "1.0.1"), { create: true });
assert.deepEqual(plan([], "1.0.1"), { create: true });
// The same version, still editable (or rejected), is reused.
assert.deepEqual(plan([v("b", "1.0.1", "PREPARE_FOR_SUBMISSION")], "1.0.1"), { use: "b" });
assert.deepEqual(plan([v("b", "1.0.1", "REJECTED")], "1.0.1"), { use: "b" });
// Another editable version takes the new number.
assert.deepEqual(plan([v("c", "1.0.2", "PREPARE_FOR_SUBMISSION")], "1.0.1"), {
  rename: "c",
  from: "1.0.2",
});
// Already submitted: nothing to do.
assert.match(plan([v("b", "1.0.1", "WAITING_FOR_REVIEW")], "1.0.1").done, /WAITING_FOR_REVIEW/);
// An approved version waiting for release blocks a new one, and says what to do.
assert.match(
  plan([v("a", "1.0.0", "PENDING_DEVELOPER_RELEASE")], "1.0.1").blocked,
  /1\.0\.0 is approved and waiting for you to release it/,
);
// The older attribute is read when the newer one is missing.
assert.deepEqual(
  plan(
    [{ id: "d", attributes: { versionString: "1.0.1", appStoreState: "DEVELOPER_REJECTED" } }],
    "1.0.1",
  ),
  { use: "d" },
);

// The fields come from the real files.
const root = new URL("..", import.meta.url);
assert.match(
  plistVersion(readFileSync(new URL("apps/ios/Info.plist", root), "utf8")),
  /^\d+\.\d+\.\d+$/,
);
const md = readFileSync(new URL("docs/release/APP_STORE.md", root), "utf8");
assert.ok(fieldText(md, "whats-new").length > 0);
assert.throws(() => fieldText("<!-- field:x limit:3 -->\n```text\nabcd\n```", "x"), /limit is 3/);
console.log("app-store-submit: ok");
