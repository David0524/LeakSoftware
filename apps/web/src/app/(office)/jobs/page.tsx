import { SamplePill } from "@/components/sample-pill";
import { PillRow } from "@/components/pill-row";
import type { Metadata } from "next";
import Link from "next/link";
import {
  JOB_SORTS,
  JOB_TYPE_FILTER_TITLE,
  JOB_TYPE_LABELS,
  canMoveJob,
  companyServices,
  formatAddress,
  formatSchedule,
  jobSort,
  jobTypeFilter,
  jobsEmpty,
  jobTypeFilters,
  propertyLocation,
  userTransitions,
  visitReportMode,
  type JobStatus,
} from "@leakbook/core";
import {
  Button,
  ButtonLink,
  Empty,
  Grouped,
  PageHeader,
  RowContent,
  buttonClass,
  pillClass,
} from "@/components/ui";
import { LiveStatusBadge } from "@/components/instant";
import { getOffice } from "@/lib/auth";
import { OPEN_STATUSES, getCompany, listJobs, mayMakeJobs, type JobRow } from "@/lib/data";
import { getLine } from "@/lib/messages";
import { completeSendPrompt } from "@/lib/next-step";
import { JobActions, type JobRowData } from "@/components/list-actions";
import { RowMenuButton } from "@/components/row-actions";
import { JobsTabs } from "@/components/jobs-tabs";
import { NavPlus } from "@/components/nav-bar";
import { SortMenu } from "@/components/sort-menu";
import { PhoneSearch } from "@/components/shop-search";

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
  const { status, q, show, sort: sortParam, type: typeParam } = await searchParams;
  // The order, as Invoices sorts (owner, 2026-10-20); Scheduled Date isn't written in the address.
  const sort = jobSort(sortParam);
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0]!;
  const search = typeof q === "string" ? q.trim() : "";
  const limit = Math.min(Math.max(Number(show) || PAGE, PAGE), 500);
  const lineLoad = getLine(office);
  const company = await getCompany(office);
  // The Type menu (owner, 2026-10-22): the shop's job types; All Types isn't written in the
  // address. It narrows the status filter and the search, as Sort orders them.
  const types = jobTypeFilters(companyServices(company.settings));
  const type = jobTypeFilter(typeParam, companyServices(company.settings));
  const [found, line] = await Promise.all([
    listJobs(office, filter.statuses, { limit, search, sort, type }),
    lineLoad,
  ]);
  const reportMode = visitReportMode(company.settings);
  // A row's swipe actions and menu (gestures.md section 12), from what its page offers.
  const actions = (j: JobRow): JobRowData => ({
    id: j.id,
    number: j.number ?? null,
    customer: j.customer?.name ?? "Customer",
    phone: j.customer?.phone ?? null,
    inboxHref:
      line?.status === "active" && j.customer ? `/messages/new?customer=${j.customer.id}` : null,
    address: j.property ? formatAddress(j.property) : null,
    location: propertyLocation(j.property),
    canComplete: userTransitions(j.status, j.type).includes("done"),
    completePrompt: completeSendPrompt({
      jobType: j.type,
      reportMode,
      customer: j.customer?.name,
    }),
    canMove: canMoveJob(j.status),
  });
  const more = found.length > limit;
  const jobs = more ? found.slice(0, limit) : found;
  const link = (params: Record<string, string>) => {
    const next = new URLSearchParams({
      ...(filter.key !== "open" ? { status: filter.key } : {}),
      ...(search ? { q: search } : {}),
      ...(sort !== "scheduled" ? { sort } : {}),
      ...(type !== "all" ? { type } : {}),
      ...params,
    });
    if (next.get("status") === "open") next.delete("status");
    if (next.get("sort") === "scheduled") next.delete("sort");
    if (next.get("type") === "all") next.delete("type");
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
      {/* Phones: one search across the shop under the title (owner, 2026-10-20); it takes the
          list's place while in use. Wider screens search jobs here. Sort stays on both. */}
      <PhoneSearch userId={office.user.id}>
        <JobsTabs current="jobs" />
        <PillRow
          label="Filter jobs by status"
          className="-mx-4 -mt-1.5 mb-3.5 flex gap-2 overflow-x-auto px-4 whitespace-nowrap sm:mx-0 sm:flex-wrap sm:px-0"
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
        </PillRow>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <form action="/jobs" className="flex min-w-0 flex-1 gap-2 max-md:hidden" role="search">
            {filter.key !== "open" ? (
              <input type="hidden" name="status" value={filter.key} />
            ) : null}
            {sort !== "scheduled" ? <input type="hidden" name="sort" value={sort} /> : null}
            {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
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
            compact
            label={JOB_TYPE_FILTER_TITLE}
            name="type"
            options={types}
            value={type}
            hrefFor={Object.fromEntries(types.map((x) => [x.key, link({ type: x.key })]))}
          />
          <SortMenu
            compact
            options={JOB_SORTS}
            value={sort}
            hrefFor={Object.fromEntries(JOB_SORTS.map((x) => [x.key, link({ sort: x.key })]))}
          />
        </div>

        {jobs.length === 0 ? (
          <Empty>{search ? `No jobs match “${search}”.` : jobsEmpty(type)}</Empty>
        ) : (
          <>
            {/* Phones: an inset grouped list, a row per job. */}
            <Grouped className="sm:hidden">
              {jobs.map((j) => (
                <JobActions key={j.id} as="li" job={actions(j)}>
                  <RowContent
                    href={`/jobs/${j.id}`}
                    label={
                      <span className="font-semibold">
                        {j.customer?.name ?? "Customer"}
                        {j.sample ? <SamplePill className="ml-2 align-middle" /> : null}
                      </span>
                    }
                    detail={
                      <>
                        <span className="block">
                          {j.number ? `#${j.number}` : j.sample ? "Sample job" : "New job"} ·{" "}
                          {JOB_TYPE_LABELS[j.type]}
                        </span>
                        {j.property ? (
                          <span className="block truncate">{formatAddress(j.property)}</span>
                        ) : null}
                        <span className="block text-text">
                          {j.status === "in_progress" && j.started_at
                            ? "Started"
                            : formatSchedule(
                                j.scheduled_start ?? null,
                                now,
                                office.company.timezone,
                              )}
                          {" · "}
                          {j.techName ?? "Unassigned"}
                        </span>
                      </>
                    }
                    value={<LiveStatusBadge jobId={j.id} status={j.status} />}
                  />
                </JobActions>
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
                    <JobActions
                      key={j.id}
                      as="tr"
                      job={actions(j)}
                      className="border-b border-border last:border-0 hover:bg-bg"
                    >
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/jobs/${j.id}`}
                          className="font-semibold text-link underline-offset-4 hover:underline"
                        >
                          {j.number ? `#${j.number}` : j.sample ? "Sample job" : "New job"}
                        </Link>
                        <div className="text-[0.9375rem] text-text-muted">
                          {JOB_TYPE_LABELS[j.type]}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">
                          {j.customer?.name ?? "Customer"}
                          {j.sample ? <SamplePill className="ml-2 align-middle" /> : null}
                        </div>
                        <div className="text-[0.9375rem] text-text-muted">
                          {j.property ? formatAddress(j.property) : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <LiveStatusBadge jobId={j.id} status={j.status} />
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        {j.status === "in_progress" && j.started_at
                          ? "Started"
                          : formatSchedule(j.scheduled_start ?? null, now, office.company.timezone)}
                      </td>
                      {/* Room kept at the end for the row's "⋯" button (gestures.md section 12). */}
                      <td className="relative py-3 pr-12 pl-4 align-top">
                        {j.techName ?? <span className="text-text-muted">Unassigned</span>}
                        <RowMenuButton />
                      </td>
                    </JobActions>
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
      </PhoneSearch>
    </>
  );
}
