import type { Metadata } from "next";
import Link from "next/link";
import { ISSUE_FILTERS, canManageIssues, issuesEmpty } from "@leakbook/core";
import { IssueListRow } from "@/components/issues";
import { JobsTabs } from "@/components/jobs-tabs";
import { PillRow } from "@/components/pill-row";
import { Empty, Grouped, PageHeader, pillClass } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listIssues, openIssues } from "@/lib/issues";

export const metadata: Metadata = { title: "Issues · Sundeck Pro" };

/**
 * Jobs › Issues (docs/design/2026-11-16-service-issues.md): problems techs reported on visits,
 * newest first, each opening its page (Make Quote, Make Leak Detection Job, Resolve). Open,
 * Done (resolved or made a job) and All. A tech sees the ones they reported.
 */
export default async function IssuesPage({ searchParams }: PageProps<"/jobs/issues">) {
  const office = await getOffice();
  const { status } = await searchParams;
  const filter = ISSUE_FILTERS.find((f) => f.key === status) ?? ISSUE_FILTERS[0]!;
  const [issues, open] = await Promise.all([listIssues(office, filter.key), openIssues(office)]);

  return (
    <>
      <PageHeader
        title="Issues"
        subtitle={<span className="hidden sm:inline">{office.company.name}</span>}
      />
      <JobsTabs current="issues" openIssues={open} />
      <PillRow
        label="Filter issues"
        className="-mx-4 -mt-1.5 mb-3.5 flex gap-2 overflow-x-auto px-4 whitespace-nowrap sm:mx-0 sm:px-0"
      >
        {ISSUE_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/jobs/issues" : `/jobs/issues?status=${f.key}`}
            aria-current={f === filter ? "page" : undefined}
            className={pillClass(f === filter)}
          >
            {f.label}
          </Link>
        ))}
      </PillRow>
      {issues.length === 0 ? (
        <Empty>{issuesEmpty(filter.key, canManageIssues(office.company.role))}</Empty>
      ) : (
        <Grouped className="max-w-3xl">
          {issues.map((i) => (
            <IssueListRow key={i.id} issue={i} timeZone={office.company.timezone} />
          ))}
        </Grouped>
      )}
    </>
  );
}
