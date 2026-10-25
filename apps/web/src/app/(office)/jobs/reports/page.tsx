import type { Metadata } from "next";
import Link from "next/link";
import { JobsTabs } from "@/components/jobs-tabs";
import { Empty, Grouped, PageHeader, RowContent, pillClass } from "@/components/ui";
import { ReportActions } from "@/components/list-actions";
import { getOffice } from "@/lib/auth";
import { listReports } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { emailConfigured } from "@/server/email";

export const metadata: Metadata = { title: "Reports · Sundeck Pro" };

const TEMPLATES = {
  homeowner: "Homeowner report",
  partner: "Pool company report",
  maintenance: "Visit report",
  maintenance_month: "Monthly service report",
} as const;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "draft", label: "Drafts" },
] as const;

/**
 * Jobs › Reports (owner, 2026-10-18): every job's current report, newest first, each opening
 * the job's Report and Sign-Off. A limited tech sees only their own jobs' reports (row security).
 */
export default async function ReportsPage({ searchParams }: PageProps<"/jobs/reports">) {
  const office = await getOffice();
  const { status } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];
  const [reports, origin] = await Promise.all([listReports(office, filter.key), siteOrigin()]);
  const emailReady = emailConfigured();
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone: office.company.timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={<span className="hidden sm:inline">{office.company.name}</span>}
      />
      <JobsTabs current="reports" />
      <nav
        aria-label="Filter reports"
        className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 whitespace-nowrap sm:mx-0 sm:px-0"
      >
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/jobs/reports${f.key === "all" ? "" : `?status=${f.key}`}`}
            aria-current={f === filter ? "page" : undefined}
            className={pillClass(f === filter)}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {reports.length === 0 ? (
        <Empty>
          {filter.key === "all"
            ? "No reports yet. A job’s report is drafted from its Wrap-Up."
            : filter.key === "sent"
              ? "No reports sent yet."
              : "No drafts."}
        </Empty>
      ) : (
        <Grouped className="max-w-3xl">
          {reports.map((r) => (
            <ReportActions
              key={r.id}
              report={{
                id: r.id,
                jobId: r.job_id,
                title: `${r.job?.bill_to?.name ?? "Customer"} · ${r.job?.number ? `Job #${r.job.number}` : "New job"}`,
                template: r.template_key,
                link: r.status === "sent" && r.token ? `${origin}/r/${r.token}` : null,
                // Resend: sent ones, by email to the customer, as the job page's Send by Email.
                resendTo:
                  r.status === "sent" && emailReady ? (r.job?.bill_to?.email ?? null) : null,
              }}
            >
              <RowContent
                href={`/jobs/${r.job_id}?tab=wrap-up`}
                label={
                  <>
                    <span className="font-semibold">{r.job?.bill_to?.name ?? "Customer"}</span>
                    <span className="text-text-muted">
                      {" "}
                      · {r.job?.number ? `Job #${r.job.number}` : "New job"}
                    </span>
                  </>
                }
                detail={[
                  r.job?.type === "inspection" && r.template_key === "homeowner"
                    ? "Pool inspection report"
                    : TEMPLATES[r.template_key],
                  r.version > 1 ? `version ${r.version}` : null,
                  r.job?.property?.address_line1,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                value={r.status === "sent" && r.sent_at ? `Sent ${day(r.sent_at)}` : "Draft"}
              />
            </ReportActions>
          ))}
        </Grouped>
      )}
    </>
  );
}
