import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ISSUE_STATUS_LABELS,
  ISSUE_TEXT,
  ISSUE_WORK_LABELS,
  JOB_TYPE_LABELS,
  canManageIssues,
  companyServices,
  formatSchedule,
  issueActions,
} from "@leakbook/core";
import { IssueActions } from "@/components/issue-work";
import { Card, Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { getIssue } from "@/lib/issues";

export const metadata: Metadata = { title: "Issue · Sundeck Pro" };

/**
 * One issue (docs/design/2026-11-16-service-issues.md): what the tech wrote and their photos and
 * videos, the customer and pool, who reported it and on which visit, and the office's actions:
 * Make Quote, Make Leak Detection Job, Resolve, Reopen.
 */
export default async function IssuePage({ params }: PageProps<"/jobs/issues/[id]">) {
  const { id } = await params;
  const office = await getOffice();
  const [found, company] = await Promise.all([getIssue(office, id), getCompany(office)]);
  if (!found) notFound();
  const { issue, media, visit, madeJob } = found;
  const tz = office.company.timezone;
  const when = (iso: string) => formatSchedule(iso, new Date(), tz);
  const actions = issueActions(issue, office.company.role, companyServices(company.settings));
  const jobLabel = (j: { number: number | null; type: string }) =>
    `${j.number ? `Job #${j.number}` : "New job"} · ${JOB_TYPE_LABELS[j.type as keyof typeof JOB_TYPE_LABELS] ?? "Job"}`;

  return (
    <>
      <PageHeader
        back={{ href: "/jobs/issues", label: "Issues" }}
        title={issue.customer?.name ?? "Issue"}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <span>{ISSUE_STATUS_LABELS[issue.status]}</span>
            {issue.suggested_type ? <span>{ISSUE_WORK_LABELS[issue.suggested_type]}</span> : null}
            <span>Reported {when(issue.reported_at)}</span>
          </span>
        }
      />
      <div className="max-w-2xl space-y-6">
        <Card className="space-y-3 p-4">
          <p className="text-[1.0625rem] whitespace-pre-wrap">{issue.description}</p>
          {media.length ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Photos and videos">
              {media.map((m) => (
                <li key={m.id}>
                  {!m.url ? (
                    <div className="flex aspect-square items-center justify-center rounded-xl bg-text/[0.06] p-2 text-center text-[0.8125rem] text-text-muted">
                      Waiting to upload
                    </div>
                  ) : m.kind === "video" ? (
                    <video
                      src={m.url}
                      controls
                      playsInline
                      preload="metadata"
                      className="aspect-square w-full rounded-xl bg-black object-cover"
                    />
                  ) : m.kind === "audio" ? (
                    <audio src={m.url} controls className="w-full" />
                  ) : (
                    <a href={m.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.url}
                        alt={m.caption ?? "Photo of the issue"}
                        className="aspect-square w-full rounded-xl bg-text/10 object-cover"
                      />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <IssueActions issueId={issue.id} actions={actions} madeJobId={issue.converted_job_id} />
          {issue.status === "open" && !canManageIssues(office.company.role) ? (
            <p className="text-[0.9375rem] text-text-muted">{ISSUE_TEXT.onlyManagers}</p>
          ) : null}
        </Card>

        {issue.status === "resolved" ? (
          <Grouped title="Resolved">
            <Row label={issue.resolved_at ? when(issue.resolved_at) : "Resolved"} />
            {issue.resolution_note ? (
              <li className="px-4 py-2.5 whitespace-pre-wrap">{issue.resolution_note}</li>
            ) : null}
          </Grouped>
        ) : null}

        <Grouped title="Customer">
          {issue.customer ? (
            <Row
              href={`/customers/${issue.customer.id}`}
              label={issue.customer.name ?? "Customer"}
              detail={issue.address}
            />
          ) : (
            <Row label="Customer" />
          )}
        </Grouped>

        <Grouped title="Reported">
          <Row label="By" value={issue.reporter ?? "—"} />
          {visit ? <Row href={`/jobs/${visit.id}`} label="On" value={jobLabel(visit)} /> : null}
          {madeJob ? (
            <Row href={`/jobs/${madeJob.id}`} label="Made into" value={jobLabel(madeJob)} />
          ) : null}
        </Grouped>
      </div>
    </>
  );
}
