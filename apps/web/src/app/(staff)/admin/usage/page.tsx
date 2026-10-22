import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoStepNeeded } from "@/components/admin/kit";
import {
  PeriodControl,
  UsageDetail,
  UsagePeople,
  usagePeriod,
  UsageSummary,
} from "@/components/admin/usage-panels";
import { PageHeader } from "@/components/ui";
import { loadUsage, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "Usage" };

/**
 * How people use Sundeck Pro (owner, 2026-10-22: "track screen time, how users use the app";
 * per person, kept in our own database): screen time, screens, features, app versions, errors.
 */
export default function UsagePage({ searchParams }: PageProps<"/admin/usage">) {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <UsageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function UsageBody({
  searchParams,
}: {
  searchParams: PageProps<"/admin/usage">["searchParams"];
}) {
  const gate = await staffGate("/admin/usage");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Usage" />;
  const days = usagePeriod((await searchParams).days);
  const u = await loadUsage(days);
  return (
    <>
      <PageHeader
        title="Usage"
        subtitle="Screen time counts only while Sundeck Pro is in front and in use: on the website, until 5 minutes without a touch."
        actions={<PeriodControl days={days} href={(d) => `/admin/usage?days=${d}`} />}
      />
      <UsageSummary u={u} />
      <UsageDetail u={u} />
      <UsagePeople u={u} />
    </>
  );
}
