import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  formatCents,
  mrrCents,
  mrrHistory,
  shopStanding,
  trialsEnding,
  type Standing,
} from "@leakbook/core";
import {
  BarChart,
  fmtDate,
  monthBar,
  Panel,
  relDays,
  Stat,
  TwoStepNeeded,
  weekBar,
} from "@/components/admin/kit";
import { PageHeader } from "@/components/ui";
import { loadMetrics, loadShops, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "Overview" };

/** The business at a glance (owner, 2026-10-22: "Analytics"). */
export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const gate = await staffGate("/admin");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Overview" />;
  const [shops, m] = await Promise.all([loadShops(), loadMetrics()]);
  const now = new Date();
  const count = (s: Standing) => shops.filter((x) => shopStanding(x) === s).length;
  const mrr = mrrCents(shops);
  const history = mrrHistory(shops, m.subscription_events, now);
  const monthAgo = history[history.length - 2]?.cents ?? 0;
  const ending = trialsEnding(shops, now, 7);
  const pastDue = shops.filter((s) => shopStanding(s) === "past_due");
  const conversion = m.trials_ended_90d
    ? Math.round((m.trials_converted_90d / m.trials_ended_90d) * 100)
    : null;
  const thisMonth = m.payments_by_month[m.payments_by_month.length - 1];
  const lastMonth = m.payments_by_month[m.payments_by_month.length - 2];
  const volume = (p: typeof thisMonth) => (p ? p.card_cents + p.bank_cents + p.other_cents : 0);

  return (
    <>
      <PageHeader title="Overview" subtitle="Sundeck Pro today, across every shop." />

      <h2 className="sr-only">Shops</h2>
      <div className="grid grid-cols-6 gap-4">
        <Stat label="Shops" value={shops.length} href="/admin/shops" />
        <Stat label="Paying" value={count("paying")} href="/admin/shops?show=paying" />
        <Stat label="In Trial" value={count("trial")} href="/admin/shops?show=trial" />
        <Stat
          label="Past Due"
          value={count("past_due")}
          href="/admin/shops?show=past_due"
          tone={count("past_due") ? "fail" : undefined}
        />
        <Stat
          label="Trial Ended"
          value={count("trial_ended")}
          detail="Unpaid, read-only"
          href="/admin/shops?show=trial_ended"
          tone={count("trial_ended") ? "warning" : undefined}
        />
        <Stat label="Demo" value={count("demo")} href="/admin/shops?show=demo" />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4">
        <Stat
          label="Monthly Revenue (MRR)"
          value={formatCents(mrr)}
          detail={`${mrr >= monthAgo ? "+" : "−"}${formatCents(Math.abs(mrr - monthAgo))} since last month`}
          href="/admin/finances"
        />
        <Stat label="Yearly Run Rate (ARR)" value={formatCents(mrr * 12)} detail="MRR × 12" />
        <Stat
          label="Trial to Paid"
          value={conversion === null ? "—" : `${conversion}%`}
          detail={`${m.trials_converted_90d} of ${m.trials_ended_90d} trials that ended in 90 days`}
        />
        <Stat
          label="Collected by Shops"
          value={formatCents(volume(thisMonth))}
          detail={`This month · ${formatCents(volume(lastMonth))} last month`}
          href="/admin/finances"
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4">
        <Stat
          label="People Active"
          value={m.people_active_7d}
          detail={`Last 7 days · ${m.people_active_30d} in 30 days · ${m.people_total} accounts`}
          href="/admin/people"
        />
        <Stat
          label="Shops Working"
          value={m.shops_working_7d}
          detail="Finished a job in the last 7 days"
        />
        <Stat
          label="Never Finished a Job"
          value={m.shops_never_worked}
          detail="Signed up 3+ days ago"
          tone={m.shops_never_worked ? "warning" : undefined}
          href="/admin/shops?sort=jobs&dir=asc"
        />
        <Stat label="Leads to Call" value={m.leads_to_call} href="/admin/leads" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <Panel title="New Shops" subtitle="Shops that signed up, by week.">
          <BarChart
            label="New shops by week"
            bars={m.signups_by_week.map((w) => weekBar(w.week, w.shops))}
          />
        </Panel>
        <Panel title="Jobs Finished" subtitle="Across every shop, by week. Sample jobs left out.">
          <BarChart
            label="Jobs finished by week"
            bars={m.jobs_by_week.map((w) => weekBar(w.week, w.jobs))}
          />
        </Panel>
        <Panel
          title="Monthly Revenue"
          subtitle="MRR at each month's end, at each shop's price today. History starts Oct 22, 2026."
        >
          <BarChart
            label="Monthly recurring revenue by month"
            bars={history.map((h) => monthBar(h.month, h.cents, formatCents(h.cents)))}
          />
        </Panel>
        <Panel
          title="Needs Attention"
          subtitle="Trials ending this week and shops Stripe couldn't charge."
        >
          {ending.length + pastDue.length === 0 ? (
            <p className="text-text-muted">Nothing right now.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {pastDue.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/admin/shops/${s.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-link"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-[0.9375rem] text-status-fail">
                      Past due since {fmtDate(s.current_period_end)}
                    </span>
                  </Link>
                </li>
              ))}
              {ending.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/admin/shops/${s.id}`}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-link"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-[0.9375rem] text-text-muted">
                      Trial ends {relDays(s.trial_ends_at).toLowerCase()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
