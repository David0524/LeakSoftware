import { reportTitle } from "@leakbook/core";
import { siteOrigin } from "@/lib/origin";
import { publicClient, reportPdf } from "@/server/reports";

export const maxDuration = 60;

/** The report as a PDF: the stored copy, or rendered from the same page. */
export async function GET(_request: Request, ctx: RouteContext<"/r/[token]/pdf">) {
  const { token } = await ctx.params;
  const { data } = await publicClient().rpc("report_for_token", {
    link_token: token,
    count_view: false,
  });
  const r = data as {
    report_id: string;
    company_id: string;
    job_id: string;
    snapshot: { company: { name: string }; job?: { type?: string } };
  } | null;
  if (!r) return new Response("Not found", { status: 404 });
  const pdf = await reportPdf(await siteOrigin(), token, {
    companyId: r.company_id,
    jobId: r.job_id,
    reportId: r.report_id,
  });
  const name =
    `${r.snapshot.company.name} ${reportTitle(r.snapshot.job?.type).toLowerCase()}.pdf`.replace(
      /[^\w .-]/g,
      "",
    );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
