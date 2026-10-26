import type { Metadata } from "next";
import { PillRow } from "@/components/pill-row";
import Link from "next/link";
import {
  JOB_TYPE_FILTER_TITLE,
  REPORT_SORTS,
  companyServices,
  jobTypeFilter,
  jobTypeFilters,
  reportSort,
  reportsEmpty,
} from "@leakbook/core";
import { JobsTabs } from "@/components/jobs-tabs";
import {
  Button,
  Empty,
  Grouped,
  PageHeader,
  RowContent,
  buttonClass,
  pillClass,
} from "@/components/ui";
import { ReportActions } from "@/components/list-actions";
import { SortMenu } from "@/components/sort-menu";
import { getOffice } from "@/lib/auth";
import { getCompany, listReports } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { emailConfigured } from "@/server/email";

export const metadata: Metadata = { title: "Reports · Sundeck Pro" };

const TEMPLATES = {
  homeowner: "Homeowner report",
  partner: "Pool company report",
  maintenance: "Visit report",
  maintenance_month: "Monthly service report",
} as const;

/** Reports per page; Show More adds this many. */
const PAGE = 50;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "draft", label: "Drafts" },
] as const;

/**
 * Jobs › Reports (owner, 2026-10-18): every job's current report, newest first, each opening
 * the job's Report and Sign-Off. A limited tech sees only their own jobs' reports (row security).
 * Searched, filtered by type and sorted as Jobs is (owner, 2026-10-25).
 */
export default async function ReportsPage({ searchParams }: PageProps<"/jobs/reports">) {
  const office = await getOffice();
  const { status, q, show, sort: sortParam, type: typeParam } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];
  const sort = reportSort(sortParam);
  const search = typeof q === "string" ? q.trim() : "";
  const limit = Math.min(Math.max(Number(show) || PAGE, PAGE), 500);
  const company = await getCompany(office);
  const types = jobTypeFilters(companyServices(company.settings));
  const type = jobTypeFilter(typeParam, companyServices(company.settings));
  const [found, origin] = await Promise.all([
    listReports(office, filter.key, { limit, search, sort, type }),
    siteOrigin(),
  ]);
  const more = found.length > limit;
  const reports = more ? found.slice(0, limit) : found;
  const link = (params: Record<string, string>) => {
    const next = new URLSearchParams({
      ...(filter.key !== "all" ? { status: filter.key } : {}),
      ...(search ? { q: search } : {}),
      ...(sort !== "newest" ? { sort } : {}),
      ...(type !== "all" ? { type } : {}),
      ...params,
    });
    if (next.get("status") === "all") next.delete("status");
    if (next.get("sort") === "newest") next.delete("sort");
    if (next.get("type") === "all") next.delete("type");
    if (!next.get("q")) next.delete("q");
    return `/jobs/reports${next.size ? `?${next}` : ""}`;
  };
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
      <PillRow
        label="Filter reports"
        className="-mx-4 -mt-1.5 mb-3.5 flex gap-2 overflow-x-auto px-4 whitespace-nowrap sm:mx-0 sm:px-0"
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
      <div className="mb-5 flex max-w-3xl flex-wrap items-center gap-3">
        <form
          action="/jobs/reports"
          className="flex w-full min-w-0 gap-2 md:w-auto md:flex-1"
          role="search"
        >
          {filter.key !== "all" ? <input type="hidden" name="status" value={filter.key} /> : null}
          {sort !== "newest" ? <input type="hidden" name="sort" value={sort} /> : null}
          {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
          <label htmlFor="q" className="sr-only">
            Search reports
          </label>
          <input
            id="q"
            name="q"
            type="search"
            enterKeyHint="search"
            defaultValue={search}
            placeholder="Customer name or job number"
            className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-control-border bg-surface px-3 focus:outline-3 focus:outline-focus"
          />
          <Button type="submit" kind="secondary" className="max-md:hidden">
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
          options={REPORT_SORTS}
          value={sort}
          hrefFor={Object.fromEntries(REPORT_SORTS.map((x) => [x.key, link({ sort: x.key })]))}
        />
      </div>
      {reports.length === 0 ? (
        <Empty>
          {search ? (
            <>
              No reports match “{search}”.{" "}
              <Link href={link({ q: "" })} className="font-semibold text-link">
                Clear Search
              </Link>
            </>
          ) : reportsEmpty(type) ? (
            reportsEmpty(type)
          ) : filter.key === "all" ? (
            "No reports yet. A job’s report is drafted from its Wrap-Up."
          ) : filter.key === "sent" ? (
            "No reports sent yet."
          ) : (
            "No drafts."
          )}
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
      {more ? (
        <div className="mt-5 flex max-w-3xl justify-center">
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
  );
}
