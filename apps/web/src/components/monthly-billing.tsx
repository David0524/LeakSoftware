"use client";

import { useActionState } from "react";
import { formatCents } from "@leakbook/core";
import { billMaintenanceMonth } from "@/app/actions/invoices";
import type { UnbilledMonth } from "@/lib/data";
import { Button, Card, Notice, SectionTitle } from "./ui";

const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}T12:00:00Z`),
  );

function MonthRow({ m, current }: { m: UnbilledMonth; current: boolean }) {
  const [state, action, pending] = useActionState(billMaintenanceMonth, {});
  return (
    <li className="space-y-3 py-3 first:pt-0 last:pb-0">
      <form action={action} className="flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="month" value={m.month} />
        <span>
          <span className="block font-medium">
            {monthName(m.month)}
            {current ? <span className="font-normal text-text-muted"> · so far</span> : null}
          </span>
          <span className="block text-[0.9375rem] text-text-muted">
            {m.visits === 1 ? "1 visit" : `${m.visits} visits`} ·{" "}
            {m.customers === 1 ? "1 customer" : `${m.customers} customers`} ·{" "}
            {formatCents(m.total_cents)}
          </span>
        </span>
        <Button type="submit" kind={current ? "secondary" : "primary"} disabled={pending}>
          {pending ? "Creating…" : "Create Invoices"}
        </Button>
      </form>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
    </li>
  );
}

/**
 * Owners: maintenance visits waiting to be billed, by month. Each month becomes one draft
 * invoice per customer with a line per visit; the daily run does last month on the 1st.
 */
export function MonthlyBilling({
  months,
  thisMonth,
}: {
  months: UnbilledMonth[];
  thisMonth: string;
}) {
  if (months.length === 0) return null;
  return (
    <Card className="mb-6">
      <SectionTitle>Maintenance to Bill</SectionTitle>
      <p className="mb-4 text-[0.9375rem] text-text-muted">
        One draft invoice per customer for the month, a line per visit. Review the drafts, then send
        them. Last month is drafted automatically on the 1st.
      </p>
      <ul className="divide-y divide-border">
        {months.map((m) => (
          <MonthRow key={m.month} m={m} current={m.month === thisMonth} />
        ))}
      </ul>
    </Card>
  );
}
