import type { Metadata } from "next";
import { ACTIVITY_OFFLINE, ACTIVITY_TITLE } from "@leakbook/core";
import { ActivityList } from "@/components/activity-list";
import { Empty, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { activityPage, type ActivityPage } from "@/lib/activity";

export const metadata: Metadata = { title: "Activity · Sundeck Pro" };

/**
 * More › Activity (owner, 2026-10-20): what happened in the shop, newest first. Each person
 * sees the events about what they can open (the database's row security decides).
 */
export default async function ActivityScreen() {
  const office = await getOffice();
  let page: ActivityPage | null = null;
  try {
    page = await activityPage(office);
  } catch {
    page = null;
  }
  return (
    <>
      <PageHeader
        title={ACTIVITY_TITLE}
        subtitle={<span className="hidden sm:inline">{office.company.name}</span>}
      />
      {page ? (
        <ActivityList initial={page.events} more={page.more} timeZone={office.company.timezone} />
      ) : (
        <Empty>{ACTIVITY_OFFLINE}</Empty>
      )}
    </>
  );
}
