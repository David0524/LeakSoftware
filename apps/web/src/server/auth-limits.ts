import "server-only";
import { headers } from "next/headers";
import type { AuthAttemptKind } from "@leakbook/core";
import { adminClient } from "./admin";

// Limits on repeated sign-in attempts and auth emails (security review M3, 2026-10-25). The
// website calls Supabase from Vercel's addresses, so Supabase's per-IP limits see one visitor;
// these count by email and by the visitor's own address instead
// (supabase/migrations/20261022002300_auth_attempts.sql). Without the server key (local tools)
// or if the database can't answer, attempts go ahead: a limiter outage never locks everyone
// out, and Supabase's own limits still apply.

/**
 * The visitor's address. On Vercel, x-forwarded-for is set by Vercel itself, so it can't be
 * forged; a loopback address (a local or test server) counts as unknown, so tests on one
 * machine aren't one visitor.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const raw =
    h.get("x-vercel-forwarded-for") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0] ??
    "";
  const ip = raw.trim();
  if (!ip || ip === "::1" || ip.startsWith("127.") || ip === "::ffff:127.0.0.1") return null;
  return ip.slice(0, 64);
}

/**
 * Whether another attempt of `kind` may go ahead for this email and visitor. `take` counts it
 * now (an email about to be sent); sign-ins and codes count only failures (`attemptFailed`).
 */
export async function attemptAllowed(
  kind: AuthAttemptKind,
  email: string | null,
  take = false,
): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return true;
  const { data, error } = await admin.rpc("auth_attempt_allowed", {
    attempt_kind: kind,
    target_email: email,
    client_ip: await clientIp(),
    take,
  });
  if (error) {
    console.error("[auth-limits] couldn't check the limit:", error.message);
    return true;
  }
  return data !== false;
}

/** Counts a wrong password or two-step code. */
export async function attemptFailed(
  kind: "sign_in" | "two_step",
  email: string | null,
): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const { error } = await admin.rpc("auth_attempt_failed", {
    attempt_kind: kind,
    target_email: email,
    client_ip: await clientIp(),
  });
  if (error) console.error("[auth-limits] couldn't count a failed attempt:", error.message);
}
