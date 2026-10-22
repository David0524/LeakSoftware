import { bearerSession, jsonError } from "@/server/bearer";
import { failureStatus } from "@/server/failures";
import { siteOrigin } from "@/lib/origin";
import { deleteSample, sendSampleToSelf } from "@/server/sample";

// The sample job from the phones (owner, 2026-10-22; docs/design/2026-10-22-first-win.md).

/**
 * POST: Send Yourself This Report, to the signed-in person's own email. Returns {emailed, to,
 * link, message}; with emailed false the phone opens the link instead.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/sample">) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  try {
    return Response.json(
      await sendSampleToSelf(
        session.db,
        id,
        { id: session.userId, email: session.email },
        await siteOrigin(),
      ),
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), failureStatus(e));
  }
}

/** DELETE: Delete Sample. It never comes back. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/jobs/[id]/sample">) {
  const session = await bearerSession(request);
  if (!session) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  try {
    await deleteSample(session.db, id);
    return Response.json({ deleted: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : String(e), failureStatus(e));
  }
}
