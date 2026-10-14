import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { FinalSection, ReportSnapshot, ReportTemplateKey } from "@leakbook/core";
import { Banner, DOC_PAGE } from "@/components/doc-ui";
import { ReportView } from "@/components/report-view";
import { publicClient } from "@/server/reports";

export const metadata: Metadata = { title: "Leak Detection Report", robots: { index: false } };

interface TokenReport {
  report_id: string;
  company_id: string;
  job_id: string;
  template_key: ReportTemplateKey;
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
      <Suspense fallback={<p className="p-8 text-center text-neutral-500">Loading your report…</p>}>
        <Report params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Report({ params, searchParams }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const { print } = await searchParams;
  const db = publicClient();
  const { data } = await db.rpc("report_for_token", { link_token: token, count_view: !print });
  const r = data as TokenReport | null;
  if (!r) notFound();

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
    </>
  );
}
