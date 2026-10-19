import "server-only";
import { connect } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationOn, type NotificationKind, type NotificationText } from "@leakbook/core";

// Push notifications (owner, 2026-10-19; docs/plans/live-activities-and-notifications.md):
// the iPhone app through Apple's push service (APNs), the Android app through Expo's.
// Tokens live in push_device (server only); who wants what in profile.notification_prefs.

/** The iPhone app's bundle ID: APNs' topic. */
const BUNDLE_ID = "com.sundeckpro.app";

/** Apple push is set up: the .p8 key, its ID, and the team (Vercel environment variables). */
export function apnsConfigured(): boolean {
  return !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

let jwt: { token: string; at: number } | null = null;

/** APNs' provider token: ES256 over the team and time, good for an hour; made every 50 min. */
export function apnsToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (jwt && now - jwt.at < 50 * 60) return jwt.token;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: process.env.APNS_KEY_ID });
  const body = b64({ iss: process.env.APNS_TEAM_ID, iat: now });
  // Vercel keeps the .p8 with real line breaks or as "\n": both work.
  const key = createPrivateKey(process.env.APNS_KEY!.replace(/\\n/g, "\n"));
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  jwt = { token: `${head}.${body}.${signature}`, at: now };
  return jwt.token;
}

type Delivery = "sent" | "gone" | "failed";

function apnsSend(
  host: string,
  token: string,
  payload: object,
): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const client = connect(`https://${host}`);
    client.on("error", () => resolve({ status: 0 }));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsToken()}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      "content-type": "application/json",
    });
    let status = 0;
    let data = "";
    req.on("response", (h) => (status = Number(h[":status"] ?? 0)));
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      client.close();
      let reason: string | undefined;
      try {
        reason = (JSON.parse(data || "{}") as { reason?: string }).reason;
      } catch {
        reason = undefined;
      }
      resolve({ status, reason });
    });
    req.on("error", () => {
      client.close();
      resolve({ status: 0 });
    });
    req.end(JSON.stringify(payload));
  });
}

/**
 * One notification to one iPhone. Test builds (installed with Sideloadly) are signed for
 * Apple's development push service, App Store builds for production: production first, then
 * development when Apple says the token isn't one of its production tokens.
 */
async function toApns(token: string, text: NotificationText, data: object): Promise<Delivery> {
  if (!apnsConfigured()) return "failed";
  const payload = {
    aps: { alert: { title: text.title, body: text.body }, sound: "default" },
    ...data,
  };
  let r = await apnsSend("api.push.apple.com", token, payload);
  if (r.status === 400 && r.reason === "BadDeviceToken")
    r = await apnsSend("api.sandbox.push.apple.com", token, payload);
  if (r.status === 200) return "sent";
  if (r.status === 410 || r.reason === "Unregistered" || r.reason === "BadDeviceToken")
    return "gone";
  return "failed";
}

/** Several notifications to Android phones through Expo's push service (one request). */
async function toExpo(
  messages: { token: string; text: NotificationText; data: object }[],
): Promise<Delivery[]> {
  if (messages.length === 0) return [];
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(
        messages.map((m) => ({
          to: m.token,
          title: m.text.title,
          body: m.text.body,
          data: m.data,
          sound: "default",
          channelId: "default",
        })),
      ),
    });
    if (!res.ok) return messages.map(() => "failed");
    const out = (await res.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    return messages.map((_, i) => {
      const t = out.data?.[i];
      if (t?.status === "ok") return "sent";
      return t?.details?.error === "DeviceNotRegistered" ? "gone" : "failed";
    });
  } catch {
    return messages.map(() => "failed");
  }
}

/**
 * Send one kind of notification to these people's phones, skipping anyone who turned that
 * kind off. `data` rides along for the app to open the right screen ({ job } or
 * { conversation }). Tokens a push service says are gone are removed. Never throws: a
 * notification that doesn't go out never fails what caused it.
 */
export async function notify(
  db: SupabaseClient,
  input: { userIds: string[]; kind: NotificationKind; text: NotificationText; data?: object },
): Promise<{ sent: number }> {
  const ids = [...new Set(input.userIds.filter(Boolean))];
  if (ids.length === 0) return { sent: 0 };
  try {
    const [{ data: profiles }, { data: devices }] = await Promise.all([
      db.from("profile").select("id, notification_prefs").in("id", ids),
      db.from("push_device").select("id, user_id, service, token").in("user_id", ids),
    ]);
    const wants = new Set(
      (profiles ?? [])
        .filter((p) => notificationOn(p.notification_prefs, input.kind))
        .map((p) => p.id as string),
    );
    const to = (devices ?? []).filter((d) => wants.has(d.user_id as string)) as {
      id: string;
      service: "apns" | "expo";
      token: string;
    }[];
    const data = { kind: input.kind, ...input.data };
    const apple = to.filter((d) => d.service === "apns");
    const expo = to.filter((d) => d.service === "expo");
    const results = [
      ...(await Promise.all(apple.map((d) => toApns(d.token, input.text, data)))),
      ...(await toExpo(expo.map((d) => ({ token: d.token, text: input.text, data })))),
    ];
    const gone = [...apple, ...expo].filter((_, i) => results[i] === "gone").map((d) => d.id);
    if (gone.length) await db.from("push_device").delete().in("id", gone);
    return { sent: results.filter((r) => r === "sent").length };
  } catch {
    return { sent: 0 };
  }
}

/** A shop's owners and admins (they get shop-wide notifications such as payments). */
export async function shopManagers(db: SupabaseClient, companyId: string): Promise<string[]> {
  const { data } = await db
    .from("membership")
    .select("user_id")
    .eq("company_id", companyId)
    .in("role", ["owner", "admin"])
    .eq("status", "active")
    .is("deleted_at", null);
  return (data ?? []).map((m) => m.user_id as string);
}

/** A job's techs (the tech and the second tech). */
export async function jobTechs(db: SupabaseClient, jobId: string): Promise<string[]> {
  const { data } = await db
    .from("job")
    .select("assigned_user_id, second_tech_id")
    .eq("id", jobId)
    .maybeSingle();
  return [data?.assigned_user_id, data?.second_tech_id].filter((x): x is string => !!x);
}
