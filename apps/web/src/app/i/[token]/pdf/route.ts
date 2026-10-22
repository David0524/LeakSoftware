import { createHash } from "node:crypto";
import { siteOrigin } from "@/lib/origin";
import { adminClient } from "@/server/admin";
import { renderPdf } from "@/server/pdf";
import { publicClient } from "@/server/reports";

export const maxDuration = 60;

const LAYOUT = "2026-10-22b";

/**
 * The invoice (or receipt, once paid) as a PDF, printed from the same page. Each version of
 * the invoice is printed once and kept, so opening the link again doesn't start another
 * browser (security audit, 2026-10-17).
 */
export async function GET(_request: Request, ctx: RouteContext<"/i/[token]/pdf">) {
  const { token } = await ctx.params;
  const { data } = await publicClient().rpc("invoice_for_token", {
    link_token: token,
    count_view: false,
  });
  const i = data as {
    invoice_id: string;
    company_id: string;
    job_id: string;
    number: number | null;
    status: string;
    company: { name: string };
  } | null;
  if (!i) return new Response("Not found", { status: 404 });

  // Everything the page shows is in `data`, so its hash names this version of the invoice.
  // LAYOUT changes when the printed page itself changes, so copies kept from before print again
  // (2026-10-22: the shop's logo, which signed-out pages couldn't load until then; 2026-10-22b:
  // each payment's method and check number, and a part payment's thank-you).
  const version = createHash("sha256")
    .update(LAYOUT + JSON.stringify(data))
    .digest("hex")
    .slice(0, 16);
  const path = `${i.company_id}/${i.job_id}/invoice-${i.invoice_id}-${version}.pdf`;
  const server = adminClient();
  let pdf: Buffer | null = null;
  if (server) {
    const stored = await server.storage.from("documents").download(path);
    if (stored.data) pdf = Buffer.from(await stored.data.arrayBuffer());
  }
  if (!pdf) {
    pdf = await renderPdf(`${await siteOrigin()}/i/${token}?print=1`);
    if (server)
      await server.storage
        .from("documents")
        .upload(path, pdf, { contentType: "application/pdf", upsert: false });
  }

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
