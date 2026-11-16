import { adminClient } from "@/server/admin";
import { bearerSession, jsonError } from "@/server/bearer";
import { notifySkips } from "@/server/skip-visits";

/**
 * POST: a phone skipped this visit (owner, 2026-11-16). Once the skip has reached the server,
 * the owners and admins are pushed, once (the database hands each skip out one time). 202 when
 * the skip hasn't arrived yet: the phone asks again, and the daily run catches up anyway.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/skipped">) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  // Read as the signed-in member: an id from another shop finds nothing.
  const { data: job } = await session.db.from("job").select("status").eq("id", id).maybeSingle();
  if (!job) return jsonError("This visit is gone.", 404);
  if (job.status !== "skipped") return Response.json({ pending: true }, { status: 202 });
  const admin = adminClient();
  if (!admin) return Response.json({ notified: 0 });
  const { notified } = await notifySkips(admin, id);
  return Response.json({ notified });
}
