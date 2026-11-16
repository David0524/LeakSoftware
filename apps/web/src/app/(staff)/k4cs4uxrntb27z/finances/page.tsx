import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Suspense } from "react";
import {
  cardFeesCents,
  canceledBetween,
  COST_CATEGORY_LABELS,
  formatCents,
  isRunning,
  monthlyCostsCents,
  monthlyShareCents,
  PAYER_LABELS,
  PAYERS,
  paidBy,
  REPEAT_LABELS,
  sortExpenses,
  sortServices,
  type CompanyCost,
  type Payer,
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
  fmtDay,
  monthBar,
  Panel,
  relDays,
  StandingPill,
  Stat,
  TABLE,
  todayDay,
  TwoStepNeeded,
} from "@/components/admin/kit";
import { CostButton } from "@/components/admin/costs";
import { SegmentedLinks } from "@/components/gestures";
import { Empty, PageHeader, pillClass, SEGMENT_TRACK } from "@/components/ui";
import { loadCosts, loadMetrics, loadShops, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "Finances" };

/**
 * Sundeck Pro's money. Company (owner, 2026-11-16: "all of our finances … keep track of which
 * one of the owners paid for it, David, Cole, or the company"): revenue less what we pay for,
 * the services and expenses, and who paid. Subscriptions (owner, 2026-10-22; read-only, changed
 * in the Stripe dashboard): revenue from each shop's package and people, and what shops
 * collected from their own customers through Stripe Connect. Our own shops are left out.
 */
