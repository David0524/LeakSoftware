import { siteOrigin } from "@/lib/origin";
import { renderPdf } from "@/server/pdf";
import { publicClient } from "@/server/reports";

export const maxDuration = 60;

/** The invoice (or receipt, once paid) as a PDF, printed from the same page. */
export async function GET(_request: Request, ctx: RouteContext<"/i/[token]/pdf">) {
  const { token } = await ctx.params;
  const { data } = await publicClient().rpc("invoice_for_token", {
    link_token: token,
    count_view: false,
  });
  const i = data as { number: number | null; status: string; company: { name: string } } | null;
  if (!i) return new Response("Not found", { status: 404 });
  const pdf = await renderPdf(`${await siteOrigin()}/i/${token}?print=1`);
  const kind = i.status === "paid" ? "receipt" : "invoice";
  const name = `${i.company.name} ${kind}${i.number ? ` ${i.number}` : ""}.pdf`.replace(
    /[^\w .-]/g,
    "",
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
