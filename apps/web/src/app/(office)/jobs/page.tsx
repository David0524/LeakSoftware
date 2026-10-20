import type { Metadata } from "next";
import Link from "next/link";
import {
  JOB_SORTS,
  JOB_TYPE_LABELS,
  formatAddress,
  formatSchedule,
  jobSort,
  type JobStatus,
} from "@leakbook/core";
import {
  Button,
  ButtonLink,
  Empty,
  Grouped,
  PageHeader,
  Row,
  StatusBadge,
  buttonClass,
  pillClass,
} from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { OPEN_STATUSES, listJobs, mayMakeJobs } from "@/lib/data";
import { JobsTabs } from "@/components/jobs-tabs";
import { NavPlus } from "@/components/nav-bar";
import { Suspense } from "react";
import { ScreenTip } from "@/components/screen-tip";
import { SortMenu } from "@/components/sort-menu";

export const metadata: Metadata = { title: "Jobs · Sundeck Pro" };

/** Jobs per page; Show More adds this many. */
const PAGE = 50;

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
  { key: "done", label: "Done", statuses: ["done"] },
  { key: "canceled", label: "Canceled", statuses: ["canceled"] },
  { key: "all", label: "All", statuses: null },
];

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const office = await getOffice();
  const canAdd = await mayMakeJobs(office);
  const { status, q, show, sort: sortParam } = await searchParams;
  // The order, as Invoices sorts (owner, 2026-10-20); Scheduled Date isn't written in the address.
  const sort = jobSort(sortParam);
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0]!;
  const search = typeof q === "string" ? q.trim() : "";
  const limit = Math.min(Math.max(Number(show) || PAGE, PAGE), 500);
  const found = await listJobs(office, filter.statuses, { limit, search, sort });
  const more = found.length > limit;
  const jobs = more ? found.slice(0, limit) : found;
  const link = (params: Record<string, string>) => {
    const next = new URLSearchParams({
      ...(filter.key !== "open" ? { status: filter.key } : {}),
      ...(search ? { q: search } : {}),
      ...(sort !== "scheduled" ? { sort } : {}),
      ...params,
    });
    if (next.get("status") === "open") next.delete("status");
    if (next.get("sort") === "scheduled") next.delete("sort");
    if (!next.get("q")) next.delete("q");
    return `/jobs${next.size ? `?${next}` : ""}`;
  };
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Jobs"
        navAction={canAdd ? <NavPlus href="/jobs/new" label="New Job" /> : undefined}
        subtitle={<span className="hidden sm:inline">{office.company.name}</span>}
        actions={canAdd ? <ButtonLink href="/jobs/new">New Job</ButtonLink> : undefined}
        // Phones use the "+" in the navigation bar instead.
        actionsClassName="hidden sm:flex"
      />
      <JobsTabs current="jobs" />
      <Suspense fallback={null}>
        <ScreenTip screen="jobs" />
      </Suspense>
      <nav
        aria-label="Filter jobs by status"
        className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 whitespace-nowrap sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={link({ status: f.key })}
            aria-current={f === filter ? "page" : undefined}
            className={pillClass(f === filter)}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form action="/jobs" className="flex min-w-0 flex-1 gap-2" role="search">
          {filter.key !== "open" ? <input type="hidden" name="status" value={filter.key} /> : null}
          {sort !== "scheduled" ? <input type="hidden" name="sort" value={sort} /> : null}
          <label htmlFor="q" className="sr-only">
            Search jobs
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Customer name or job number"
            className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-control-border bg-surface px-3 focus:outline-3 focus:outline-focus"
          />
          <Button type="submit" kind="secondary">
            Search
          </Button>
        </form>
        <SortMenu
          options={JOB_SORTS}
          value={sort}
          hrefFor={Object.fromEntries(JOB_SORTS.map((x) => [x.key, link({ sort: x.key })]))}
        />
      </div>

      {jobs.length === 0 ? (
        <Empty>
          {search
            ? `No jobs match “${search}”.`
            : "No jobs here. Add one with New Job, or on the phone."}
        </Empty>
      ) : (
        <>
          {/* Phones: an inset grouped list, a row per job. */}
          <Grouped className="sm:hidden">
            {jobs.map((j) => (
              <Row
                key={j.id}
                href={`/jobs/${j.id}`}
                label={<span className="font-semibold">{j.customer?.name ?? "Customer"}</span>}
                detail={
                  <>
                    <span className="block">
                      {j.number ? `#${j.number}` : "New job"} · {JOB_TYPE_LABELS[j.type]}
                    </span>
                    {j.property ? (
                      <span className="block truncate">{formatAddress(j.property)}</span>
                    ) : null}
                    <span className="block text-text">
                      {j.status === "in_progress" && j.started_at
                        ? "Started"
                        : formatSchedule(j.scheduled_start ?? null, now, office.company.timezone)}
                      {" · "}
                      {j.techName ?? "Unassigned"}
                    </span>
                  </>
                }
                value={<StatusBadge status={j.status} />}
              />
            ))}
          </Grouped>
          <div className="hidden overflow-x-auto card sm:block">
            <table className="w-full text-left">
              <thead className="border-b border-border text-[0.9375rem] text-text-muted">
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
                      <div className="text-[0.9375rem] text-text-muted">
                        {JOB_TYPE_LABELS[j.type]}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">{j.customer?.name ?? "Customer"}</div>
                      <div className="text-[0.9375rem] text-text-muted">
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
          {more ? (
            <div className="mt-5 flex justify-center">
              <Link
                href={link({ show: String(limit + PAGE) })}
                className={buttonClass("secondary")}
                scroll={false}
              >
                Show More
              </Link>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
