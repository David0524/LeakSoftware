import { NOTIFICATION_KINDS, WEEKLY_SUMMARY_PREF } from "@leakbook/core";
import { bearerSession, jsonError } from "@/server/bearer";

/** The choices a person can change: each push kind, and the weekly summary email. */
const KEYS: string[] = [...NOTIFICATION_KINDS.map((k) => k.key), WEEKLY_SUMMARY_PREF.key];

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

/**
 * PUT { prefs }: turn kinds on or off (More › Notifications). Unknown kinds are dropped; kinds
 * not sent keep what they were, so an app that doesn't know a newer switch (the weekly summary)
 * never resets it.
 */
export async function PUT(request: Request) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const body = (await request.json().catch(() => null)) as {
    prefs?: Record<string, unknown>;
  } | null;
  const changes = Object.fromEntries(
    KEYS.filter((k) => typeof body?.prefs?.[k] === "boolean").map((k) => [k, body!.prefs![k]]),
  );
  const { data: current } = await session.db
    .from("profile")
    .select("notification_prefs")
    .eq("id", session.userId)
    .maybeSingle();
  const before = (current?.notification_prefs ?? {}) as Record<string, unknown>;
  const prefs = {
    ...Object.fromEntries(Object.entries(before).filter(([k]) => KEYS.includes(k))),
    ...changes,
  };
  const { error } = await session.db
    .from("profile")
    .update({ notification_prefs: prefs })
    .eq("id", session.userId);
  if (error) return jsonError(error.message, 500);
  return Response.json({ prefs });
}
