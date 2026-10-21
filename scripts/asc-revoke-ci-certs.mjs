// Revokes the Apple Development certificates that TestFlight runs leave behind (owner,
// 2026-10-21: "Yes, start clearing out going forward"). Automatic signing on a fresh CI runner
// makes a new development certificate through the App Store Connect API on every run, and its
// private key leaves with the runner, so the certificate is never used again; the account's
// limit then stops the next upload ("Your account has reached the maximum number of
// certificates").
//
// Only development certificates that Apple lists as made through the API ("Created via API")
// are revoked. Certificates made on a Mac (named after the person) and every distribution
// certificate stay. Never fails the run: a problem is printed as a warning.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (the .p8 file). Usage: node scripts/asc-revoke-ci-certs.mjs

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const API = "https://api.appstoreconnect.apple.com/v1";
const DEV_TYPES = ["DEVELOPMENT", "IOS_DEVELOPMENT"];

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** An App Store Connect API token (ES256, 10 minutes). */
export function ascToken({ keyId, issuerId, p8 }, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iss: issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }),
  );
  const key = createPrivateKey(p8);
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Whether a certificate is one a CI run made and left behind. */
export function madeByCi(cert) {
  const a = cert?.attributes ?? {};
  if (!DEV_TYPES.includes(a.certificateType)) return false;
  return /created via api/i.test(`${a.name ?? ""} ${a.displayName ?? ""}`);
}

async function main() {
  const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId, ASC_KEY_PATH: path } = process.env;
  if (!keyId || !issuerId || !path) {
    console.log("::warning::App Store Connect key missing; no certificates cleared.");
    return;
  }
  const token = ascToken({ keyId, issuerId, p8: readFileSync(path, "utf8") });
  const headers = { authorization: `Bearer ${token}` };
  const url = `${API}/certificates?filter[certificateType]=${DEV_TYPES.join(",")}&limit=200`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.log(`::warning::Couldn't list certificates (HTTP ${res.status}); none cleared.`);
    return;
  }
  const { data = [] } = await res.json();
  const stale = data.filter(madeByCi);
  console.log(`${data.length} development certificates; ${stale.length} made by CI runs.`);
  for (const c of stale) {
    const r = await fetch(`${API}/certificates/${c.id}`, { method: "DELETE", headers });
    const label = `${c.attributes?.name ?? c.id} (expires ${c.attributes?.expirationDate ?? "?"})`;
    if (r.ok || r.status === 204) console.log(`Revoked ${label}`);
    else console.log(`::warning::Couldn't revoke ${label}: HTTP ${r.status}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => console.log(`::warning::Certificate cleanup failed: ${e.message}`));
}
