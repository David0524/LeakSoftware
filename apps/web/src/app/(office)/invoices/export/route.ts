import { INVOICE_STATUS_LABELS, centsToDollars, toCsv, type InvoiceStatus } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { listInvoices } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/** Owners: invoices or payments as CSV, for the books or a QuickBooks import (plan section 7). */
export async function GET(request: Request) {
  const office = await getOffice();
  if (!office.isOwner) return new Response("Only owners can export.", { status: 403 });
  const kind =
    new URL(request.url).searchParams.get("kind") === "payments" ? "payments" : "invoices";
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  let rows: (string | number | null)[][];

  if (kind === "invoices") {
    const supabase = await createClient();
    const list = await listInvoices(office);
    const { data } = await supabase
      .from("invoice")
      .select("id, subtotal_cents, discount_cents, tax_cents, credit_cents")
      .eq("company_id", office.company.id);
    const extra = new Map((data ?? []).map((r) => [r.id as string, r]));
    rows = [
      [
        "Invoice",
        "Job",
        "Customer",
        "Status",
        "Sent",
        "Due",
        "Paid on",
        "Subtotal",
        "Discount",
        "Tax",
        "Deposit credit",
        "Total",
        "Paid",
        "Balance",
      ],
      ...list
        .filter((i) => i.status !== "draft")
        .map((i) => {
          const e = extra.get(i.id);
          return [
            i.number,
            i.jobNumber,
            i.customer,
            INVOICE_STATUS_LABELS[i.status as InvoiceStatus],
            day(i.sent_at),
            i.due_date ?? "",
            day(i.paid_at),
            centsToDollars(e?.subtotal_cents ?? 0),
            centsToDollars(e?.discount_cents ?? 0),
            centsToDollars(e?.tax_cents ?? 0),
            centsToDollars(e?.credit_cents ?? 0),
            centsToDollars(i.total_cents),
            centsToDollars(i.amount_paid_cents),
            centsToDollars(
              i.status === "void" ? 0 : Math.max(0, i.total_cents - i.amount_paid_cents),
            ),
          ];
        }),
    ];
  } else {
    const supabase = await createClient();
    const [{ data: payments }, { data: invoices }, { data: quotes }] = await Promise.all([
      supabase
        .from("payment")
        .select(
          "created_at, paid_at, invoice_id, quote_id, amount_cents, method, status, stripe_payment_intent_id",
        )
        .eq("company_id", office.company.id)
        .is("deleted_at", null)
        .order("created_at"),
      supabase.from("invoice").select("id, number").eq("company_id", office.company.id),
      supabase.from("quote").select("id, number").eq("company_id", office.company.id),
    ]);
    const inv = new Map((invoices ?? []).map((r) => [r.id as string, r.number as number]));
    const quo = new Map((quotes ?? []).map((r) => [r.id as string, r.number as number]));
    const method: Record<string, string> = { card: "Card", ach: "Bank (ACH)", other: "Recorded" };
    rows = [
      ["Date", "For", "Number", "Amount", "Method", "Status", "Stripe payment"],
      ...(payments ?? []).map((p) => [
        day((p.paid_at as string | null) ?? (p.created_at as string)),
        p.invoice_id ? "Invoice" : "Quote deposit",
        p.invoice_id
          ? (inv.get(p.invoice_id as string) ?? "")
          : (quo.get(p.quote_id as string) ?? ""),
        centsToDollars(p.amount_cents as number),
        method[p.method as string] ?? (p.method as string),
        p.status as string,
        (p.stripe_payment_intent_id as string | null) ?? "",
      ]),
    ];
  }
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leakbook-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