export default function FinancesPage({ searchParams }: PageProps<"/k4cs4uxrntb27z/finances">) {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <Finances searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Finances({
  searchParams,
}: {
  searchParams: PageProps<"/k4cs4uxrntb27z/finances">["searchParams"];
}) {
  const gate = await staffGate("/k4cs4uxrntb27z/finances");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Finances" />;
  const params = await searchParams;
  const view = one(params.view) === "subscriptions" ? "subscriptions" : "company";
  const payer = (PAYERS as readonly string[]).includes(one(params.paid))
    ? (one(params.paid) as Payer)
    : null;
  const tabs = (
    <SegmentedLinks
      label="View"
      className={`${SEGMENT_TRACK} mb-6 w-fit`}
      items={[
        { href: "/k4cs4uxrntb27z/finances", label: "Company", active: view === "company" },
        {
          href: "/k4cs4uxrntb27z/finances?view=subscriptions",
          label: "Subscriptions",
          active: view === "subscriptions",
        },
      ]}
    />
  );
  if (view === "company") return <Company tabs={tabs} payer={payer} />;
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
        subtitle="Read-only. Refunds, plan changes and invoices are done in the Stripe dashboard. Our own shops aren’t counted."
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
      {tabs}
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
                        href={`/k4cs4uxrntb27z/shops/${s.id}`}
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
            href={`/k4cs4uxrntb27z/shops/${s.id}`}
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

/** Finances › Company: revenue less what we pay for, the services and expenses, and who paid. */
async function Company({ tabs, payer }: { tabs: ReactNode; payer: Payer | null }) {
  const [shops, costs] = await Promise.all([loadShops(), loadCosts()]);
  const now = new Date();
  const today = todayDay(now);
  const year = today.slice(0, 4);
  const yearStart = `${year}-01-01`;
  const billed = shops.filter((s) => ["paying", "past_due"].includes(shopStanding(s)));
  const mrr = mrrCents(shops);
  const fees = cardFeesCents(billed.map(shopPriceCents));
  const services = sortServices(costs, today);
  const running = monthlyCostsCents(costs, today);
  const perMonth = running + fees;
  const unpriced = services.filter((c) => isRunning(c, today) && c.amount_cents === null);
  const thisYear = paidBy(costs, yearStart, today);
  const allTime = paidBy(costs, "2000-01-01", today);
  const spentThisYear = PAYERS.reduce((n, p) => n + thisYear[p], 0);
  const expenses = sortExpenses(costs).filter((c) => !payer || c.paid_by === payer);
  const profit = mrr - perMonth;

  return (
    <>
      <PageHeader
        title="Finances"
        subtitle="What Sundeck Pro earns and spends, and who paid. Our own shops aren’t counted."
        actions={<CostButton label="Add Expense" kind="primary" />}
      />
      {tabs}
      <div className="grid grid-cols-4 gap-4">
        <Stat
          label="Revenue a Month"
          value={formatCents(mrr)}
          detail={`${billed.length} ${billed.length === 1 ? "shop" : "shops"} billed`}
        />
        <Stat
          label="Costs a Month"
          value={formatCents(perMonth)}
          detail={
            unpriced.length
              ? `${unpriced.length} ${unpriced.length === 1 ? "service needs" : "services need"} a price`
              : "Services and card fees"
          }
          tone={unpriced.length ? "warning" : undefined}
        />
        <Stat
          label="Profit a Month"
          value={formatCents(profit)}
          detail="Revenue less costs"
          tone={profit < 0 ? "fail" : undefined}
        />
        <Stat
          label={`Spent in ${year}`}
          value={formatCents(spentThisYear)}
          detail="Services and expenses"
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-6">
        <Panel
          title="Services We Pay For"
          className="col-span-2"
          subtitle="Charged every month or year. Yearly ones count a twelfth a month."
          actions={<CostButton label="Add Service" repeats="monthly" />}
        >
          <table className={TABLE}>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Service
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  How Often
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Amount
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  A Month
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Paid By
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((c) => {
                const on = isRunning(c, today);
                return (
                  <tr
                    key={c.id}
                    data-testid="service-row"
                    className={on ? undefined : "opacity-60"}
                  >
                    <td>
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-[0.8125rem] text-text-muted">
                        {on
                          ? (c.note ?? COST_CATEGORY_LABELS[c.category])
                          : c.ended_on && c.ended_on < today
                            ? `Canceled ${fmtDay(c.ended_on)}`
                            : `Starts ${fmtDay(c.spent_on)}`}
                      </span>
                    </td>
                    <td>{REPEAT_LABELS[c.repeats]}</td>
                    <td className="text-right tabular-nums">
                      {c.amount_cents === null ? (
                        <span className="text-status-warning">Needs a price</span>
                      ) : (
                        formatCents(c.amount_cents)
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {on && c.amount_cents !== null ? formatCents(monthlyShareCents(c)) : "—"}
                    </td>
                    <td>{PAYER_LABELS[c.paid_by]}</td>
                    <td className="text-right">
                      <CostButton cost={c} label="Edit" kind="plain" />
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <span className="font-medium">Stripe card fees</span>
                  <span className="block text-[0.8125rem] text-text-muted">
                    Estimated: 2.9% + 30¢ on each shop’s monthly charge
                  </span>
                </td>
                <td>Monthly</td>
                <td className="text-right tabular-nums">—</td>
                <td className="text-right tabular-nums">{formatCents(fees)}</td>
                <td>Company</td>
                <td />
              </tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Who Paid" subtitle="Services and expenses, by who paid for them.">
          <table className={TABLE}>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  <span className="sr-only">Who</span>
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {year}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  All Time
                </th>
              </tr>
            </thead>
            <tbody>
              {PAYERS.map((p) => (
                <tr key={p} data-testid="payer-row">
                  <th scope="row" className="px-3 py-2.5 text-left font-medium">
                    {PAYER_LABELS[p]}
                  </th>
                  <td className="text-right tabular-nums">{formatCents(thisYear[p])}</td>
                  <td className="text-right tabular-nums">{formatCents(allTime[p])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[0.8125rem] text-text-muted">
            A service counts each time it’s charged, from its first charge. Services without a price
            count nothing yet.
          </p>
        </Panel>

        <Panel
          title="Expenses"
          className="col-span-3"
          subtitle="One-time costs, newest first."
          actions={<CostButton label="Add Expense" />}
        >
          <nav aria-label="Paid by" className="mb-4 flex flex-wrap gap-2">
            {[null, ...PAYERS].map((p) => (
              <Link
                key={p ?? "all"}
                href={p ? `/k4cs4uxrntb27z/finances?paid=${p}` : "/k4cs4uxrntb27z/finances"}
                aria-current={p === payer ? "page" : undefined}
                className={pillClass(p === payer)}
              >
                {p ? PAYER_LABELS[p] : "Everyone"}
              </Link>
            ))}
          </nav>
          {expenses.length === 0 ? (
            <Empty>
              {payer ? `No expenses paid by ${PAYER_LABELS[payer]}.` : "No expenses yet."}
            </Empty>
          ) : (
            <ExpenseTable expenses={expenses} />
          )}
        </Panel>
      </div>
    </>
  );
}

function ExpenseTable({ expenses }: { expenses: CompanyCost[] }) {
  return (
    <table className={TABLE}>
      <thead className="border-b border-border text-text-muted">
        <tr>
          <th scope="col" className="px-3 py-2 font-semibold">
            Date
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            What
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Category
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Paid By
          </th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">
            Amount
          </th>
          <th scope="col" className="px-3 py-2">
            <span className="sr-only">Edit</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {expenses.map((c) => (
          <tr key={c.id} data-testid="expense-row">
            <td className="whitespace-nowrap">{fmtDay(c.spent_on)}</td>
            <td>
              <span className="font-medium">{c.name}</span>
              {c.note ? (
                <span className="block text-[0.8125rem] text-text-muted">{c.note}</span>
              ) : null}
            </td>
            <td>{COST_CATEGORY_LABELS[c.category]}</td>
            <td>{PAYER_LABELS[c.paid_by]}</td>
            <td className="text-right tabular-nums">{formatCents(c.amount_cents ?? 0)}</td>
            <td className="text-right">
              <CostButton cost={c} label="Edit" kind="plain" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
