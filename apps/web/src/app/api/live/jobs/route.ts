import { cookies } from "next/headers";
import { ACTIVE_COMPANY_COOKIE, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * GET ?from=ISO&to=ISO: a fingerprint of the jobs booked in that window that the signed-in
 * person can read (through RLS), for live Today and Schedule pages (owner, 2026-10-22: "The owner
 * sees techs' progress live"; docs/design/2026-10-22-owner-live-today.md). The page asks every
 * few seconds and fetches itself again only when the fingerprint changes, so a tech's Start or
 * Mark Complete on their phone shows within seconds without a reload.
 *
 * The fingerprint is how many jobs there are and when the latest one changed (every change to a
 * job bumps its updated_at, a deleted one included): a job started, done, moved, added or taken
 * away changes it. It is one small indexed query, so asking often is cheap.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)))
    return Response.json({ error: "Send from and to." }, { status: 400 });
  const supabase = await createClient();
  let query = supabase
    .from("job")
    .select("updated_at", { count: "exact" })
    .gte("scheduled_start", from)
    .lt("scheduled_start", to);
  const company = (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value;
  if (company && /^[0-9a-f-]{36}$/i.test(company)) query = query.eq("company_id", company);
  const { data, count, error } = await query.order("updated_at", { ascending: false }).limit(1);
  if (error) return Response.json({ error: "Try again." }, { status: 503 });
  return Response.json(
    { token: `${count ?? 0}:${data?.[0]?.updated_at ?? ""}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}
