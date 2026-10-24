import { linkPreview } from "@leakbook/core";
import { cardImagePath, loadLinkPreview } from "@/server/link-preview";

/**
 * A customer link's preview as JSON, for the apps' share sheets (owner, 2026-10-24): Android puts
 * the title in the share sheet (EXTRA_TITLE), so the wording matches what Messages shows. The same
 * title, line and card image as the page's og tags; nothing the link doesn't already show.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/link-preview/[token]">) {
  const { token } = await ctx.params;
  const row = await loadLinkPreview(token);
  if (!row)
    return Response.json(
      { error: "Not found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  const p = linkPreview(row);
  const path = { quote: "q", invoice: "i", report: "r" }[row.kind];
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      kind: p.kind,
      url: `${origin}/${path}/${token}`,
      title: p.title,
      description: p.description,
      image: `${origin}${cardImagePath(row.kind, token, p)}`,
    },
    { headers: { "cache-control": "private, max-age=60", "x-robots-tag": "noindex" } },
  );
}
