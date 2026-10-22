import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fmtTime, TABLE, TwoStepNeeded } from "@/components/admin/kit";
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
  note: "Wrote a note",
  export: "Exported a list",
};

function detail(details: Record<string, unknown>): string {
  const parts: string[] = [];
  if (details.access) parts.push(details.access === "view" ? "View Only" : "Can Make Changes");
  if (details.minutes) parts.push(`${details.minutes} min`);
  if (details.days) parts.push(`+${details.days} days`);
  if (details.list) parts.push(`${details.list}, ${details.rows} rows`);
  return parts.join(" · ");
}

/** Everything staff did, newest first. Nothing in it can be changed (owner, 2026-10-22). */
export default function ActivityLogPage({ searchParams }: PageProps<"/admin/activity">) {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <ActivityLog searchParams={searchParams} />
    </Suspense>
  );
}

async function ActivityLog({
  searchParams,
}: {
  searchParams: PageProps<"/admin/activity">["searchParams"];
}) {
  const gate = await staffGate("/admin/activity");
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
              <Link href="/admin/activity" className="text-link underline">
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
                      href={`/admin/activity?staff=${encodeURIComponent(r.staff_email)}`}
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
                        href={`/admin/shops/${r.company_ref}`}
                        className="text-link hover:underline"
                      >
                        {r.company_name ?? "Shop"}
                      </Link>
                    ) : (
                      r.company_name
                    )}
                    {r.target_user ? (
                      <Link
                        href={`/admin/people/${r.target_user}`}
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
