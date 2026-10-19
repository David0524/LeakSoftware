import { adminClient } from "@/server/admin";
import { bearerSession, jsonError } from "@/server/bearer";

/** The services a phone registers with: Apple's for the iPhone app, Expo's for Android. */
const SERVICES = ["apns", "expo"] as const;

function parse(body: Record<string, unknown> | null) {
  const service = SERVICES.find((s) => s === body?.service);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!service || token.length < 10 || token.length > 400) return null;
  return { service, token, app: typeof body?.app === "string" ? body.app.slice(0, 40) : null };
}

/**
 * POST { service, token, app }: this phone's push token, for the signed-in person (owner,
 * 2026-10-19: notifications). A token already filed for someone else on this phone moves to
 * whoever signed in now.
 */
export async function POST(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const device = parse((await request.json().catch(() => null)) as Record<string, unknown> | null);
  if (!device) return jsonError("Send the push service and token.", 400);
  const admin = adminClient();
  if (!admin) return jsonError("Notifications aren't set up yet.", 503);
  const { error } = await admin
    .from("push_device")
    .upsert(
      { ...device, user_id: session.userId, last_seen_at: new Date().toISOString() },
      { onConflict: "service,token" },
    );
  if (error) return jsonError(error.message, 500);
  return Response.json({ ok: true });
}

/** DELETE { service, token }: signing out stops this phone's notifications. */
export async function DELETE(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const device = parse((await request.json().catch(() => null)) as Record<string, unknown> | null);
  if (!device) return jsonError("Send the push service and token.", 400);
  const admin = adminClient();
  if (!admin) return jsonError("Notifications aren't set up yet.", 503);
  await admin
    .from("push_device")
    .delete()
    .eq("service", device.service)
    .eq("token", device.token)
    .eq("user_id", session.userId);
  return Response.json({ ok: true });
}
