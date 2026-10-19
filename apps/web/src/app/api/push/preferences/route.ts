import { NOTIFICATION_KINDS } from "@leakbook/core";
import { bearerSession, jsonError } from "@/server/bearer";

/** GET: which kinds of notification the signed-in person gets ({ text: false, ... }). */
export async function GET(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const { data } = await session.db
    .from("profile")
    .select("notification_prefs")
    .eq("id", session.userId)
    .maybeSingle();
  return Response.json({ prefs: data?.notification_prefs ?? {} });
}

/** PUT { prefs }: turn kinds on or off (More › Notifications). Unknown kinds are dropped. */
export async function PUT(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const body = (await request.json().catch(() => null)) as {
    prefs?: Record<string, unknown>;
  } | null;
  const prefs = Object.fromEntries(
    NOTIFICATION_KINDS.filter((k) => typeof body?.prefs?.[k.key] === "boolean").map((k) => [
      k.key,
      body!.prefs![k.key],
    ]),
  );
  const { error } = await session.db
    .from("profile")
    .update({ notification_prefs: prefs })
    .eq("id", session.userId);
  if (error) return jsonError(error.message, 500);
  return Response.json({ prefs });
}
