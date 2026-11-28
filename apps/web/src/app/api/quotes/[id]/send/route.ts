import { quoteShareText } from "@leakbook/core";
import { clientFromRequest, jsonError } from "@/server/bearer";
import { friendlyDbError } from "@/lib/limits";
import { siteOrigin } from "@/lib/origin";
import { jobBusinessNameById } from "@/server/business";

/** POST: send this quote (locks its totals). Returns the customer link and a text message. */
export async function POST(request: Request, ctx: RouteContext<"/api/quotes/[id]/send">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const { data, error } = await db.rpc("send_quote", { target_quote: id });
  if (error) return jsonError(friendlyDbError(error.message, "Quote not found"), 400);
  const { data: q } = await db
    .from("quote")
    .select("job_id, company:company_id(name)")
    .eq("id", id)
    .single();
  const row = q as { job_id: string; company: { name: string } | null } | null;
  // The quote's job's business (2026-11-26): its second business's name when it uses it.
  const shop =
    (row?.job_id ? await jobBusinessNameById(db, row.job_id) : null) ??
    row?.company?.name ??
    "Your pool shop";
  const link = `${await siteOrigin()}/q/${(data as { token: string }).token}`;
  return Response.json({ link, message: quoteShareText(shop, link) });
}
