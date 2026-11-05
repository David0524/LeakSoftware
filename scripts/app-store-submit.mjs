// Shows where the iPhone app stands on App Store Connect, and submits an update for App Review
// (owner, 2026-11-05: "Submit latest app update to Apple"). Run by the App Store workflow
// (.github/workflows/app-store.yml); the steps are those an owner clicks in App Store Connect:
//
//   1. the App Store version (apps/ios/Info.plist's CFBundleShortVersionString), made if missing,
//      released by hand after approval, like 1.0.0;
//   2. its What's New text, from docs/release/APP_STORE.md (field:whats-new);
//   3. the newest processed TestFlight build of that version (or the one asked for);
//   4. a review submission holding that version, submitted.
//
// The listing, screenshots, App Privacy, age rating and review contact carry over from the last
// version, so nothing else is set. It never releases a version: the owner does that.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (the .p8 file), APP_STORE_APP_ID,
//      ACTION (status | submit), BUILD (optional build number), GITHUB_STEP_SUMMARY (optional).
// Usage: node scripts/app-store-submit.mjs

import { appendFileSync, readFileSync } from "node:fs";
import { ascToken } from "./asc-revoke-ci-certs.mjs";

const API = "https://api.appstoreconnect.apple.com/v1";

/** States in which a version can still be changed and submitted. */
const EDITABLE = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

/** States in which a version is already with Apple or approved, and no new one can be made. */
const IN_FLIGHT = new Set([
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "PENDING_APPLE_RELEASE",
  "PENDING_DEVELOPER_RELEASE",
  "PROCESSING_FOR_APP_STORE",
  "WAITING_FOR_EXPORT_COMPLIANCE",
]);

/** The version string in Info.plist. */
export function plistVersion(plist) {
  const m = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  if (!m) throw new Error("CFBundleShortVersionString not found in Info.plist");
  return m[1].trim();
}

/** The text of a `<!-- field:NAME ... -->` block in APP_STORE.md. */
export function fieldText(markdown, name) {
  const re = new RegExp(
    `<!-- field:${name}(?: limit:(\\d+))? -->\\s*\`\`\`text\\n([\\s\\S]*?)\\n\`\`\``,
  );
  const m = markdown.match(re);
  if (!m) throw new Error(`field:${name} not found`);
  const text = m[2].trim();
  if (m[1] && text.length > Number(m[1])) {
    throw new Error(`field:${name} is ${text.length} characters; the limit is ${m[1]}`);
  }
  return text;
}

/** A version's state, from the newer or the older attribute. */
export const stateOf = (v) => v?.attributes?.appVersionState ?? v?.attributes?.appStoreState;

/**
 * What to do with the versions App Store Connect has, to submit `version`:
 * { use: id } an editable version with that string, { rename: id } another editable one,
 * { create: true }, { done } (already submitted or approved), or { blocked } (something else is
 * in flight).
 */
export function plan(versions, version) {
  const same = versions.find((v) => v.attributes?.versionString === version);
  if (same) {
    const s = stateOf(same);
    if (EDITABLE.has(s)) return { use: same.id };
    return { done: `${version} is already ${s}.` };
  }
  const editable = versions.find((v) => EDITABLE.has(stateOf(v)));
  if (editable) return { rename: editable.id, from: editable.attributes?.versionString };
  const busy = versions.find((v) => IN_FLIGHT.has(stateOf(v)));
  if (busy) {
    const s = stateOf(busy);
    const what =
      s === "PENDING_DEVELOPER_RELEASE"
        ? "is approved and waiting for you to release it (App Store Connect › Distribution › Release This Version)"
        : `is ${s}`;
    return {
      blocked: `${busy.attributes?.versionString} ${what}. Apple allows one version at a time; run this again after.`,
    };
  }
  return { create: true };
}

function makeClient({ keyId, issuerId, p8 }) {
  let token = null;
  let made = 0;
  return async function api(method, path, body) {
    const now = Math.floor(Date.now() / 1000);
    if (!token || now - made > 500) {
      token = ascToken({ keyId, issuerId, p8 }, now);
      made = now;
    }
    const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = (json?.errors ?? []).map((e) => e.detail ?? e.title).join("; ");
      const err = new Error(`${method} ${path}: HTTP ${res.status} ${detail}`);
      err.status = res.status;
      throw err;
    }
    return json;
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const env = process.env;
  const appId = env.APP_STORE_APP_ID;
  const action = env.ACTION || "status";
  if (!env.ASC_KEY_ID || !env.ASC_ISSUER_ID || !env.ASC_KEY_PATH || !appId) {
    throw new Error("ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH and APP_STORE_APP_ID are needed");
  }
  const api = makeClient({
    keyId: env.ASC_KEY_ID,
    issuerId: env.ASC_ISSUER_ID,
    p8: readFileSync(env.ASC_KEY_PATH, "utf8"),
  });
  const root = new URL("..", import.meta.url);
  const version = plistVersion(readFileSync(new URL("apps/ios/Info.plist", root), "utf8"));
  const summary = [];
  const say = (line = "") => {
    console.log(line);
    summary.push(line);
  };

  const versions =
    (
      await api(
        "GET",
        `/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10` +
          "&fields[appStoreVersions]=versionString,appStoreState,appVersionState,releaseType,createdDate",
      )
    ).data ?? [];
  const builds = await api(
    "GET",
    `/builds?filter[app]=${appId}&sort=-uploadedDate&limit=8&include=preReleaseVersion` +
      "&fields[builds]=version,processingState,uploadedDate,preReleaseVersion&fields[preReleaseVersions]=version",
  );
  const trains = new Map((builds.included ?? []).map((p) => [p.id, p.attributes?.version]));
  const trainOf = (b) => trains.get(b.relationships?.preReleaseVersion?.data?.id) ?? "?";

  say(`### App Store Connect (app ${appId})`);
  say();
  say(`Info.plist version: **${version}**`);
  say();
  say("| App Store version | State | Release |");
  say("|---|---|---|");
  for (const v of versions) {
    say(`| ${v.attributes.versionString} | ${stateOf(v)} | ${v.attributes.releaseType ?? ""} |`);
  }
  say();
  say("| Build | Version | Processing | Uploaded |");
  say("|---|---|---|---|");
  for (const b of builds.data ?? []) {
    const a = b.attributes;
    say(`| ${a.version} | ${trainOf(b)} | ${a.processingState} | ${a.uploadedDate} |`);
  }
  say();

  if (action === "submit") await submit({ api, appId, version, versions, say, build: env.BUILD });

  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n");
}

