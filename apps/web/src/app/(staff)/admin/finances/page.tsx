import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  canceledBetween,
  formatCents,
  mrrCents,
  mrrHistory,
  servicesLabel,
  shopPriceCents,
  shopStanding,
  sortShops,
  trialsEnding,
} from "@leakbook/core";
import {
  BarChart,
  fmtDate,
  monthBar,
  Panel,
  relDays,
  StandingPill,
  Stat,
  TABLE,
  TwoStepNeeded,
} from "@/components/admin/kit";
import { PageHeader } from "@/components/ui";
import { loadMetrics, loadShops, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "Finances" };

/**
 * Sundeck Pro's money (owner, 2026-10-22: "finances"; read-only: changes are made in the
 * Stripe dashboard). Subscription revenue from each shop's package and people, and what shops
 * collected from their own customers through Stripe Connect.
 */
export default function FinancesPage() {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <Finances />
    </Suspense>
  );
}

async function Finances() {
  const gate = await staffGate("/admin/finances");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Finances" />;
  const [shops, m] = await Promise.all([loadShops(), loadMetrics()]);
  const now = new Date();
  const mrr = mrrCents(shops);
  const billed = sortShops(
    shops.filter((s) => ["paying", "past_due"].includes(shopStanding(s))),
    "price",
    true,
  );
  const history = mrrHistory(shops, m.subscription_events, now);
  const byPackage = new Map<string, { shops: number; cents: number }>();
  for (const s of billed) {
    const k = servicesLabel(s.services);
    const v = byPackage.get(k) ?? { shops: 0, cents: 0 };
    byPackage.set(k, { shops: v.shops + 1, cents: v.cents + shopPriceCents(s) });
  }
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const churnThis = canceledBetween(shops, m.subscription_events, monthStart, now);
  const churnLast = canceledBetween(shops, m.subscription_events, lastMonthStart, monthStart);
  const ending = trialsEnding(shops, now, 14);
  const pastDue = shops.filter((s) => shopStanding(s) === "past_due");
  const months = m.payments_by_month;
  const total = (p: (typeof months)[number]) => p.card_cents + p.bank_cents + p.other_cents;
  const thisMonth = months[months.length - 1]!;
  const lastMonth = months[months.length - 2]!;

  return (
    <>
      <PageHeader
        title="Finances"
        subtitle="Read-only. Refunds, plan changes and invoices are done in the Stripe dashboard."
        actions={
          <a
            href="https://dashboard.stripe.com/subscriptions"
            target="_blank"
            rel="noreferrer"
            className="min-h-11 content-center px-3 text-link"
          >
            Open Stripe ↗
          </a>
        }
      />
      <div className="grid grid-cols-4 gap-4">
        <Stat
          label="Monthly Revenue (MRR)"
          value={formatCents(mrr)}
          detail={`${billed.length} shops billed`}
        />
        <Stat label="Yearly Run Rate (ARR)" value={formatCents(mrr * 12)} />
        <Stat
          label="Average per Shop"
          value={billed.length ? formatCents(Math.round(mrr / billed.length)) : "—"}
          detail="A month, billed shops"
        />
        <Stat
          label="Canceled This Month"
          value={churnThis.length}
          detail={`${formatCents(churnThis.reduce((n, c) => n + c.cents, 0))} a month lost · ${churnLast.length} last month`}
          tone={churnThis.length ? "warning" : undefined}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-6">
        <Panel
          title="Monthly Revenue"
          className="col-span-2"
          subtitle="MRR at each month's end, at each shop's price today. History starts Oct 22, 2026."
        >
          <BarChart
            label="Monthly recurring revenue by month"
            bars={history.map((h) => monthBar(h.month, h.cents, formatCents(h.cents)))}
          />
        </Panel>
        <Panel title="By Package" subtitle="Billed shops.">
          {byPackage.size === 0 ? (
            <p className="text-text-muted">No billed shops yet.</p>
          ) : (
            <ul className="space-y-3">
              {[...byPackage].map(([name, v]) => (
                <li key={name} className="flex items-baseline justify-between gap-3">
                  <span>
                    {name}
                    <span className="block text-[0.8125rem] text-text-muted">{v.shops} shops</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatCents(v.cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Collected by Shops"
          className="col-span-2"
          subtitle="What shops' customers paid them through Sundeck Pro (cards and bank), by month."
        >
          <BarChart
            label="Payments shops collected by month"
            bars={months.map((p) => monthBar(p.month, total(p), formatCents(total(p))))}
          />
        </Panel>
        <Panel title="This Month" subtitle="Payments to shops.">
          <dl className="space-y-2 text-[0.9375rem]">
            {(
              [
                ["Cards", formatCents(thisMonth.card_cents)],
                ["Bank (ACH)", formatCents(thisMonth.bank_cents)],
                ["Other", formatCents(thisMonth.other_cents)],
                ["Refunded", formatCents(thisMonth.refunded_cents)],
                ["Failed payments", String(thisMonth.failed)],
                ["Last month", formatCents(total(lastMonth))],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-text-muted">{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Trials Ending" subtitle="In the next 14 days.">
          <ShopList
            shops={ending.map((s) => ({
              id: s.id,
              name: s.name,
              note: `Ends ${relDays(s.trial_ends_at).toLowerCase()}`,
            }))}
          />
        </Panel>
        <Panel title="Past Due" subtitle="Stripe couldn't collect.">
          <ShopList
            shops={pastDue.map((s) => ({
              id: s.id,
              name: s.name,
              note: `Since ${fmtDate(s.current_period_end)}`,
            }))}
          />
        </Panel>
        <Panel title="Canceled" subtitle="This month and last.">
          <ShopList
            shops={[...churnThis, ...churnLast].map((c) => ({
              id: c.shop.id,
              name: c.shop.name,
              note: `${fmtDate(c.at)} · ${formatCents(c.cents)}`,
            }))}
          />
        </Panel>

        <Panel
          title="Subscriptions"
          className="col-span-3"
          subtitle="Every shop Stripe bills, highest price first."
        >
          {billed.length === 0 ? (
            <p className="text-text-muted">No billed shops yet.</p>
          ) : (
            <table className={TABLE}>
              <thead className="border-b border-border text-text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Shop
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Standing
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Package
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    People
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Price
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Paid Through
                  </th>
                </tr>
              </thead>
              <tbody>
                {billed.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link
                        href={`/admin/shops/${s.id}`}
                        className="font-medium text-link hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td>
                      <StandingPill standing={shopStanding(s)} />
                    </td>
                    <td>{servicesLabel(s.services)}</td>
                    <td className="text-right tabular-nums">{s.people}</td>
                    <td className="text-right tabular-nums">{formatCents(shopPriceCents(s))}</td>
                    <td>{fmtDate(s.current_period_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}

function ShopList({ shops }: { shops: { id: string; name: string; note: string }[] }) {
  if (shops.length === 0) return <p className="text-text-muted">None.</p>;
  return (
    <ul className="divide-y divide-border/60">
      {shops.map((s, i) => (
        <li key={`${s.id}-${i}`}>
          <Link
            href={`/admin/shops/${s.id}`}
            className="flex min-h-11 items-center justify-between gap-3 py-1.5 hover:text-link"
          >
            <span className="font-medium">{s.name}</span>
            <span className="shrink-0 text-[0.9375rem] whitespace-nowrap text-text-muted">
              {s.note}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
