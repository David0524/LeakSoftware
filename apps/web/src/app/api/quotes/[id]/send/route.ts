import { quoteShareText } from "@leakbook/core";
import { clientFromRequest, jsonError } from "@/server/bearer";
import { friendlyDbError } from "@/lib/limits";
import { siteOrigin } from "@/lib/origin";

/** POST: send this quote (locks its totals). Returns the customer link and a text message. */
export async function POST(request: Request, ctx: RouteContext<"/api/quotes/[id]/send">) {
  const db = await clientFromRequest(request);
  if (!db) return jsonError("Sign in again.", 401);
  const { id } = await ctx.params;
  const { data, error } = await db.rpc("send_quote", { target_quote: id });
  if (error) return jsonError(friendlyDbError(error.message, "Quote not found"), 400);
  const { data: q } = await db
    .from("quote")
    .select("company:company_id(name)")
    .eq("id", id)
    .single();
  const shop =
    (q as { company: { name: string } | null } | null)?.company?.name ?? "Your pool shop";
  const link = `${await siteOrigin()}/q/${(data as { token: string }).token}`;
  return Response.json({ link, message: quoteShareText(shop, link) });
}
