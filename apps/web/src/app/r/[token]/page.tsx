import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Suspense, cache } from "react";
import {
  reportTitle,
  type FinalSection,
  type ReportSnapshot,
  type ReportTemplateKey,
} from "@leakbook/core";
import { Banner, DOC_PAGE } from "@/components/doc-ui";
import { ReportLoading } from "@/components/report-loading";
import { ReportView } from "@/components/report-view";
import { VisitReportView, type VisitSnapshot } from "@/components/visit-report-view";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";
import { notifyReportOpened } from "@/server/notify-events";
import { publicClient } from "@/server/reports";

/**
 * The report for a link, once per request: the page and the browser tab's title share this one
 * lookup (React `cache`), so naming the tab after the report costs no extra database call.
 */
const loadReport = cache(async (token: string, countView: boolean) => {
  const { data } = await publicClient().rpc("report_for_token", {
    link_token: token,
    count_view: countView,
  });
  return data as TokenReport | null;
});

/** The browser tab says what the report is (owner, 2026-10-22: "Pool maintenance companies do
 * repairs too"): Repair Report, Pool Inspection Report, Pool Visit Report, Leak Detection Report. */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/r/[token]">): Promise<Metadata> {
  const { token } = await params;
  const { print } = await searchParams;
  const r = await loadReport(token, !print);
  const title = !r
    ? "Report"
    : r.template_key === "maintenance"
      ? "Pool Visit Report"
      : r.template_key === "partner"
        ? "Leak Detection Report (Technical)"
        : reportTitle(r.snapshot.job.type);
  return { title, robots: { index: false } };
}

interface TokenReport {
  report_id: string;
  company_id: string;
  job_id: string;
  template_key: ReportTemplateKey | "maintenance";
  version: number;
  status: "sent" | "superseded";
  sent_at: string | null;
  final_sections: FinalSection[];
  snapshot: ReportSnapshot;
  newer_token: string | null;
}

/** The customer's report: no sign-in, only the unguessable link. */
export default function CustomerReportPage({ params, searchParams }: PageProps<"/r/[token]">) {
  return (
    <main className={DOC_PAGE}>
      <Suspense fallback={<ReportLoading />}>
        <Report params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Report({ params, searchParams }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const { print } = await searchParams;
  const db = publicClient();
  const r = await loadReport(token, !print);
  if (!r) notFound();
  // The team hears the first time the customer opens it (owner, 2026-10-22), not when someone
  // from the shop looks at the link themselves. Sent after the page, so it never slows it.
  const admin = adminClient();
  if (!print && admin && !(await fromTheShop(r.company_id)))
    after(() => notifyReportOpened(admin, token));

  const s = r.snapshot;
  const paths = [
    ...s.media.filter((m) => m.kind === "photo").map((m) => m.storage_path),
    ...s.signatures.map((x) => x.image_path).filter((x): x is string => !!x),
  ];
  const [media, logo] = await Promise.all([
    paths.length
      ? db.storage.from("media").createSignedUrls(paths, 3600)
      : Promise.resolve({ data: [] }),
    s.company.logo_path
      ? db.storage.from("company-assets").createSignedUrl(s.company.logo_path, 3600)
      : Promise.resolve({ data: null }),
  ]);
  const urls = new Map(
    (media.data ?? [])
      .filter((d) => d.signedUrl && d.path)
      .map((d) => [d.path as string, d.signedUrl as string]),
  );

  return (
    <>
      {/* Only a superseded report needs a row above the header; Download PDF sits in it. */}
      {!print && r.status === "superseded" && r.newer_token ? (
        <div className="report-actions mx-auto max-w-4xl px-4 pt-4 sm:px-8 print:hidden">
          <Banner tone="warning">
            This report was updated.{" "}
            <Link
              href={`/r/${r.newer_token}`}
              className="font-semibold text-link underline underline-offset-2"
            >
              See the latest version
            </Link>
          </Banner>
        </div>
      ) : null}
      {r.template_key === "maintenance" ? (
        <VisitReportView
          snapshot={s as VisitSnapshot}
          version={r.version}
          sentAt={r.sent_at}
          urls={urls}
          logoUrl={logo.data?.signedUrl ?? null}
          pdfHref={print ? undefined : `/r/${token}/pdf`}
        />
      ) : (
        <ReportView
          templateKey={r.template_key}
          version={r.version}
          sentAt={r.sent_at}
          snapshot={s}
          sections={r.final_sections ?? []}
          urls={urls}
          logoUrl={logo.data?.signedUrl ?? null}
          pdfHref={print ? undefined : `/r/${token}/pdf`}
        />
      )}
    </>
  );
}

/** Whether the person looking is signed in to this shop (a teammate checking the link). */
async function fromTheShop(companyId: string): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  const { data } = await (
    await createClient()
  )
    .from("membership")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
}
