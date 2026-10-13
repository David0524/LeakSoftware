import type { Metadata } from "next";
import Link from "next/link";
import { JOB_TYPE_LABELS, formatAddress, formatSchedule, type JobStatus } from "@leakbook/core";
import { Empty, PageHeader, StatusBadge, cx } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { OPEN_STATUSES, listJobs } from "@/lib/data";

export const metadata: Metadata = { title: "Jobs · Tidemark" };

const FILTERS: { key: string; label: string; statuses: JobStatus[] | null }[] = [
  { key: "open", label: "Open", statuses: OPEN_STATUSES },
  { key: "unscheduled", label: "Unscheduled", statuses: ["unscheduled"] },
  { key: "scheduled", label: "Scheduled", statuses: ["scheduled"] },
  { key: "in_progress", label: "In Progress", statuses: ["in_progress"] },
  {
    key: "follow_up",
    label: "Waiting on Customer",
    statuses: ["report_sent", "quote_sent", "quote_accepted", "invoiced"],
  },
  { key: "paid", label: "Paid", statuses: ["paid"] },
  { key: "canceled", label: "Canceled", statuses: ["canceled"] },
  { key: "all", label: "All", statuses: null },
];

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const office = await getOffice();
  const { status } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0]!;
  const jobs = await listJobs(office, filter.statuses);
  const now = new Date();

  return (
    <>
      <PageHeader title="Jobs" subtitle={office.company.name} />
      <nav aria-label="Filter jobs by status" className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/jobs" : `/jobs?status=${f.key}`}
            aria-current={f === filter ? "page" : undefined}
            className={cx(
              "min-h-11 content-center rounded-md border px-3 font-medium",
              f === filter
                ? "border-text bg-text text-bg"
                : "border-control-border bg-surface hover:bg-bg",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {jobs.length === 0 ? (
        <Empty>No jobs here. New jobs are created on the phone.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left">
            <thead className="border-b border-border text-[15px] text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Job
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Customer and address
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  When
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Tech
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-border last:border-0 hover:bg-bg">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/jobs/${j.id}`}
                      className="font-semibold text-link underline-offset-4 hover:underline"
                    >
                      {j.number ? `#${j.number}` : "New job"}
                    </Link>
                    <div className="text-[15px] text-text-muted">{JOB_TYPE_LABELS[j.type]}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">{j.customer?.name ?? "Customer"}</div>
                    <div className="text-[15px] text-text-muted">
                      {j.property ? formatAddress(j.property) : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {j.status === "in_progress" && j.started_at
                      ? "Started"
                      : formatSchedule(j.scheduled_start ?? null, now, office.company.timezone)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {j.techName ?? <span className="text-text-muted">Unassigned</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
