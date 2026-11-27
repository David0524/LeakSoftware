import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fmtTime, TABLE, TwoStepNeeded } from "@/components/admin/kit";
import { servicesLabel } from "@leakbook/core";
import { Empty, PageHeader } from "@/components/ui";
import { loadStaffActions, staffGate, type StaffActionKind } from "@/server/staff";

export const metadata: Metadata = { title: "Activity Log" };

const ACTION: Record<StaffActionKind, string> = {
  support_start: "Opened shop",
  support_end: "Ended session",
  trial_extend: "Extended trial",
  demo_on: "Made demo shop",
  demo_off: "Ended demo",
  two_step_off: "Turned off two-step",
  password_reset: "Sent password reset",
  note: "Wrote a note",
  export: "Exported a list",
  internal_on: "Marked internal",
  internal_off: "Counted again",
  cost_add: "Added a cost",
  cost_change: "Changed a cost",
  cost_delete: "Deleted a cost",
  promo_add: "Made a promo code",
  promo_on: "Turned on a promo code",
  promo_off: "Turned off a promo code",
  services_change: "Changed the package",
  price_change: "Set the shop's price",
  code_apply: "Applied a code",
  free_months: "Gave free months",
  refund: "Refunded a charge",
  cancel_change: "Changed the subscription",
  pause_on: "Paused billing",
  pause_off: "Resumed billing",
  prices_change: "Changed the prices",
  texting_retry: "Retried a texting registration",
};

function detail(details: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof details.code === "string") parts.push(details.code);
  if (details.access) parts.push(details.access === "view" ? "View Only" : "Can Make Changes");
  if (details.minutes) parts.push(`${details.minutes} min`);
  if (details.days) parts.push(`+${details.days} days`);
  if (details.months) parts.push(`+${details.months} months`);
  if (details.to) parts.push(`to ${servicesLabel(String(details.to))}`);
  if (details.when) parts.push(String(details.when).replace("_", " "));
  if (details.list) parts.push(`${details.list}, ${details.rows} rows`);
  return parts.join(" · ");
}

/** Everything staff did, newest first. Nothing in it can be changed (owner, 2026-10-22). */
export default function ActivityLogPage({ searchParams }: PageProps<"/k4cs4uxrntb27z/activity">) {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <ActivityLog searchParams={searchParams} />
    </Suspense>
  );
}

async function ActivityLog({
  searchParams,
}: {
  searchParams: PageProps<"/k4cs4uxrntb27z/activity">["searchParams"];
}) {
  const gate = await staffGate("/k4cs4uxrntb27z/activity");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Activity Log" />;
  const raw = (await searchParams).staff;
  const staffEmail = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const rows = await loadStaffActions({ staffEmail: staffEmail || undefined, limit: 500 });
  return (
    <>
      <PageHeader
        title="Activity Log"
        subtitle={
          staffEmail ? (
            <>
              What {staffEmail} did.{" "}
              <Link href="/k4cs4uxrntb27z/activity" className="text-link underline">
                Show Everyone
              </Link>
            </>
          ) : (
            "What staff did in the portal, newest first. It can’t be edited."
          )
        }
      />
      {rows.length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className={TABLE}>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold">
                  When
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Staff
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Did
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  For
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtTime(r.created_at)}</td>
                  <td>
                    <Link
                      href={`/k4cs4uxrntb27z/activity?staff=${encodeURIComponent(r.staff_email)}`}
                      className="hover:text-link"
                    >
                      {r.staff_email}
                    </Link>
                  </td>
                  <td>
                    {ACTION[r.action] ?? r.action}
                    {detail(r.details) ? (
                      <span className="block text-[0.8125rem] text-text-muted">
                        {detail(r.details)}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {r.company_ref ? (
                      <Link
                        href={`/k4cs4uxrntb27z/shops/${r.company_ref}`}
                        className="text-link hover:underline"
                      >
                        {r.company_name ?? "Shop"}
                      </Link>
                    ) : (
                      r.company_name
                    )}
                    {r.target_user ? (
                      <Link
                        href={`/k4cs4uxrntb27z/people/${r.target_user}`}
                        className="block text-link hover:underline"
                      >
                        {r.target_email ?? "Person"}
                      </Link>
                    ) : null}
                  </td>
                  <td className="max-w-md">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
