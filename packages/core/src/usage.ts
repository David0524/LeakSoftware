// Usage (owner, 2026-10-22: "track screen time, how users use the app"; per person, in our own
// database). The website, the iPhone app and the Android app send which screen is open and for
// how long, and errors people hit; what people do (jobs, photos, quotes...) comes from the
// audit log the database already keeps. These are the rules all of them share.

export type UsagePlatform = "web" | "ios" | "android";
export type UsageKind = "screen" | "error";

/** One event as an app sends it. */
export interface UsageEventInput {
  kind: UsageKind;
  /** The screen's path, ids and all ("/jobs/0192…"): normalized on the server. */
  screen: string;
  /** Time on the screen, foreground and in use only (screen events). */
  ms?: number;
  /** An error's message (error events). */
  detail?: string;
  /** When it happened (ISO). */
  at: string;
  /** The app session it belongs to (a UUID made on the device). */
  session: string;
}

/** A screen view longer than this counts as this long (someone left it open). */
export const MAX_SCREEN_MS = 30 * 60 * 1000;
/** Most events one request may carry. */
export const MAX_USAGE_BATCH = 200;
/** After this long in the background (or idle on the website), the next use is a new session. */
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** On the website, no input for this long stops the screen clock (the tab is open, nobody's there). */
export const IDLE_MS = 5 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A screen's path with ids and tokens taken out, so every job page counts as "/jobs/:id":
 * lower case, no query, UUIDs, numbers and long tokens as ":id", at most 6 parts.
 */
export function normalizeScreen(raw: string): string {
  const path = (raw.split(/[?#]/)[0] ?? "").trim().toLowerCase();
  const parts = path
    .split("/")
    .filter(Boolean)
    .slice(0, 6)
    .map((p) =>
      UUID.test(p) || /^\d+$/.test(p) || (p.length >= 20 && /\d/.test(p))
        ? ":id"
        : p.replace(/[^a-z0-9:_-]/g, "").slice(0, 32),
    )
    .filter(Boolean);
  return `/${parts.join("/")}`;
}

// The names people see in the portal. Paths are the website's; the apps use the same ones.
const SCREEN_LABELS: [RegExp, string][] = [
  [/^\/$/, "Home"],
  [/^\/home$/, "Home"],
  [/^\/today$/, "Today"],
  [/^\/dashboard$/, "Dashboard"],
  [/^\/jobs$/, "Jobs"],
  [/^\/jobs\/new$/, "New Job"],
  [
    /^\/jobs\/:id\/(checklist|details|findings|photos|wrap-up|wrapup|invoice|report|quote)$/,
    "Job › $1",
  ],
  [/^\/jobs\/:id\/checklist\/item$/, "Checklist Item"],
  [/^\/jobs\/:id\/signature$/, "Signature"],
  [/^\/jobs\/:id\/review$/, "Customer Review"],
  [/^\/jobs\/:id/, "Job"],
  [/^\/schedule/, "Schedule"],
  [/^\/messages\/(conversation|:id)/, "Conversation"],
  [/^\/messages/, "Messages"],
  [/^\/customers\/:id/, "Customer"],
  [/^\/customers/, "Customers"],
  [/^\/invoices/, "Invoices"],
  [/^\/chemicals/, "Chemicals"],
  [/^\/activity/, "Activity"],
  [/^\/settings\/([a-z-]+)/, "Settings › $1"],
  [/^\/settings$/, "Settings"],
  [/^\/more\/([a-z-]+)/, "More › $1"],
  [/^\/more$/, "More"],
  [/^\/sync$/, "Sync"],
];

const title = (s: string) =>
  s
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");

/** "Job › Checklist", "Settings › Price Book", or the path in words when unknown. */
export function screenLabel(path: string): string {
  for (const [re, label] of SCREEN_LABELS) {
    const m = path.match(re);
    if (m) return label.replace(/\$1/g, m[1] ? title(m[1]) : "");
  }
  return (
    path
      .split("/")
      .filter((p) => p && p !== ":id")
      .map(title)
      .join(" › ") || "Home"
  );
}

/** What people did, from the audit log (feature keys from public.admin_usage_*). */
export const FEATURE_LABELS: Record<string, string> = {
  job_created: "Made a job",
  job_started: "Started a job",
  job_completed: "Completed a job",
  job_scheduled: "Scheduled or assigned a job",
  customer_added: "Added a customer",
  pool_added: "Added a pool",
  photo_added: "Took a photo",
  video_added: "Took a video",
  voice_note_added: "Recorded a voice note",
  checklist_item: "Checked a checklist item",
  test_recorded: "Recorded a test",
  finding_added: "Added a finding",
  chemicals_logged: "Logged chemicals",
  signature: "Got a signature",
  quote_made: "Made a quote",
  invoice_made: "Made an invoice",
  report_sent: "Sent a report",
  plan_started: "Started a maintenance plan",
  text_sent: "Sent a text",
  price_book_edited: "Edited the price book",
};

export function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? title(key);
}

/** "2 h 05 m", "14 m", "40 s". */
export function formatScreenTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} m`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`;
}

/** The events of a request the server keeps: known kinds, sane times, ids taken out. */
export function cleanUsageEvents(
  events: unknown,
  now: Date,
): {
  kind: UsageKind;
  screen: string;
  ms: number;
  detail: string | null;
  at: string;
  session: string;
}[] {
  if (!Array.isArray(events)) return [];
  const earliest = now.getTime() - 7 * 86_400_000;
  const latest = now.getTime() + 5 * 60_000;
  const out = [];
  for (const e of events.slice(0, MAX_USAGE_BATCH) as Partial<UsageEventInput>[]) {
    if (!e || (e.kind !== "screen" && e.kind !== "error")) continue;
    if (typeof e.screen !== "string" || typeof e.session !== "string" || !UUID.test(e.session))
      continue;
    const at = Date.parse(String(e.at));
    if (Number.isNaN(at) || at < earliest || at > latest) continue;
    const ms =
      e.kind === "screen" ? Math.min(MAX_SCREEN_MS, Math.max(0, Math.round(Number(e.ms) || 0))) : 0;
    if (e.kind === "screen" && ms < 500) continue;
    out.push({
      kind: e.kind,
      screen: normalizeScreen(e.screen),
      ms,
      detail:
        e.kind === "error" && typeof e.detail === "string"
          ? e.detail.replace(/\s+/g, " ").trim().slice(0, 200) || null
          : null,
      at: new Date(at).toISOString(),
      session: e.session.toLowerCase(),
    });
  }
  return out;
}
