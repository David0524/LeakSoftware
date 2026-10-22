import type { FinalSection, ReportSnapshot } from "@leakbook/core";
import { formatSchedule } from "@leakbook/core";
import type { Office } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ReportView } from "./report-view";
import { SampleCard } from "./sample-card";
import { SamplePill } from "./sample-pill";
import { PageHeader } from "./ui";

/**
 * The sample job's page (owner, 2026-10-22; docs/design/2026-10-22-first-win.md): it opens to
 * its finished report, under the card that offers Send Yourself This Report. The report is the
 * customer's view, with the shop's own name and logo from Settings.
 */
export async function SampleJob({
  office,
  job,
}: {
  office: Office;
  job: { id: string; scheduled_start?: string | null; customer?: { name: string } | null };
}) {
  const db = await createClient();
  const { data: report } = await db
    .from("report")
    .select("id, template_key, version, sent_at, final_sections, data_snapshot")
    .eq("job_id", job.id)
    .eq("status", "sent")
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: link } = report
    ? await db
        .from("share_link")
        .select("token")
        .eq("report_id", report.id)
        .is("revoked_at", null)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const snapshot = (report?.data_snapshot ?? null) as ReportSnapshot | null;
  const logoPath = snapshot?.company.logo_path ?? null;
  const logo = logoPath
    ? await db.storage.from("company-assets").createSignedUrl(logoPath, 3600)
    : { data: null };
  const href = link ? `/r/${link.token as string}` : "#";

  return (
    <>
      <PageHeader
        back={{ href: "/today", label: "Today" }}
        title={job.customer?.name ?? "Sample Customer"}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <SamplePill />
            <span>
              {formatSchedule(job.scheduled_start ?? null, new Date(), office.company.timezone)}
            </span>
          </span>
        }
      />
      <SampleCard jobId={job.id} reportHref={href} hasLogo={!!logoPath} email={office.user.email} />
      {report && snapshot ? (
        <div className="max-w-4xl" data-testid="sample-report">
          <ReportView
            templateKey="homeowner"
            version={report.version as number}
            sentAt={report.sent_at as string | null}
            snapshot={snapshot}
            sections={(report.final_sections ?? []) as FinalSection[]}
            urls={new Map()}
            logoUrl={logo.data?.signedUrl ?? null}
            pdfHref={link ? `${href}/pdf` : undefined}
          />
        </div>
      ) : null}
    </>
  );
}
