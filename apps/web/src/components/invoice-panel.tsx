"use client";

import { useActionState } from "react";
import {
  INVOICE_STATUS_LABELS,
  formatCents,
  invoiceBalance,
  invoiceTotals,
  lineTotal,
} from "@leakbook/core";
import {
  addInvoiceLine,
  createInvoiceAction,
  recordPaymentAction,
  removeInvoiceLine,
  saveInvoiceDetails,
  sendInvoiceAction,
  voidInvoiceAction,
} from "@/app/actions/invoices";
import type { InvoiceRow } from "@/lib/data";
import { CopyLink, SField, STextArea, SettingsForm } from "./settings-forms";
import { Button, Checkbox, Field, Notice } from "./ui";

const METHOD: Record<string, string> = {
  card: "Card",
  ach: "Bank",
  other: "Recorded by the office",
};
const PAYMENT_STATUS: Record<string, string> = {
  pending: "processing",
  succeeded: "received",
  failed: "failed",
  refunded: "refunded",
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

function Totals({
  t,
  paid,
}: {
  t: {
    subtotal_cents: number;
    discount_cents: number;
    tax_cents: number;
    credit_cents: number;
    total_cents: number;
  };
  paid?: number;
}) {
  const row = (label: string, value: string, strong = false) => (
    <div className={strong ? "flex justify-between font-bold" : "flex justify-between"}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
  return (
    <dl className="mt-3 space-y-1 border-t border-border pt-3 text-[15px]">
      {row("Subtotal", formatCents(t.subtotal_cents))}
      {t.discount_cents > 0 ? row("Discount", `−${formatCents(t.discount_cents)}`) : null}
      {t.tax_cents > 0 ? row("Tax", formatCents(t.tax_cents)) : null}
      {t.credit_cents > 0 ? row("Deposit paid", `−${formatCents(t.credit_cents)}`) : null}
      {row("Total", formatCents(t.total_cents), true)}
      {paid !== undefined ? row("Paid", formatCents(paid)) : null}
      {paid !== undefined
        ? row(
            "Balance due",
            formatCents(invoiceBalance({ total_cents: t.total_cents, amount_paid_cents: paid })),
            true,
          )
        : null}
    </dl>
  );
}

function RemoveLine({ line, jobId }: { line: string; jobId: string }) {
  const [state, action, pending] = useActionState(removeInvoiceLine, {});
  return (
    <form action={action}>
      <input type="hidden" name="line" value={line} />
      <input type="hidden" name="job" value={jobId} />
      <Button type="submit" kind="quiet" disabled={pending} aria-label="Remove line">
        Remove
      </Button>
      {state.error ? <span className="text-status-fail">{state.error}</span> : null}
    </form>
  );
}

/** Make the job's invoice. */
export function CreateInvoice({ jobId, hint }: { jobId: string; hint: string }) {
  return (
    <SettingsForm action={createInvoiceAction} submit="Create Invoice">
      <input type="hidden" name="job" value={jobId} />
      <p className="text-text-muted">{hint}</p>
    </SettingsForm>
  );
}

/** One invoice on the office job page: draft editing and sending, then payments and void. */
export function InvoicePanel({
  invoice,
  jobId,
  origin,
  taxRateBps,
  customerEmail,
  emailReady,
  isOwner,
}: {
  invoice: InvoiceRow;
  jobId: string;
  origin: string;
  taxRateBps: number;
  customerEmail: string | null;
  emailReady: boolean;
  isOwner: boolean;
}) {
  const [sendState, sendAction, sending] = useActionState(sendInvoiceAction, {});
  const draft = invoice.status === "draft";
  const live = invoice.lines.filter((l) => l.kind === "item");
  const totals = draft ? invoiceTotals(invoice.lines, invoice.discount_cents, taxRateBps) : invoice;
  const link = sendState.link ?? (invoice.token ? `${origin}/i/${invoice.token}` : null);
  const balance = invoiceBalance(invoice);
  const hasPayments = invoice.payments.some(
    (p) => p.status === "succeeded" || p.status === "pending",
  );
  // A submit button's name/value is not passed to a formAction, so each one sets its channel.
  const sendVia = (form: FormData, channel: "email" | "link") => {
    form.set("channel", channel);
    sendAction(form);
  };

  return (
    <section
      aria-labelledby={`invoice-${invoice.id}`}
      className="rounded-lg border border-border bg-surface p-5"
      data-testid="invoice"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id={`invoice-${invoice.id}`} className="font-display text-xl font-bold">
          Invoice{invoice.number ? ` #${invoice.number}` : ""} ·{" "}
          {INVOICE_STATUS_LABELS[invoice.status]}
        </h3>
        <p className="text-xl font-semibold tabular-nums">{formatCents(totals.total_cents)}</p>
      </div>

      <ul className="mt-3 divide-y divide-border">
        {invoice.lines.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 py-2">
            <span>
              {l.description}
              {l.quantity !== 1 ? ` × ${l.quantity}` : ""}
              {l.kind === "item" && !l.taxable && taxRateBps > 0 ? (
                <span className="text-[15px] text-text-muted"> · no tax</span>
              ) : null}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{formatCents(lineTotal(l))}</span>
              {draft && l.kind === "item" ? <RemoveLine line={l.id} jobId={jobId} /> : null}
            </span>
          </li>
        ))}
      </ul>
      <Totals t={totals} paid={draft ? undefined : invoice.amount_paid_cents} />

      {draft ? (
        <div className="mt-5 space-y-6">
          <div>
            <h4 className="mb-2 font-display text-lg font-bold">Add a Line</h4>
            <SettingsForm action={addInvoiceLine} submit="Add Line">
              <input type="hidden" name="invoice" value={invoice.id} />
              <input type="hidden" name="job" value={jobId} />
              <input type="hidden" name="sort" value={String(live.length + 1)} />
              <SField label="Description" name="description" />
              <div className="grid grid-cols-2 gap-3">
                <SField label="Quantity" name="quantity" inputMode="decimal" defaultValue="1" />
                <SField label="Price ($)" name="price" inputMode="decimal" />
              </div>
              <Checkbox name="taxable" label="Taxable" defaultChecked />
            </SettingsForm>
          </div>
          <div>
            <h4 className="mb-2 font-display text-lg font-bold">Details</h4>
            <SettingsForm action={saveInvoiceDetails}>
              <input type="hidden" name="invoice" value={invoice.id} />
              <input type="hidden" name="job" value={jobId} />
              <div className="grid grid-cols-2 gap-3">
                <SField
                  label="Discount ($)"
                  name="discount"
                  inputMode="decimal"
                  defaultValue={invoice.discount_cents ? dollars(invoice.discount_cents) : ""}
                />
                <SField
                  label="Due date"
                  name="due_date"
                  type="date"
                  defaultValue={invoice.due_date ?? ""}
                  hint="Empty: due on receipt."
                />
              </div>
              <STextArea
                label="Note to the customer"
                name="notes"
                defaultValue={invoice.notes ?? ""}
              />
            </SettingsForm>
          </div>
          <form action={(f) => sendVia(f, "email")} className="space-y-3">
            <h4 className="font-display text-lg font-bold">Send</h4>
            <input type="hidden" name="invoice" value={invoice.id} />
            <input type="hidden" name="job" value={jobId} />
            <Field
              label="Customer email"
              name="to"
              type="email"
              defaultValue={customerEmail ?? ""}
              hint={
                emailReady
                  ? "Their other emails get it too."
                  : "Email isn’t set up yet. Send without email and text the link."
              }
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={sending || !emailReady}>
                {sending ? "Sending…" : "Send by Email"}
              </Button>
              <Button
                type="submit"
                kind="secondary"
                disabled={sending}
                formAction={(f) => sendVia(f, "link")}
              >
                Send Without Email
              </Button>
            </div>
            <p className="text-[15px] text-text-muted">
              Sending locks the invoice and gives you a link for the customer.
            </p>
          </form>
          <SettingsForm
            action={voidInvoiceAction}
            submit="Delete Draft"
            danger
            confirm="Delete this draft invoice?"
          >
            <input type="hidden" name="invoice" value={invoice.id} />
            <input type="hidden" name="job" value={jobId} />
          </SettingsForm>
        </div>
      ) : null}

      {sendState.error ? (
        <div className="mt-3">
          <Notice tone="error">{sendState.error}</Notice>
        </div>
      ) : null}
      {sendState.message ? (
        <div className="mt-3">
          <Notice tone="success">{sendState.message}</Notice>
        </div>
      ) : null}

      {!draft ? (
        <div className="mt-4 space-y-4">
          {invoice.payments.length ? (
            <ul className="space-y-1 text-[15px]">
              {invoice.payments.map((p) => (
                <li key={p.id}>
                  {formatCents(p.amount_cents)} · {METHOD[p.method] ?? p.method} ·{" "}
                  {PAYMENT_STATUS[p.status] ?? p.status}
                  {p.paid_at ? ` · ${new Date(p.paid_at).toLocaleDateString()}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {link && invoice.status !== "void" ? <CopyLink url={link} label="Customer link" /> : null}
          {isOwner && balance > 0 && invoice.status !== "void" ? (
            <SettingsForm action={recordPaymentAction} submit="Record Payment">
              <input type="hidden" name="invoice" value={invoice.id} />
              <input type="hidden" name="job" value={jobId} />
              <SField
                label="Amount received ($)"
                name="amount"
                inputMode="decimal"
                defaultValue={dollars(balance)}
                hint="A check, cash, or anything paid outside Tidemark."
              />
            </SettingsForm>
          ) : null}
          {isOwner && !hasPayments && invoice.status !== "void" ? (
            <SettingsForm
              action={voidInvoiceAction}
              submit="Void Invoice"
              danger
              confirm="Void this invoice? The customer's link will show it as void."
            >
              <input type="hidden" name="invoice" value={invoice.id} />
              <input type="hidden" name="job" value={jobId} />
            </SettingsForm>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
