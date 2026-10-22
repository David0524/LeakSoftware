import { managerCall, resultResponse } from "@/server/mass-email-api";
import { sendMassEmailTest } from "@/server/mass-email";
import { siteOrigin } from "@/lib/origin";

/** POST {company_id, subject, body}: Send Test to Me, to the signed-in person's own address. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const call = await managerCall(request, body?.company_id);
  if (call instanceof Response) return call;
  const { data: profile } = await call.session.db
    .from("profile")
    .select("full_name")
    .eq("id", call.session.userId)
    .maybeSingle();
  return resultResponse(
    await sendMassEmailTest(
      call.session.db,
      call.companyId,
      { email: call.session.email, name: (profile?.full_name as string | null) ?? null },
      { subject: String(body?.subject ?? ""), body: String(body?.body ?? "") },
      await siteOrigin(),
    ),
  );
}
