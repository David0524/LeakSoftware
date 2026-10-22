import type { Metadata } from "next";
import {
  ACTIVITY_OFFLINE,
  ACTIVITY_TITLE,
  JOB_TYPE_FILTER_TITLE,
  companyServices,
  jobTypeFilter,
  jobTypeFilters,
} from "@leakbook/core";
import { ActivityList } from "@/components/activity-list";
import { SortMenu } from "@/components/sort-menu";
import { Empty, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { activityPage, type ActivityPage } from "@/lib/activity";
import { getCompany } from "@/lib/data";

export const metadata: Metadata = { title: "Activity · Sundeck Pro" };

/**
 * More › Activity (owner, 2026-10-20): what happened in the shop, newest first. Each person
 * sees the events about what they can open (the database's row security decides). The Type
 * menu (owner, 2026-10-22: "Add a filter on the jobs and activity pages for job type") keeps
 * the events about jobs of one type, as on Jobs; texts aren't about a job, so they show only
 * under All Types. All Types isn't written in the address.
 */
export default async function ActivityScreen({ searchParams }: PageProps<"/activity">) {
  const office = await getOffice();
  const { type: typeParam } = await searchParams;
  const company = await getCompany(office);
  const services = companyServices(company.settings);
  const types = jobTypeFilters(services);
  const type = jobTypeFilter(typeParam, services);
  let page: ActivityPage | null = null;
  try {
    page = await activityPage(office, null, undefined, type);
  } catch {
    page = null;
  }
  return (
    <>
      <PageHeader
        title={ACTIVITY_TITLE}
        subtitle={<span className="hidden sm:inline">{office.company.name}</span>}
      />
      <div className="mb-5 flex max-w-2xl flex-wrap items-center gap-3">
        <SortMenu
          label={JOB_TYPE_FILTER_TITLE}
          name="type"
          options={types}
          value={type}
          hrefFor={Object.fromEntries(
            types.map((x) => [x.key, x.key === "all" ? "/activity" : `/activity?type=${x.key}`]),
          )}
        />
      </div>
      {page ? (
        <ActivityList
          // A new type starts a new list.
          key={type}
          initial={page.events}
          more={page.more}
          timeZone={office.company.timezone}
          type={type}
        />
      ) : (
        <Empty>{ACTIVITY_OFFLINE}</Empty>
      )}
    </>
  );
}
