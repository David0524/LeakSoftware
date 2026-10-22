import { massEmailAudience } from "@leakbook/core";
import { managerCall, resultResponse } from "@/server/mass-email-api";
import { sendMassEmail } from "@/server/mass-email";
import { siteOrigin } from "@/lib/origin";

// Up to a day's allowance in batches of 100: a few seconds, well inside this.
export const maxDuration = 300;

/**
 * POST {company_id, subject, body, audience, expected}: sends the mass email. `expected` is the
 * count the person confirmed; a list that changed since sends nothing (409).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const call = await managerCall(request, body?.company_id);
  if (call instanceof Response) return call;
  return resultResponse(
    await sendMassEmail(
      call.session.db,
      call.companyId,
      {
        subject: String(body?.subject ?? ""),
        body: String(body?.body ?? ""),
        audience: massEmailAudience(body?.audience),
        expected: Number(body?.expected ?? -1),
      },
      await siteOrigin(),
    ),
  );
}
