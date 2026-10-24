// node scripts/provision-project.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  PROTECTED_REFS,
  authSettings,
  compareSnapshots,
  postgrestSettings,
  productionRedirects,
  publicConfig,
  settingsDiff,
  shown,
} from "./provision-project.mjs";

const script = join(import.meta.dirname, "provision-project.mjs");
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

// Never --apply against the dev project; the refusal comes before any network call.
assert.ok(PROTECTED_REFS.has("evmxdfasurkaxbwkceti"));
const refused = run("--ref", "evmxdfasurkaxbwkceti", "--apply", "--from", "abcdefghijklmnopqrst");
assert.equal(refused.status, 2);
assert.match(refused.stderr, /dev project/);
assert.equal(run("--apply").status, 2, "no --ref");
assert.equal(run("--ref", "abcdefghijklmnopqrst", "--from", "abcdefghijklmnopqrst").status, 2);

// Sign-in settings: dev's, production's URLs, confirmation on, no SMTP without its password.
const dev = {
  password_min_length: 10,
  password_required_characters: "abc:ABC:012:!@#",
  jwt_exp: 3600,
  mailer_autoconfirm: true,
  site_url: "https://dev.example/",
  uri_allow_list: "http://localhost:3000/**",
  smtp_pass: "dev-secret",
  external_google_secret: "nope",
  rate_limit_email_sent: 2,
  mfa_totp_enroll_enabled: true,
  hook_send_email_uri: "pg-functions://x",
};
const templates = { confirmation: "c", invite: "i", magic_link: "m", recovery: "r" };
const plain = authSettings(dev, { siteUrl: "https://sundeckpro.com/", templates });
assert.equal(plain.password_min_length, 10);
assert.equal(plain.password_required_characters, "abc:ABC:012:!@#");
assert.equal(plain.mfa_totp_enroll_enabled, true);
assert.equal(plain.mailer_autoconfirm, false);
assert.equal(plain.site_url, "https://sundeckpro.com/");
assert.ok(!plain.uri_allow_list.includes("localhost"));
assert.ok(plain.uri_allow_list.includes("https://sundeckpro.com/**"));
for (const key of ["smtp_pass", "smtp_host", "external_google_secret", "hook_send_email_uri"]) {
  assert.ok(!(key in plain), `${key} is not copied`);
}
assert.ok(!("rate_limit_email_sent" in plain), "Supabase's built-in limit stays without SMTP");
assert.ok(!("mailer_templates_confirmation_content" in plain));

const smtp = authSettings(dev, {
  siteUrl: "https://sundeckpro.com/",
  smtpPassword: "re_x",
  templates,
});
assert.equal(smtp.smtp_pass, "re_x");
assert.equal(smtp.smtp_host, "smtp.resend.com");
assert.equal(smtp.rate_limit_email_sent, 30);
assert.equal(smtp.mailer_templates_recovery_content, "r");

// SMTP set in the dashboard: the templates and limit go on, the password isn't touched.
const dashboard = authSettings(dev, {
  siteUrl: "https://sundeckpro.com/",
  customSmtp: true,
  templates,
});
assert.ok(!("smtp_pass" in dashboard) && !("smtp_host" in dashboard));
assert.equal(dashboard.mailer_templates_confirmation_content, "c");
assert.equal(dashboard.rate_limit_email_sent, 30);

// The SMTP password can't be read back, so it never counts as a difference.
assert.deepEqual(settingsDiff({ smtp_pass: "x", jwt_exp: 3600 }, { jwt_exp: 3600 }), []);
assert.deepEqual(settingsDiff({ jwt_exp: 3600 }, { jwt_exp: 7200 }), ["jwt_exp"]);
assert.equal(shown("smtp_pass", "re_x"), "[secret]");
assert.equal(shown("password_min_length", 10), "10");
assert.equal(shown("mailer_templates_invite_content", "x".repeat(100)), "(100 characters)");
assert.equal(shown("uri_allow_list", "a".repeat(100)), JSON.stringify("a".repeat(100)));

assert.deepEqual(productionRedirects("https://sundeckpro.com/"), [
  "https://sundeckpro.com/**",
  "https://www.sundeckpro.com/**",
  "https://leaksoftware-web.vercel.app/**",
  "sundeckpro://**",
]);

// The JWT secret never leaves dev.
const rest = postgrestSettings({ db_schema: "public", max_rows: 1000, jwt_secret: "s" });
assert.ok(!("jwt_secret" in rest));

assert.deepEqual(
  publicConfig({
    ref: "abcdefghijklmnopqrst",
    region: "us-west-2",
    publishableKey: "sb_publishable_x",
    siteUrl: "https://sundeckpro.com/",
  }),
  {
    $comment: publicConfig({ ref: "a", siteUrl: "https://x/" }).$comment,
    projectRef: "abcdefghijklmnopqrst",
    url: "https://abcdefghijklmnopqrst.supabase.co",
    publishableKey: "sb_publishable_x",
    region: "us-west-2",
    webUrl: "https://sundeckpro.com",
  },
);

// The check: same migrations and rows pass; demo rows, missing migrations and different
// configuration fail.
const snap = {
  migrations: ["1", "2"],
  config: [{ name: "app.config_default", n: 7, sum: "a" }],
  buckets: [{ id: "media" }],
  policies: ["media_select"],
  extensions: ["pgcrypto"],
  timeouts: [{ role: "anon", setconfig: ["statement_timeout=3s"] }],
  schema: { tables: 1, functions: 2, policies: 3 },
  demo: { companies: 0, users: 0, customers: 0 },
};
assert.deepEqual(compareSnapshots(snap, snap, ["1", "2"]).problems, []);
const prod = {
  ...snap,
  migrations: ["1"],
  config: [{ name: "app.config_default", n: 7, sum: "b" }],
  demo: { companies: 1, users: 0, customers: 0 },
};
const { problems, notes } = compareSnapshots(snap, prod, ["1", "2"]);
assert.ok(problems.some((p) => /migrations not applied: 2/.test(p)));
assert.ok(problems.some((p) => /demo data/.test(p)));
// At different migrations, a configuration difference is only a note.
assert.ok(notes.some((n) => /config_default/.test(n)));
const sameMigrations = { ...prod, migrations: ["1", "2"], demo: snap.demo };
assert.ok(
  compareSnapshots(snap, sameMigrations, ["1", "2"]).problems.some((p) => /config_default/.test(p)),
);

console.log("provision-project: ok");
