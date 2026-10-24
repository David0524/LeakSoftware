// Make a new Supabase project a copy of the dev project's setup, without its data
// (docs/release/PRODUCTION.md). Through the Management API, like scripts/deploy-db.mjs: the
// API token is attached by the cloud session's network secret, or by SUPABASE_ACCESS_TOKEN.
//
//   NODE_USE_ENV_PROXY=1 node scripts/provision-project.mjs --ref <new-ref>           dry run
//   NODE_USE_ENV_PROXY=1 node scripts/provision-project.mjs --ref <new-ref> --apply   does it
//
//   --from <ref>       the project to copy settings from (default: config/supabase-dev.json's)
//   --site-url <url>   the new project's site URL (default https://sundeckpro.com/)
//
// What it does, in order:
//   1. Checks both projects (status, region).
//   2. Applies the migrations with scripts/deploy-db.mjs. Never the demo seed: supabase/seed.sql
//      and the seed_*.sql files hold only the demo company. The configuration every new shop
//      starts from (checklist components, test types, severities, exclusion reasons, report
//      templates, the price book) is in the migrations (app.config_default, copied into a shop
//      by create_company), so the migrations bring all of it.
//   3. Copies the sign-in settings (password rule, sessions, two-step, passkeys, rate limits,
//      email subjects) from the dev project, except the site URL and redirect URLs, which are set
//      to production's. With SUPABASE_SMTP_PASSWORD set (a Resend API key with sending access for
//      send.sundeckpro.com), also Supabase's email through Resend and the templates in
//      supabase/templates/; without it, Supabase's built-in email stays (the website sends its
//      own confirmation, sign-in and reset emails through Resend anyway).
//   4. Copies the storage per-file limit and the API settings (schemas, row limit, search path;
//      never the JWT secret). The buckets, their limits and policies are migrations.
//   5. Copies app.platform_setting (a card at sign-up).
//   6. Checks the result against the dev project: every migration applied, the same
//      configuration rows, buckets, storage policies, extensions and role timeouts, the sign-in
//      settings as set, and no demo data.
//   7. With --apply, writes config/supabase-prod.json (public settings only: URL and
//      publishable key) for the apps' production builds. Commit it.
//
// It refuses --apply against the dev project. Run it again any time: every step is idempotent,
// and a dry run against a provisioned project is a check.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const devConfig = JSON.parse(readFileSync(join(root, "config", "supabase-dev.json"), "utf8"));

/** Projects this script never changes: the dev project, by its ref, whatever the config says. */
export const PROTECTED_REFS = new Set(["evmxdfasurkaxbwkceti", devConfig.projectRef]);

export const PRODUCTION_SITE_URL = "https://sundeckpro.com/";

/**
 * Where Supabase may send people back to after an email link. Production's own addresses only:
 * no localhost, Expo Go or Vercel previews (those stay on the dev project). The website makes
 * every link (`/auth/confirm`), and `sundeckpro://` is the apps' scheme.
 */
export function productionRedirects(siteUrl) {
  const origin = new URL(siteUrl).origin;
  const www = origin.replace("://", "://www.");
  return [`${origin}/**`, `${www}/**`, "https://leaksoftware-web.vercel.app/**", "sundeckpro://**"];
}

/**
 * Sign-in settings copied from the dev project as they are. Everything not listed keeps
 * Supabase's default on the new project: providers (only email is on), SMS, hooks, SAML and
 * captcha are all off on dev. Secrets (SMTP password, provider secrets) are never copied.
 */
export const COPIED_AUTH_KEYS = [
  "disable_signup",
  "external_email_enabled",
  "external_phone_enabled",
  "external_anonymous_users_enabled",
  "security_manual_linking_enabled",
  "security_captcha_enabled",
  // Passwords: 10 characters with lower, upper, digits and symbols (owner, 2026-10-24).
  "password_min_length",
  "password_required_characters",
  "password_hibp_enabled",
  // Sessions and tokens.
  "jwt_exp",
  "refresh_token_rotation_enabled",
  "security_refresh_token_reuse_interval",
  "sessions_timebox",
  "sessions_inactivity_timeout",
  "sessions_single_per_user",
  // Email links and codes.
  "mailer_otp_exp",
  "mailer_otp_length",
  "mailer_secure_email_change_enabled",
  "smtp_max_frequency",
  "mailer_subjects_confirmation",
  "mailer_subjects_email_change",
  "mailer_subjects_invite",
  "mailer_subjects_magic_link",
  "mailer_subjects_reauthentication",
  "mailer_subjects_recovery",
  // Two-step sign-in and passkeys (the Admin portal needs two-step).
  "mfa_max_enrolled_factors",
  "mfa_totp_enroll_enabled",
  "mfa_totp_verify_enabled",
  "mfa_phone_enroll_enabled",
  "mfa_phone_verify_enabled",
  "mfa_web_authn_enroll_enabled",
  "mfa_web_authn_verify_enabled",
  "passkey_enabled",
  "webauthn_rp_display_name",
  "webauthn_rp_id",
  "webauthn_rp_origins",
  // Rate limits (per IP address; email is set below with the SMTP settings).
  "rate_limit_anonymous_users",
  "rate_limit_sms_sent",
  "rate_limit_token_refresh",
  "rate_limit_verify",
  "rate_limit_otp",
  "rate_limit_web3",
  // The auth server's own connections.
  "api_max_request_duration",
  "db_max_pool_size",
  "db_max_pool_size_unit",
];

