"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  INVOICE_STATUS_LABELS,
  SEND_ALL_FOOTER,
  billingMonthName,
  dateFormat,
  formatCents,
  invoiceOverdue,
  linesSummary,
  notInvoicedText,
  sendAllConfirm,
  sendAllLabel,
  sendRoute,
  sendRouteLabel,
  type InvoiceStatus,
  type MonthBilling,
  type MonthBillingInvoice,
} from "@leakbook/core";
import {
  addMonthCharge,
  createMonthInvoices,
  removeMonthLine,
  sendAllAction,
  type SendAllState,
} from "@/app/actions/monthly-billing";
import { orOffline } from "@/lib/offline";
import { AddChargeRow, type ChargeItem } from "./charges";
import { Segmented } from "./segmented";
import { SettingsForm } from "./settings-forms";
import { SheetNotices } from "./settings-list";
import { Sheet, useConfirm } from "./sheet";
import { Button, Empty, Grouped, Notice, Row, buttonClass, cx } from "./ui";

// A month's Monthly Billing (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md):
// review each customer's draft, add charges, then Send All.

export function MonthBillingView({
  billing,
  items,
  texting,
  timeZone,
  openInvoice,
}: {
  billing: MonthBilling;
  items: ChargeItem[];
  texting: boolean;
  timeZone: string;
  /** A draft to open at once (from the Invoices list). */
  openInvoice: string | null;
}) {
  const drafts = billing.invoices.filter((i) => i.status === "draft");
  const sent = billing.invoices.filter((i) => i.status !== "draft");
  const [tab, setTab] = useState<"send" | "sent">(drafts.length || !sent.length ? "send" : "sent");
  const [open, setOpen] = useState<string | null>(openInvoice);
  const [state, action, pending] = useActionState<SendAllState, FormData>(
    orOffline(sendAllAction),
    {},
  );
  const [confirm, confirmDialog] = useConfirm();
  const month = billingMonthName(billing.month, false);
  const routes = drafts.map((d) => sendRoute(d, texting));
  const sendable = routes.filter((r) => r.channel !== "none").length;
  const failedReason = new Map((state.result?.failed ?? []).map((f) => [f.id, f.reason]));
  const day = (iso: string) =>
    dateFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${iso.slice(0, 10)}T12:00:00Z`),
    );
  const today = dateFormat("en-CA", { timeZone }).format(new Date());
  const notInvoiced = notInvoicedText(billing, day);
  const current = drafts.find((d) => d.id === open) ?? null;

  return (
    <SheetNotices>
      <div className="max-w-3xl space-y-6">
        {state.result ? (
          <Notice tone={state.result.failed.length ? "warning" : "success"}>
            <p>{state.result.message}</p>
            {state.result.failed.length ? (
              <ul className="mt-1 list-disc pl-5 text-[0.9375rem]">
                {state.result.failed.map((f) => (
                  <li key={f.id}>
                    {f.customer}: {f.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </Notice>
        ) : state.error ? (
          <Notice tone="error">{state.error}</Notice>
        ) : null}

        {notInvoiced ? (
          <section className="card space-y-3 p-4">
            <p>{notInvoiced}</p>
            <SettingsForm action={createMonthInvoices} submit="Create Invoices">
              <input type="hidden" name="month" value={billing.month} />
            </SettingsForm>
          </section>
        ) : null}

        <Segmented
          label="Show"
          name="month-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: "send", label: `To Send ${drafts.length}` },
            { value: "sent", label: `Sent ${sent.length}` },
          ]}
        />

        {tab === "send" ? (
          drafts.length === 0 ? (
            <Empty>
              {sent.length ? `Every ${month} invoice has been sent.` : `No ${month} invoices yet.`}
            </Empty>
          ) : (
            <>
              <Grouped title="To Send">
                {drafts.map((d, i) => {
                  const route = routes[i]!;
                  const reason = failedReason.get(d.id);
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setOpen(d.id)}
                        className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{d.customer}</span>
                          <span className="block truncate text-[0.9375rem] text-text-muted">
                            {linesSummary(d.lines)}
                          </span>
                          <span
                            className={cx(
                              "block truncate text-[0.9375rem]",
                              reason || route.channel === "none"
                                ? "text-status-warning"
                                : "text-text-muted",
                            )}
                          >
                            {reason ?? sendRouteLabel(route)}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatCents(d.total_cents)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-xl leading-none text-text-muted/70"
                        >
                          ›
                        </span>
                      </button>
                    </li>
                  );
                })}
              </Grouped>
              <form action={action}>
                <input type="hidden" name="month" value={billing.month} />
                <Button
                  type="button"
                  disabled={pending || sendable === 0}
                  className="w-full sm:w-auto"
                  onClick={async (e) => {
                    const form = e.currentTarget.form!;
                    const ask = sendAllConfirm(routes, month);
                    if (await confirm({ ...ask, confirmLabel: "Send" })) form.requestSubmit();
                  }}
                >
                  {pending ? "Sending…" : sendAllLabel(sendable)}
                </Button>
                <p className="mt-2 px-4 text-[0.8125rem] text-text-muted">{SEND_ALL_FOOTER}</p>
              </form>
            </>
          )
        ) : sent.length === 0 ? (
          <Empty>Nothing sent for {month} yet.</Empty>
        ) : (
          <Grouped title="Sent">
            {sent.map((s) => (
              <Row
                key={s.id}
                href={`/jobs/${s.job_id}?tab=wrap-up`}
                label={<span className="font-semibold">{s.customer}</span>}
                detail={`${s.number ? `#${s.number} · ` : ""}${
                  invoiceOverdue(
                    {
                      status: s.status as InvoiceStatus,
                      due_date: s.due_date,
                      sent_at: s.sent_at,
                    } as Parameters<typeof invoiceOverdue>[0],
                    today,
                  )
                    ? "Overdue"
                    : (INVOICE_STATUS_LABELS[s.status as InvoiceStatus] ?? s.status)
                }${s.sent_at ? ` · sent ${day(s.sent_at)}` : ""}`}
                value={<span className="tabular-nums">{formatCents(s.total_cents)}</span>}
              />
            ))}
          </Grouped>
        )}
      </div>
      <Sheet open={!!current} onClose={() => setOpen(null)} title={current?.customer ?? ""}>
        {current ? <CustomerSheet invoice={current} month={billing.month} items={items} /> : null}
      </Sheet>
      {confirmDialog}
    </SheetNotices>
  );
}

/** A customer's draft: its lines (each with Remove), Add Charge, and Open Invoice. */
function CustomerSheet({
  invoice,
  month,
  items,
}: {
  invoice: MonthBillingInvoice;
  month: string;
  items: ChargeItem[];
}) {
  return (
    <div className="space-y-4">
      <p className="text-text-muted">
        {billingMonthName(month, false)} · {formatCents(invoice.total_cents)}
      </p>
      <Grouped title="Lines">
        {invoice.lines.map((l) => (
          <li key={l.id} className="flex min-h-11 items-center gap-3 py-1.5 pr-2 pl-4">
            <span className="min-w-0 flex-1">
              <span className="block">{l.description}</span>
              {Number(l.quantity) !== 1 ? (
                <span className="block text-[0.9375rem] text-text-muted">
                  {Number(l.quantity)} {l.unit ?? ""} × {formatCents(l.unit_price_cents)}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-text-muted tabular-nums">
              {formatCents(
                Math.round((Math.round(Number(l.quantity) * 100) * l.unit_price_cents) / 100),
              )}
            </span>
            {l.kind === "item" ? (
              <SettingsForm
                action={removeMonthLine}
                submit="Remove"
                inline
                confirm={`Remove “${l.description}”?`}
              >
                <input type="hidden" name="line" value={l.id} />
                <input type="hidden" name="month" value={month} />
              </SettingsForm>
            ) : null}
          </li>
        ))}
        <AddChargeRow
          items={items}
          action={addMonthCharge}
          hidden={{ invoice: invoice.id, month }}
        />
      </Grouped>
      <Link
        href={`/jobs/${invoice.job_id}?tab=wrap-up`}
        className={buttonClass("secondary", "w-full")}
      >
        Open Invoice
      </Link>
    </div>
  );
}
