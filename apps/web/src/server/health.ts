import "server-only";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";
import { emailConfigured } from "./email";

export interface Health {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  checkedAt: string;
}

async function reachable(url: string, body?: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        apikey: supabaseAnonKey,
        authorization: `Bearer ${supabaseAnonKey}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** What the status page and uptime monitors check (M11). No customer data. */
export async function checkHealth(): Promise<Health> {
  const [db, auth] = await Promise.all([
    // A real query that reads nothing: a customer link that doesn't exist.
    reachable(`${supabaseUrl}/rest/v1/rpc/report_for_token`, {
      link_token: "status-check",
      count_view: false,
    }),
    reachable(`${supabaseUrl}/auth/v1/health`),
  ]);
  const checks = [
    { name: "Website", ok: true, detail: "Working" },
    { name: "Database and sync", ok: db, detail: db ? "Working" : "Not reachable" },
    { name: "Sign-in", ok: auth, detail: auth ? "Working" : "Not reachable" },
    {
      name: "Email",
      ok: emailConfigured(),
      detail: emailConfigured() ? "Set up" : "Not set up (reports go out by text)",
    },
  ];
  return {
    ok: db && auth,
    checks,
    checkedAt: new Date().toISOString(),
  };
}