/** Supabase's own email through Resend (docs/OWNER_TODO.md), when its key is given. */
export const SMTP = {
  smtp_host: "smtp.resend.com",
  smtp_port: "465",
  smtp_user: "resend",
  smtp_admin_email: "account@send.sundeckpro.com",
  smtp_sender_name: "Sundeck Pro",
};
/** Custom SMTP lifts Supabase's 2 an hour; this is Supabase's own default with custom SMTP. */
export const SMTP_EMAILS_PER_HOUR = 30;
const TEMPLATES = ["confirmation", "invite", "magic_link", "recovery"];

/**
 * The sign-in settings for the new project: dev's, with production's URLs, email confirmation
 * on, and Resend's SMTP and the repository's templates when `smtpPassword` is given.
 */
export function authSettings(devAuth, { siteUrl, smtpPassword, templates }) {
  const settings = {};
  for (const key of COPIED_AUTH_KEYS) {
    if (devAuth[key] !== undefined && devAuth[key] !== null) settings[key] = devAuth[key];
  }
  settings.site_url = siteUrl;
  settings.uri_allow_list = productionRedirects(siteUrl).join(",");
  // Production keeps email confirmation on (docs/DECISIONS.md), whatever dev has.
  settings.mailer_autoconfirm = false;
  if (smtpPassword) {
    Object.assign(settings, SMTP, { smtp_pass: smtpPassword });
    settings.rate_limit_email_sent = SMTP_EMAILS_PER_HOUR;
    for (const name of TEMPLATES) {
      settings[`mailer_templates_${name}_content`] = templates[name];
    }
  }
  return settings;
}

/** Keys whose value on the project differs from what is wanted (the SMTP password can't be read back). */
export function settingsDiff(wanted, actual) {
  return Object.keys(wanted).filter(
    (key) => key !== "smtp_pass" && JSON.stringify(wanted[key]) !== JSON.stringify(actual?.[key]),
  );
}

/** A value fit to print: secrets hidden, templates and long text shortened. */
export function shown(key, value) {
  if (/pass|secret|token|key$/i.test(key) && !/^(password_|passkey_)/.test(key)) return "[secret]";
  if (key === "uri_allow_list") return JSON.stringify(value);
  if (typeof value === "string" && value.length > 80) return `(${value.length} characters)`;
  return JSON.stringify(value);
}

/** The storage and API settings copied from dev. Never the JWT secret. */
export function storageSettings(devStorage) {
  return { fileSizeLimit: devStorage.fileSizeLimit };
}
export function postgrestSettings(devPostgrest) {
  return {
    db_schema: devPostgrest.db_schema,
    max_rows: devPostgrest.max_rows,
    db_extra_search_path: devPostgrest.db_extra_search_path,
  };
}

/** config/supabase-prod.json: public settings only, like supabase-dev.json. */
export function publicConfig({ ref, region, publishableKey, siteUrl }) {
  return {
    $comment:
      "Public settings for the production Supabase project (docs/release/PRODUCTION.md). Safe to commit: the publishable key ships inside the apps and RLS protects the data. Never put secret or service_role keys here.",
    projectRef: ref,
    url: `https://${ref}.supabase.co`,
    publishableKey,
    region,
    webUrl: new URL(siteUrl).origin,
  };
}

/**
 * Configuration tables compared between the projects: what every shop starts from and the
 * platform's own settings. Timestamps are left out; rows are compared as a whole.
 */
