import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  acceptanceRate,
  dashboardTotals,
  formatCents,
  monthLabel,
  type Dashboard,
} from "@leakbook/core";
import { Card, Empty, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard · Tidemark" };

const MONTHS = 6;
// The jobs list groups these as "Waiting on Customer".
const WAITING: string[] = ["report_sent", "quote_sent", "quote_accepted", "invoiced"];

/** Owners: how the shop is doing. Jobs by status now; quotes and money over six months. */
export default async function DashboardPage() {
  const office = await getOffice();
  if (!office.isOwner) redirect("/jobs");
  const { data, error } = await (
    await createClient()
  ).rpc("owner_dashboard", {
    target_company: office.company.id,
    months: MONTHS,
  });
  if (error || !data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Empty>The dashboard isn’t available until the database is updated.</Empty>
      </>
    );
  }
  const d = data as Dashboard;
  const totals = dashboardTotals(d.months);
  const statuses = JOB_STATUSES.map((s) => ({ status: s, n: d.statuses[s] ?? 0 })).filter(
    (s) => s.n > 0,
  );
  const maxStatus = Math.max(1, ...statuses.map((s) => s.n));
  const maxCollected = Math.max(1, ...d.months.map((m) => m.collected_cents));
  const range = `${monthLabel(d.months[0]!.month)} – ${monthLabel(d.months.at(-1)!.month)}`;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Last ${MONTHS} months · ${range}`} />

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Collected"
          value={formatCents(totals.collected_cents)}
          note={`${MONTHS} months`}
        />
        <Stat
          label="Owed to you"
          value={formatCents(d.outstanding_cents)}
          note={
            <Link href="/invoices" className="text-link underline-offset-4 hover:underline">
              Open invoices
            </Link>
          }
        />
        <Stat
          label="Quotes accepted"
          value={acceptanceRate(totals.quotes_sent, totals.quotes_accepted)}
          note={`${totals.quotes_accepted} of ${totals.quotes_sent} sent`}
        />
        <Stat
          label="Invoiced"
          value={formatCents(totals.invoiced_cents)}
          note={`${MONTHS} months`}
        />
      </dl>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-2">
        <Card aria-labelledby="collected-title">
          <h2 id="collected-title" className="font-display text-xl font-bold">
            Collected by Month
          </h2>
          <p className="mb-4 text-[15px] text-text-muted">
            Payments received, by card, bank, or check.
          </p>
          <ol className="flex h-48 items-end gap-2 border-b border-border" aria-hidden="true">
            {d.months.map((m, i) => {
              const h = Math.round((m.collected_cents / maxCollected) * 100);
              const last = i === d.months.length - 1;
              return (
                <li
                  key={m.month}
                  className="group relative flex h-full flex-1 flex-col justify-end"
                >
                  {last && m.collected_cents ? (
                    <span className="mb-1 text-center text-[13px] font-semibold tabular-nums">
                      {formatCents(m.collected_cents)}
                    </span>
                  ) : null}
                  <span
                    className="mx-auto w-full max-w-12 rounded-t bg-chart"
                    style={{ height: `${Math.max(h, m.collected_cents ? 2 : 0)}%` }}
                  />
                  <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 rounded bg-text px-2 py-1 text-[13px] whitespace-nowrap text-bg group-hover:block">
                    {monthLabel(m.month)}: {formatCents(m.collected_cents)}
                  </span>
                </li>
              );
            })}
          </ol>
          <ol
            className="mt-1 flex gap-2 text-center text-[13px] text-text-muted"
            aria-hidden="true"
          >
            {d.months.map((m) => (
              <li key={m.month} className="flex-1">
                {monthLabel(m.month).split(" ")[0]}
              </li>
            ))}
          </ol>
        </Card>

        <Card aria-labelledby="status-title">
          <h2 id="status-title" className="font-display text-xl font-bold">
            Jobs by Status
          </h2>
          <p className="mb-4 text-[15px] text-text-muted">Every job, as of now.</p>
          {statuses.length === 0 ? (
            <Empty>No jobs yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {statuses.map((s) => (
                <li key={s.status}>
                  <Link
                    href={`/jobs?status=${WAITING.includes(s.status) ? "follow_up" : s.status}`}
                    className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 rounded py-1 hover:bg-bg"
                  >
                    <span className="text-[15px]">{JOB_STATUS_LABELS[s.status]}</span>
                    <span
                      className="h-3 rounded-r bg-chart"
                      style={{ width: `${(s.n / maxStatus) * 100}%` }}
                    />
                    <span className="text-right font-semibold tabular-nums">{s.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5 overflow-x-auto" aria-labelledby="months-title">
        <h2 id="months-title" className="mb-3 font-display text-xl font-bold">
          By Month
        </h2>
        <table className="w-full min-w-[640px] text-left tabular-nums">
          <thead className="border-b border-border text-[15px] text-text-muted">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">
                Month
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Quotes sent
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Accepted
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Invoiced
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Collected
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Still owed
              </th>
            </tr>
          </thead>
          <tbody>
            {[...d.months].reverse().map((m) => (
              <tr key={m.month} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 pr-3 font-medium">
                  {monthLabel(m.month, true)}
                </th>
                <td className="py-2 pr-3 text-right">{m.quotes_sent}</td>
                <td className="py-2 pr-3 text-right">
                  {m.quotes_accepted}
                  {m.quotes_sent ? (
                    <span className="text-text-muted">
                      {" "}
                      ({acceptanceRate(m.quotes_sent, m.quotes_accepted)})
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-right">{formatCents(m.invoiced_cents)}</td>
                <td className="py-2 pr-3 text-right">{formatCents(m.collected_cents)}</td>
                <td className="py-2 text-right">{formatCents(m.outstanding_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: React.ReactNode }) {
  return (
    <div className="card p-4">
      <dt className="text-[15px] text-text-muted">{label}</dt>
      <dd className="font-display text-3xl font-extrabold tabular-nums">{value}</dd>
      <dd className="text-[15px] text-text-muted">{note}</dd>
    </div>
  );
}
