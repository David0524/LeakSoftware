import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  CUSTOMER_TRACKER_LABELS,
  acceptanceRate,
  customersAddedNote,
  dashboardTotals,
  formatCents,
  formatCount,
  monthLabel,
  offersPool,
  onPlanShareNote,
  type Dashboard,
} from "@leakbook/core";
import { Card, Empty, Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { customerCounts, getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { Suspense, cache } from "react";
import { GettingStarted } from "@/components/getting-started";
import { ActivityItem } from "@/components/activity-rows";
import { ActivityMenu } from "@/components/activity-menu";
import { activityPage, activityUnread } from "@/lib/activity";
import {
  ACTIVITY_DASHBOARD_COUNT,
  ACTIVITY_EMPTY,
  ACTIVITY_OFFLINE,
  activityRow,
} from "@leakbook/core";

export const metadata: Metadata = { title: "Dashboard · Sundeck Pro" };

const MONTHS = 6;
// The jobs list groups these as "Waiting on Customer".
const WAITING: string[] = ["report_sent", "quote_sent", "quote_accepted", "invoiced"];

/** Owners: how the shop is doing. Jobs by status now; quotes and money over six months. */
export default async function DashboardPage() {
  const office = await getOffice();
  if (!office.isManager) redirect("/jobs");
  const [{ data, error }, counts, company] = await Promise.all([
    (await createClient()).rpc("owner_dashboard", {
      target_company: office.company.id,
      months: MONTHS,
    }),
    customerCounts(office),
    getCompany(office),
  ]);
  if (error || !data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Suspense fallback={null}>
          <GettingStarted />
        </Suspense>
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
      <PageHeader
        title="Dashboard"
        subtitle={`Last ${MONTHS} months · ${range}`}
        navAction={<LatestActivity sheet />}
        actions={<LatestActivity />}
        actionsClassName="max-sm:hidden sm:self-start"
      />
      <Suspense fallback={null}>
        <GettingStarted />
      </Suspense>

      <dl className={`grid grid-cols-2 gap-4 ${counts ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {/* Customer trackers (owner, 2026-10-22: "a tracker of total customers, and customers
            actively on a plan"), each opening Customers on its Show choice. */}
        {counts ? (
          <>
            <Stat
              label={CUSTOMER_TRACKER_LABELS.customers}
              value={formatCount(counts.all)}
              note={customersAddedNote(counts.added)}
              href="/customers"
            />
            {offersPool(company.settings) ? (
              <Stat
                label={CUSTOMER_TRACKER_LABELS.onPlan}
                value={formatCount(counts.plan)}
                note={onPlanShareNote(counts.plan, counts.all)}
                href="/customers?show=plan"
              />
            ) : null}
          </>
        ) : null}
        <Stat
          label="Collected"
          value={formatCents(totals.collected_cents)}
          note={`${MONTHS} months`}
        />
        <Stat
          label="Owed to you"
          value={formatCents(d.outstanding_cents)}
          note={
            <Link
              href="/invoices"
              className="inline-flex min-h-11 items-center text-link underline-offset-4 hover:underline"
            >
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
          <p className="mb-4 text-[0.9375rem] text-text-muted">
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
                    <span className="mb-1 text-center text-[0.8125rem] font-semibold tabular-nums">
                      {formatCents(m.collected_cents)}
                    </span>
                  ) : null}
                  <span
                    className="mx-auto w-full max-w-12 rounded-t bg-chart"
                    style={{ height: `${Math.max(h, m.collected_cents ? 2 : 0)}%` }}
                  />
                  <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 rounded bg-text px-2 py-1 text-[0.8125rem] whitespace-nowrap text-bg group-hover:block">
                    {monthLabel(m.month)}: {formatCents(m.collected_cents)}
                  </span>
                </li>
              );
            })}
          </ol>
          <ol
            className="mt-1 flex gap-2 text-center text-[0.8125rem] text-text-muted"
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
          <p className="mb-4 text-[0.9375rem] text-text-muted">Every job, as of now.</p>
          {statuses.length === 0 ? (
            <Empty>No jobs yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {statuses.map((s) => (
                <li key={s.status}>
                  <Link
                    href={`/jobs?status=${WAITING.includes(s.status) ? "follow_up" : s.status}`}
                    className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 rounded-xl py-1 hover:bg-text/[0.04] active:bg-text/[0.06]"
                  >
                    <span className="text-[0.9375rem]">{JOB_STATUS_LABELS[s.status]}</span>
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

      {/* Phones: each month as a row of an inset grouped list; wider: the table. */}
      <Grouped title="By month" className="mt-6 sm:hidden">
        {[...d.months].reverse().map((m) => (
          <Row
            key={m.month}
            label={<span className="font-semibold">{monthLabel(m.month, true)}</span>}
            detail={
              <>
                <span className="block">
                  {m.quotes_accepted} of {m.quotes_sent} quotes accepted
                  {m.quotes_sent ? ` (${acceptanceRate(m.quotes_sent, m.quotes_accepted)})` : ""}
                </span>
                <span className="block">
                  Invoiced {formatCents(m.invoiced_cents)} · still owed{" "}
                  {formatCents(m.outstanding_cents)}
                </span>
              </>
            }
            value={
              <span className="block">
                <span className="block font-semibold text-text tabular-nums">
                  {formatCents(m.collected_cents)}
                </span>
                <span className="block text-[0.8125rem]">collected</span>
              </span>
            }
          />
        ))}
      </Grouped>
      <Card className="mt-5 overflow-x-auto max-sm:hidden" aria-labelledby="months-title">
        <h2 id="months-title" className="mb-3 font-display text-xl font-bold">
          By Month
        </h2>
        <table className="w-full min-w-[640px] text-left tabular-nums">
          <thead className="border-b border-border text-[0.9375rem] text-text-muted">
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

function Stat({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string;
  note: React.ReactNode;
  /** The whole card opens this, with a chevron after the label. */
  href?: string;
}) {
  const body = (
    <>
      <dt className="flex items-center gap-1 text-[0.9375rem] text-text-muted">
        {label}
        {href ? (
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 text-text-muted">
            <path
              d="M6 3.5 10.5 8 6 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </dt>
      <dd className="font-display text-3xl font-extrabold tabular-nums">{value}</dd>
      <dd className="text-[0.9375rem] text-text-muted">{note}</dd>
    </>
  );
  if (!href) return <div className="card p-4">{body}</div>;
  return (
    <div className="card relative p-4 hover:bg-text/[0.02] active:bg-text/[0.04]">
      {body}
      <Link
        href={href}
        className="absolute inset-0 rounded-[inherit]"
        aria-label={`${label}: ${value}`}
      />
    </div>
  );
}

/** The latest few events and the dot, read once per request for both Activity buttons. */
const latestActivity = cache(async () => {
  const office = await getOffice();
  const [page, dot] = await Promise.all([
    activityPage(office, null, ACTIVITY_DASHBOARD_COUNT).catch(() => null),
    activityUnread(office),
  ]);
  return { office, page, dot };
});

/**
 * The Activity button at the right of the title row (owner, 2026-10-21: "make activity a
 * dropdown on the right side at the same level as the title text. It is currently eating up
 * space in the dashboard"): the latest few events, then See All (owner, 2026-10-20: "a
 * shortcut to it on the owner's dashboard page"), with the dot when there is something new.
 * A popover on wider screens, a sheet on phones (`sheet`, in the navigation bar).
 */
function LatestActivity({ sheet = false }: { sheet?: boolean }) {
  return (
    <Suspense fallback={<ActivityMenu unread={false} sheet={sheet} pending />}>
      <LatestActivityLoaded sheet={sheet} />
    </Suspense>
  );
}

async function LatestActivityLoaded({ sheet }: { sheet: boolean }) {
  const { office, page, dot } = await latestActivity();
  const now = new Date();
  return (
    <ActivityMenu unread={dot} sheet={sheet}>
      {!page ? (
        <Empty>{ACTIVITY_OFFLINE}</Empty>
      ) : page.events.length === 0 ? (
        <Empty>{ACTIVITY_EMPTY}</Empty>
      ) : (
        <ul className="grouped">
          {page.events.map((e) => (
            <ActivityItem key={e.id} row={activityRow(e, now, office.company.timezone)} />
          ))}
        </ul>
      )}
    </ActivityMenu>
  );
}