export const CONFIG_TABLES = [
  ["app.config_default", "key"],
  ["app.access_code", "code"],
  ["app.mapbox_budget", "1"],
  ["app.job_status_transition", "1"],
  ["app.sync_table", "1"],
  ["app.platform_setting", "key"],
];
const configChecksumSql = CONFIG_TABLES.map(
  ([table, order]) =>
    `select ${quote(table)} as name, count(*)::int as n,
       md5(coalesce(string_agg((to_jsonb(t) - 'created_at' - 'updated_at')::text, '|'
         order by ${order === "1" ? "to_jsonb(t)::text" : order}), '')) as sum
     from ${table} t`,
).join("\nunion all\n");

function quote(s) {
  return `'${String(s).replaceAll("'", "''")}'`;
}

// ---------------------------------------------------------------------------
// The Management API
// ---------------------------------------------------------------------------

export async function api(ref, path, { method = "GET", body } = {}) {
  const headers = { "content-type": "application/json" };
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    headers.authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} on ${ref}: HTTP ${res.status}: ${json.message ?? text}`);
  }
  return json;
}

const sql = (ref, query, readOnly = true) =>
  api(ref, "/database/query", { method: "POST", body: { query, read_only: readOnly } });

/** What the checks compare, read from one project (null when it has no migrations yet). */
export async function snapshot(ref) {
  const [{ ready }] = await sql(
    ref,
    "select to_regclass('supabase_migrations.schema_migrations') is not null as ready",
  );
  if (!ready) return null;
  const migrations = (
    await sql(ref, "select version from supabase_migrations.schema_migrations")
  ).map((r) => r.version);
  const [hasApp] = await sql(ref, "select to_regclass('app.config_default') is not null as ok");
  const config = hasApp.ok ? await sql(ref, configChecksumSql) : [];
  const buckets = await sql(
    ref,
    `select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id`,
  );
  const policies = (
    await sql(
      ref,
      `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
       order by 1`,
    )
  ).map((r) => r.policyname);
  const extensions = (await sql(ref, "select extname from pg_extension order by 1")).map(
    (r) => r.extname,
  );
  const timeouts = await sql(
    ref,
    `select r.rolname as role, s.setconfig from pg_db_role_setting s
     join pg_roles r on r.oid = s.setrole
     where r.rolname in ('anon', 'authenticated', 'authenticator') order by 1`,
  );
  const [schema] = await sql(
    ref,
    `select
       (select count(*) from information_schema.tables
        where table_schema in ('public', 'app'))::int as tables,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app'))::int as functions,
       (select count(*) from pg_policies where schemaname in ('public', 'storage'))::int as policies`,
  );
  const [demo] = hasApp.ok
    ? await sql(
        ref,
        `select
           (select count(*) from public.company where name = 'Demo Leak Co.')::int as companies,
           (select count(*) from auth.users where email like '%@demo.leakbook.test'
              or email like '%.video.test')::int as users,
           (select count(*) from public.customer
            where id::text like '00000000-0000-4000-8000-%')::int as customers`,
      )
    : [{ companies: 0, users: 0, customers: 0 }];
  return { migrations, config, buckets, policies, extensions, timeouts, schema, demo };
}

/** Problems with `prod` measured against `dev` and the repository's migrations. */
export function compareSnapshots(dev, prod, repoVersions) {
  const problems = [];
  const notes = [];
  const missing = repoVersions.filter((v) => !prod.migrations.includes(v));
  if (missing.length)
    problems.push(`${missing.length} migrations not applied: ${missing.join(", ")}`);
  const devBehind = repoVersions.filter((v) => !dev.migrations.includes(v));
  const same = JSON.stringify(a(dev.migrations)) === JSON.stringify(a(prod.migrations));
  for (const row of prod.config) {
    const d = dev.config.find((c) => c.name === row.name);
    if (!d) continue;
    if (d.sum !== row.sum) {
      const line = `${row.name}: ${row.n} rows here, ${d.n} on dev, and they differ`;
      // A difference is a problem only when both are at the same migrations: otherwise a
      // migration not yet on one of them explains it.
      (same ? problems : notes).push(line);
    }
  }
  if (JSON.stringify(dev.buckets) !== JSON.stringify(prod.buckets)) {
    (same ? problems : notes).push(
      `storage buckets differ: ${JSON.stringify(prod.buckets.map((b) => b.id))}`,
    );
  }
  if (JSON.stringify(dev.policies) !== JSON.stringify(prod.policies)) {
    (same ? problems : notes).push("storage policies differ from dev's");
  }
  const extra = (list, other) => list.filter((x) => !other.includes(x));
  if (extra(dev.extensions, prod.extensions).length) {
    problems.push(`extensions missing: ${extra(dev.extensions, prod.extensions).join(", ")}`);
  }
  if (extra(prod.extensions, dev.extensions).length) {
    notes.push(`extensions only here: ${extra(prod.extensions, dev.extensions).join(", ")}`);
  }
  if (JSON.stringify(dev.timeouts) !== JSON.stringify(prod.timeouts)) {
    problems.push(
      `role settings differ: dev ${JSON.stringify(dev.timeouts)}, here ${JSON.stringify(prod.timeouts)}`,
    );
  }
  if (same && JSON.stringify(dev.schema) !== JSON.stringify(prod.schema)) {
    problems.push(
      `schema counts differ: dev ${JSON.stringify(dev.schema)}, here ${JSON.stringify(prod.schema)}`,
    );
  }
  if (prod.demo.companies || prod.demo.users || prod.demo.customers) {
    problems.push(`demo data present: ${JSON.stringify(prod.demo)}`);
  }
  if (devBehind.length) {
    notes.push(`dev itself is missing ${devBehind.length} migrations (${devBehind.join(", ")})`);
  }
  return { problems, notes };
}
const a = (list) => [...list].sort();

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const apply = flag("--apply");
  const ref = option("--ref");
  const from = option("--from") ?? devConfig.projectRef;
  const siteUrl = option("--site-url") ?? PRODUCTION_SITE_URL;
  const smtpPassword = process.env.SUPABASE_SMTP_PASSWORD || "";

  if (!ref || !/^[a-z]{20}$/.test(ref)) {
    console.error("Give the new project's reference: --ref <20 lowercase letters>");
    process.exit(2);
  }
  if (ref === from) {
    console.error("--ref and --from are the same project.");
    process.exit(2);
  }
  if (apply && PROTECTED_REFS.has(ref)) {
    console.error(`Refusing: ${ref} is the dev project. This script only sets up a new project.`);
    process.exit(2);
  }
  if (!/^https:\/\/[^/]+\/$/.test(siteUrl)) {
    console.error(
      "--site-url must be an https origin ending in a slash, like https://sundeckpro.com/",
    );
    process.exit(2);
  }
  const mode = apply ? "apply" : "dry run";
  const failures = [];
  console.log(`Provision ${ref} from ${from} (${mode})\n`);

  // 1. The projects.
  const [target, source] = await Promise.all([api(ref, ""), api(from, "")]);
  console.log(`target  ${target.name} · ${target.region} · ${target.status}`);
  console.log(`source  ${source.name} · ${source.region} · ${source.status}`);
  if (target.status !== "ACTIVE_HEALTHY") {
    console.error(`\nThe new project isn't ready (${target.status}). Wait a minute and run again.`);
    process.exit(1);
  }
  if (target.region !== source.region) {
    console.log(`  note: regions differ (${target.region} vs ${source.region}); see PRODUCTION.md`);
  }

  // 2. Migrations, through deploy-db (never --seed).
  console.log("\n— Migrations");
  const deploy = spawnSync(
    process.execPath,
    [
      join(root, "scripts", "deploy-db.mjs"),
      "--ref",
      ref,
      "--production",
      ...(apply ? [] : ["--dry-run"]),
    ],
    { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", env: process.env },
  );
  const deployOut = deploy.stdout.trim().split("\n");
  const applyLines = deployOut.filter((l) => /^(would apply|apply) /.test(l));
  for (const line of deployOut.filter((l) => !/^(would apply|apply) |^done$/.test(l))) {
    console.log(`  ${line}`);
  }
  if (applyLines.length) {
    console.log(`  ${applyLines[0]}`);
    if (applyLines.length > 2) console.log(`  … ${applyLines.length - 2} more …`);
    if (applyLines.length > 1) console.log(`  ${applyLines.at(-1)}`);
  }
  if (deploy.status !== 0) {
    console.error("  deploy-db failed; nothing after it was done.");
    process.exit(1);
  }

  // 3. Sign-in settings.
  console.log("\n— Sign-in (Authentication)");
  const templates = Object.fromEntries(
    TEMPLATES.map((name) => [
      name,
      readFileSync(join(root, "supabase", "templates", `${name}.html`), "utf8"),
    ]),
  );
  const [devAuth, prodAuth] = await Promise.all([
    api(from, "/config/auth"),
    api(ref, "/config/auth"),
  ]);
  const wanted = authSettings(devAuth, { siteUrl, smtpPassword, templates });
  const changes = settingsDiff(wanted, prodAuth);
  for (const key of changes) {
    console.log(`  ${key}: ${shown(key, prodAuth[key])} → ${shown(key, wanted[key])}`);
  }
  if (!changes.length) console.log("  already as wanted");
  if (!smtpPassword) {
    console.log(
      "  SMTP: not set (no SUPABASE_SMTP_PASSWORD). Supabase's built-in email stays, 2 an hour,\n" +
        "        with its default templates. The website's own emails don't use it.",
    );
  }
  if (apply && (changes.length || smtpPassword)) {
    await api(ref, "/config/auth", { method: "PATCH", body: wanted });
    const after = await api(ref, "/config/auth");
    const still = settingsDiff(wanted, after);
    if (still.length) failures.push(`sign-in settings not taken: ${still.join(", ")}`);
    else console.log(`  set ${Object.keys(wanted).length} settings`);
  }

  // 4. Storage and API settings.
  console.log("\n— Storage and API settings");
  const [devStorage, prodStorage, devRest, prodRest] = await Promise.all([
    api(from, "/config/storage"),
    api(ref, "/config/storage"),
    api(from, "/postgrest"),
    api(ref, "/postgrest"),
  ]);
  const storageWanted = storageSettings(devStorage);
  const restWanted = postgrestSettings(devRest);
  const storageChanges = settingsDiff(storageWanted, prodStorage);
  const restChanges = settingsDiff(restWanted, prodRest);
  for (const key of storageChanges) {
    console.log(
      `  storage ${key}: ${shown(key, prodStorage[key])} → ${shown(key, storageWanted[key])}`,
    );
  }
  for (const key of restChanges) {
    console.log(`  api ${key}: ${shown(key, prodRest[key])} → ${shown(key, restWanted[key])}`);
  }
  if (!storageChanges.length && !restChanges.length) console.log("  already as wanted");
  if (apply && storageChanges.length) {
    await api(ref, "/config/storage", { method: "PATCH", body: storageWanted });
  }
  if (apply && restChanges.length) {
    await api(ref, "/postgrest", { method: "PATCH", body: restWanted });
  }

  // 5. Platform settings (a card at sign-up).
  console.log("\n— Platform settings");
  const devSettings = await sql(from, "select key, value from app.platform_setting order by key");
  for (const s of devSettings) {
    console.log(`  ${apply ? "set" : "would set"} ${s.key} = ${JSON.stringify(s.value)}`);
  }
  if (apply && devSettings.length) {
    await sql(
      ref,
      `insert into app.platform_setting (key, value) values ${devSettings
        .map((s) => `(${quote(s.key)}, ${quote(JSON.stringify(s.value))}::jsonb)`)
        .join(", ")}
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      false,
    );
  }

  // 6. Check.
  console.log("\n— Check against dev");
  const repoVersions = readdirSync(join(root, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.split("_")[0]);
  const [devSnap, prodSnap] = await Promise.all([snapshot(from), snapshot(ref)]);
  if (!prodSnap) {
    console.log("  no migrations here yet (run with --apply)");
  } else {
    const { problems, notes } = compareSnapshots(devSnap, prodSnap, repoVersions);
    for (const n of notes) console.log(`  note: ${n}`);
    for (const p of problems) console.log(`  PROBLEM: ${p}`);
    if (!problems.length) {
      console.log(
        `  ok: ${prodSnap.migrations.length} migrations, ${prodSnap.config.length} configuration tables, ` +
          `${prodSnap.buckets.length} buckets, ${prodSnap.policies.length} storage policies, no demo data`,
      );
    }
    // A dry run against a provisioned project is a check, so problems fail it too.
    failures.push(...problems);
  }
  const authNow = apply ? await api(ref, "/config/auth") : prodAuth;
  if (authNow.mailer_autoconfirm) {
    if (apply) failures.push("email confirmation is off (mailer_autoconfirm)");
    else console.log("  note: email confirmation is off until --apply");
  }

  // 7. The apps' public settings.
  const configPath = join(root, "config", "supabase-prod.json");
  if (apply) {
    const keys = await api(ref, "/api-keys");
    const publishable = keys.find((k) => k.type === "publishable")?.api_key;
    if (!publishable) {
      failures.push("no publishable key on the project (Settings › API Keys › create one)");
    } else {
      const config = publicConfig({
        ref,
        region: target.region,
        publishableKey: publishable,
        siteUrl,
      });
      writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
      console.log(`\nWrote config/supabase-prod.json (${config.url}). Commit it.`);
    }
  } else {
    console.log(
      `\nWould write config/supabase-prod.json (${existsSync(configPath) ? "replacing" : "new"}).`,
    );
  }

  if (failures.length) {
    console.error(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log(apply ? "\nDone." : "\nDry run: nothing changed. Run with --apply to do it.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