async function submit({ api, appId, version, versions, say, build }) {
  const whatsNew = fieldText(
    readFileSync(new URL("../docs/release/APP_STORE.md", import.meta.url), "utf8"),
    "whats-new",
  );
  if (/first release/i.test(whatsNew)) {
    throw new Error(
      "What's New (docs/release/APP_STORE.md § 1.9) still describes the first release",
    );
  }

  const next = plan(versions, version);
  if (next.done) {
    say(`Nothing to submit: ${next.done}`);
    return;
  }
  if (next.blocked) throw new Error(next.blocked);

  // 1. The version.
  let versionId = next.use ?? next.rename;
  if (next.rename) {
    await api("PATCH", `/appStoreVersions/${versionId}`, {
      data: { type: "appStoreVersions", id: versionId, attributes: { versionString: version } },
    });
    say(`Renamed App Store version ${next.from} to ${version}.`);
  } else if (next.create) {
    const made = await api("POST", "/appStoreVersions", {
      data: {
        type: "appStoreVersions",
        attributes: { platform: "IOS", versionString: version, releaseType: "MANUAL" },
        relationships: { app: { data: { type: "apps", id: appId } } },
      },
    });
    versionId = made.data.id;
    say(`Made App Store version ${version} (released by hand after approval).`);
  }

  // 2. The build: the newest processed one of this version, or the one asked for. A fresh upload
  // takes a few minutes to process, so wait up to 40.
  let chosen = null;
  for (let tries = 0; tries < 40 && !chosen; tries++) {
    const q =
      `/builds?filter[app]=${appId}&filter[preReleaseVersion.version]=${version}` +
      (build ? `&filter[version]=${build}` : "") +
      "&sort=-uploadedDate&limit=1&fields[builds]=version,processingState,expired";
    const [b] = (await api("GET", q)).data ?? [];
    if (!b)
      throw new Error(
        `No TestFlight build of ${version}${build ? ` (${build})` : ""}. Run the TestFlight workflow first.`,
      );
    const s = b.attributes.processingState;
    if (s === "VALID") chosen = b;
    else if (s === "PROCESSING") {
      console.log(`Build ${b.attributes.version} is still processing; waiting a minute.`);
      await sleep(60_000);
    } else throw new Error(`Build ${b.attributes.version} is ${s}; it can't be submitted.`);
  }
  if (!chosen) throw new Error("The build was still processing after 40 minutes; run this again.");

  // 3. What's New, in every language the listing has.
  const locs =
    (await api("GET", `/appStoreVersions/${versionId}/appStoreVersionLocalizations`)).data ?? [];
  if (locs.length === 0) throw new Error(`App Store version ${version} has no listing text`);
  for (const l of locs) {
    await api("PATCH", `/appStoreVersionLocalizations/${l.id}`, {
      data: { type: "appStoreVersionLocalizations", id: l.id, attributes: { whatsNew } },
    });
  }
  say(`What's New set (${locs.map((l) => l.attributes.locale).join(", ")}).`);

  // 4. The build on the version.
  await api("PATCH", `/appStoreVersions/${versionId}/relationships/build`, {
    data: { type: "builds", id: chosen.id },
  });
  say(`Build ${chosen.attributes.version} attached to ${version}.`);

  // 5. The review submission: the open one, or a new one.
  const open =
    (
      await api(
        "GET",
        `/reviewSubmissions?filter[app]=${appId}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&limit=1`,
      )
    ).data ?? [];
  let submissionId = open[0]?.id;
  if (!submissionId) {
    const made = await api("POST", "/reviewSubmissions", {
      data: {
        type: "reviewSubmissions",
        attributes: { platform: "IOS" },
        relationships: { app: { data: { type: "apps", id: appId } } },
      },
    });
    submissionId = made.data.id;
  }
  try {
    await api("POST", "/reviewSubmissionItems", {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submissionId } },
          appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
        },
      },
    });
  } catch (e) {
    // 409 is "already in this submission" or a reason it can't be; submitting below says which.
    if (e.status !== 409) throw e;
    console.log(`::warning::${e.message}`);
  }
  await api("PATCH", `/reviewSubmissions/${submissionId}`, {
    data: { type: "reviewSubmissions", id: submissionId, attributes: { submitted: true } },
  });
  say(
    `**Submitted ${version} (${chosen.attributes.version}) for App Review.** Apple emails when it's reviewed; release it by hand after approval.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.log(`::error::${e.message}`);
    process.exit(1);
  });
}
