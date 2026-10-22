import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/auth";
import { logStaffAction, requireStaff } from "@/server/staff";

/**
 * End Session (Admin portal), from the office banner or the Support page. A plain form post,
 * not a server action, so it works in View Only, where the proxy refuses the office's changes.
 */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireStaff();
  } catch {
    return new Response("Not allowed", { status: 403 });
  }
  const { staff, db } = ctx;
  const form = await request.formData();
  const companyId = String(form.get("company_id") ?? "").slice(0, 40);
  const { data } = await db.rpc("admin_end_support", { staff_user: staff.id });
  if (Number(data) > 0) {
    const { data: shop } = companyId
      ? await db.from("company").select("name").eq("id", companyId).maybeSingle()
      : { data: null };
    await logStaffAction(staff, "support_end", {
      companyId: shop ? companyId : null,
      companyName: (shop?.name as string | undefined) ?? null,
    });
  }
  const jar = await cookies();
  if (companyId && jar.get(ACTIVE_COMPANY_COOKIE)?.value === companyId)
    jar.delete(ACTIVE_COMPANY_COOKIE);
  const back = new URL(companyId ? `/admin/shops/${companyId}` : "/admin/support", request.url);
  return NextResponse.redirect(back, 303);
}
