import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  reportSignOffPurposes,
  type FinalSection,
  type ReportSnapshot,
  type ReportTemplateKey,
} from "@leakbook/core";
import { ReportView } from "@/components/report-view";
import { SignOff } from "@/components/sign-off";
import { getOffice } from "@/lib/auth";
import { getCompany, signedMediaUrls } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { ReportLoading } from "@/components/report-loading";

export const metadata: Metadata = { title: "Review and Sign · Sundeck Pro" };

interface Preview {
  report_id: string;
  job_id: string;
  template_key: ReportTemplateKey;
  version: number;
  status: "draft" | "sent" | "superseded";
  final_sections: FinalSection[] | null;
  snapshot: ReportSnapshot;
  pending: number;
}

/**
 * Review with Customer (owner request, 2026-10-13): the tech hands over the phone; the customer
 * reads the report exactly as they will get it and signs at the bottom. Signing (or Customer
 * Not Here) finishes the report. No office navigation, so the customer stays on the report.
 */
export default function SignOffPage({ params }: PageProps<"/sign-off/[reportId]">) {
  // Phones: the iOS grouped gray, matching the report's cards.
  return (
    <main className="lb-light min-h-full flex-1 bg-paper text-text max-sm:bg-bg">
      <Suspense fallback={<ReportLoading title="Getting the report ready to sign" />}>
        <Review params={params} />
      </Suspense>
    </main>
  );
}

async function Review({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const office = await getOffice();
  const db = await createClient();
  const { data } = await db.rpc("report_preview", { target_report: reportId });
  const r = data as Preview | null;
  if (!r) notFound();
  if (r.status !== "draft") redirect(`/jobs/${r.job_id}?tab=wrap-up`);

  const s = r.snapshot;
  const company = await getCompany(office);
  const [urls, logo] = await Promise.all([
    signedMediaUrls([
      ...s.media.filter((m) => m.kind === "photo").map((m) => m.storage_path),
      ...s.signatures.map((x) => x.image_path).filter((x): x is string => !!x),
    ]),
    s.company.logo_path
      ? db.storage.from("company-assets").createSignedUrl(s.company.logo_path, 3600)
      : Promise.resolve({ data: null }),
  ]);
  const hasText = (r.final_sections ?? []).some((x) => x.text.trim());
  const back = `/jobs/${r.job_id}?tab=wrap-up`;

  return (
    <>
      <div className="glass sticky top-0 z-20 rounded-none border-x-0 border-t-0 print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-2 py-1">
          <Link
            href={back}
            className="inline-flex min-h-11 items-center px-3 font-display text-[1.0625rem] font-bold text-link"
          >
            Back to Job
          </Link>
          <p className="truncate text-[0.9375rem] font-semibold text-text-muted">
            {s.company.name}
          </p>
          <a
            href="#sign"
            className="inline-flex min-h-11 items-center px-3 font-display text-[1.0625rem] font-bold text-link"
          >
            Sign
          </a>
        </div>
      </div>
      <p className="mx-auto max-w-4xl px-4 pt-4 text-[1.0625rem] sm:px-8">
        Please read your report. Sign at the bottom to confirm the visit.
      </p>
      <ReportView
        templateKey={r.template_key}
        version={r.version}
        sentAt={null}
        snapshot={s}
        sections={r.final_sections ?? []}
        urls={urls}
        logoUrl={logo.data?.signedUrl ?? null}
      />
      <section
        id="sign"
        aria-labelledby="sign-title"
        className="mx-auto max-w-4xl scroll-mt-16 px-4 pt-2 pb-16 sm:px-8"
      >
        <SignOff
          reportId={r.report_id}
          jobId={r.job_id}
          purposes={reportSignOffPurposes(company.settings)}
          signer={s.customer?.name ?? ""}
          shop={s.company.name}
          address={s.property.address || null}
          blocked={
            !hasText
              ? "Write the report before the customer signs."
              : r.pending > 0
                ? `${r.pending} checklist ${r.pending === 1 ? "item is" : "items are"} still to do. Finish the checklist, then come back to sign.`
                : null
          }
          back={back}
          // The way out goes where the work is: the Checklist when items are left.
          fix={
            hasText && r.pending > 0
              ? { href: `/jobs/${r.job_id}?tab=checklist`, label: "Go to Checklist" }
              : null
          }
        />
      </section>
    </>
  );
}
