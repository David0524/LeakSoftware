import { createClient } from "@supabase/supabase-js";
import { cleanUsageEvents, type UsagePlatform } from "@leakbook/core";
import { getUser } from "@/lib/auth";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";
import { adminClient } from "@/server/admin";

// Usage (owner, 2026-10-22: "track screen time, how users use the app"): the website (its
// session cookie) and the iPhone and Android apps (Bearer token) send batches of screen views
// and errors here. Only people in the shop they name are counted, so staff helping a shop
// through the Admin portal never show up as its usage. Always 204: usage never bothers anyone.

const PLATFORMS: UsagePlatform[] = ["web", "ios", "android"];

/** The signed-in person: the app's token (checked locally, like the website's cookie), or the cookie. */
async function userId(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token) {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getClaims(token);
    return !error && typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  }
  return (await getUser())?.id ?? null;
}

export async function POST(request: Request) {
  const none = new Response(null, { status: 204 });
  const body = (await request.json().catch(() => null)) as {
    platform?: unknown;
    version?: unknown;
    company_id?: unknown;
    events?: unknown;
  } | null;
  const admin = adminClient();
  if (!body || !admin) return none;
  const platform = PLATFORMS.find((p) => p === body.platform);
  const events = cleanUsageEvents(body.events, new Date());
  if (!platform || events.length === 0) return none;
  const id = await userId(request);
  if (!id) return new Response(null, { status: 401 });

  // The shop: one of theirs (the one named, else their first). None: not counted.
  const { data: memberships } = await admin
    .from("membership")
    .select("company_id")
    .eq("user_id", id)
    .eq("status", "active")
    .is("deleted_at", null);
  const shops = (memberships ?? []).map((m) => m.company_id as string);
  const named = typeof body.company_id === "string" ? body.company_id : null;
  const company = named ? (shops.includes(named) ? named : null) : (shops[0] ?? null);
  if (!company) return none;

  await admin.rpc("record_usage", {
    target_user: id,
    target_company: company,
    from_platform: platform,
    version: typeof body.version === "string" ? body.version.slice(0, 40) : null,
    events,
  });
  return none;
}
