import { massEmailAudience } from "@leakbook/core";
import { jsonError } from "@/server/bearer";
import { managerCall } from "@/server/mass-email-api";
import { massEmailCount } from "@/server/mass-email";

/** POST {company_id, audience: {show, city, days}}: who it would go to, and who is left out. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const call = await managerCall(request, body?.company_id);
  if (call instanceof Response) return call;
  const count = await massEmailCount(
    call.session.db,
    call.companyId,
    massEmailAudience(body?.audience),
  );
  if (!count) return jsonError("Couldn’t count. Try again.", 500);
  return Response.json(count);
}
