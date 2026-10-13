import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatCents, lineTotal, textOnBrand } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import { PayInvoiceForm } from "@/components/invoice-actions";
import { Notice } from "@/components/ui";
import { publicClient } from "@/server/reports";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

interface TokenInvoice {
  invoice_id: string;
  number: number | null;
  job_number: number | null;
  status: "sent" | "partially_paid" | "paid" | "void";
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  credit_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  due_date: string | null;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  company: {
    name: string;
    legal_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    logo_path: string | null;
    brand_primary: string;
    timezone: string;
    tax_rate_bps: number;
  };
  property: { address: string } | null;
  customer: { name: string; email: string | null } | null;
  lines: {
    id: string;
    kind: "item" | "deposit_credit";
    description: string;
    quantity: number;
    unit_price_cents: number;
    warranty_months: number | null;
  }[];
  payments: { amount_cents: number; method: string; status: string; paid_at: string | null }[];
  can_pay: boolean;
}

/** The customer's invoice, and once paid their receipt. No sign-in, only the link. */
export default function CustomerInvoicePage({ params, searchParams }: PageProps<"/i/[token]">) {
  return (
    <main className="lb-light min-h-full flex-1 bg-paper text-text">
      <Suspense
        fallback={<p className="p-8 text-center text-neutral-500">Loading your invoice…</p>}
      >
        <InvoicePage params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const date = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
  );

const METHOD: Record<string, string> = { card: "Card", ach: "Bank account", other: "Payment" };

async function InvoicePage({ params, searchParams }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const { paid, print } = await searchParams;
  const db = publicClient();
  const { data } = await db.rpc("invoice_for_token", {
    link_token: token,
    count_view: !paid && !print,
  });
  const i = data as TokenInvoice | null;
  if (!i) notFound();

  const c = i.company;
  const tz = c.timezone;
  const logo = c.logo_path
    ? (await db.storage.from("company-assets").createSignedUrl(c.logo_path, 3600)).data
    : null;
  const onBrand = textOnBrand(c.brand_primary, tokens.color.brand.navy, tokens.color.brand.paper);
  const processing = i.payments.find((p) => p.status === "pending");
  const received = i.payments.filter((p) => p.status === "succeeded");
  const isReceipt = i.status === "paid";
  const title = `${isReceipt ? "Receipt" : "Invoice"}${i.number ? ` #${i.number}` : ""}`;

  return (
    <article className="mx-auto max-w-2xl p-4 sm:p-8">
      {!print ? (
        <div className="mb-4 flex justify-end print:hidden">
          <a
            href={`/i/${token}/pdf`}
            className="inline-flex min-h-11 items-center rounded-md border-2 border-navy px-4 font-display font-bold text-navy"
          >
            Download PDF
          </a>
        </div>
      ) : null}
      <header
        className="-mx-4 flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:mx-0 sm:rounded-lg"
        style={{ backgroundColor: c.brand_primary, color: onBrand }}
      >
        <div className="flex items-center gap-3">
          {logo?.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img
              src={logo.signedUrl}
              alt={`${c.name} logo`}
              className="max-h-14 max-w-40 rounded bg-paper p-1"
            />
          ) : null}
          <div>
            <p className="font-display text-2xl font-extrabold">{c.name}</p>
            <p className="text-[15px]">{[c.phone, c.email].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="font-display text-xl font-bold">{title}</h1>
          {i.sent_at ? <p className="text-[15px]">{date(i.sent_at, tz)}</p> : null}
        </div>
      </header>

      {i.status === "void" ? (
        <div className="mt-6">
          <Notice tone="warning">
            This invoice was canceled. Nothing is due on it. Contact {c.name}
            {c.phone ? ` at ${c.phone}` : ""} with any questions.
          </Notice>
        </div>
      ) : null}

      <dl className="mt-6 grid gap-x-6 gap-y-1 text-[15px] sm:grid-cols-2">
        {i.customer ? (
          <div>
            <dt className="text-text-muted">Billed to</dt>
            <dd className="font-medium">{i.customer.name}</dd>
          </div>
        ) : null}
        {i.property ? (
          <div>
            <dt className="text-text-muted">Property</dt>
            <dd className="font-medium">{i.property.address}</dd>
          </div>
        ) : null}
        {i.job_number ? (
          <div>
            <dt className="text-text-muted">Job</dt>
            <dd className="font-medium">#{i.job_number}</dd>
          </div>
        ) : null}
        {i.due_date && !isReceipt && i.status !== "void" ? (
          <div>
            <dt className="text-text-muted">Due</dt>
            <dd className="font-medium">
              {i.sent_at && i.due_date <= i.sent_at.slice(0, 10)
                ? "On receipt"
                : date(i.due_date, tz)}
            </dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="items" className="mt-6">
        <h2
          id="items"
          className="mb-2 border-b-2 pb-1 font-display text-2xl font-bold"
          style={{ borderColor: c.brand_primary }}
        >
          Work
        </h2>
        <ul className="divide-y divide-neutral-200">
          {i.lines
            .filter((l) => l.kind === "item")
            .map((l) => (
              <li key={l.id} className="flex justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{l.description}</p>
                  <p className="text-[15px] text-text-muted">
                    {[
                      Number(l.quantity) !== 1
                        ? `${Number(l.quantity)} × ${formatCents(l.unit_price_cents)}`
                        : null,
                      l.warranty_months ? `${l.warranty_months}-month warranty` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums">
                  {formatCents(
                    lineTotal({
                      quantity: Number(l.quantity),
                      unit_price_cents: l.unit_price_cents,
                    }),
                  )}
                </p>
              </li>
            ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t-2 border-neutral-300 pt-3 tabular-nums">
          <Row label="Subtotal" value={formatCents(i.subtotal_cents)} />
          {i.discount_cents > 0 ? (
            <Row label="Discount" value={`−${formatCents(i.discount_cents)}`} />
          ) : null}
          {i.tax_cents > 0 ? (
            <Row label={`Tax (${c.tax_rate_bps / 100}%)`} value={formatCents(i.tax_cents)} />
          ) : null}
          {i.lines
            .filter((l) => l.kind === "deposit_credit")
            .map((l) => (
              <Row
                key={l.id}
                label={l.description}
                value={`−${formatCents(-l.unit_price_cents)}`}
              />
            ))}
          <Row label="Total" value={formatCents(i.total_cents)} strong />
          {received.map((p, n) => (
            <Row
              key={n}
              label={`${METHOD[p.method] ?? "Payment"}${p.paid_at ? `, ${date(p.paid_at, tz)}` : ""}`}
              value={`−${formatCents(p.amount_cents)}`}
            />
          ))}
          {i.status !== "void" ? (
            <Row label="Balance due" value={formatCents(i.balance_cents)} strong />
          ) : null}
        </dl>
        {i.notes ? <p className="mt-4 whitespace-pre-line">{i.notes}</p> : null}
      </section>

      {i.status !== "void" ? (
        <section
          aria-labelledby="pay"
          className="mt-8 rounded-lg border border-neutral-200 p-4 sm:p-6"
        >
          <h2 id="pay" className="mb-3 font-display text-2xl font-bold">
            {isReceipt ? "Paid in Full" : "Pay This Invoice"}
          </h2>
          {isReceipt ? (
            <p>Paid{i.paid_at ? ` on ${date(i.paid_at, tz)}` : ""}. Thank you for your business!</p>
          ) : processing ? (
            <Notice>
              Your bank payment of {formatCents(processing.amount_cents)} is processing. It usually
              clears in 4 business days; there’s nothing more to do.
            </Notice>
          ) : paid ? (
            <Notice>Payment received. It can take a moment to show here; refresh shortly.</Notice>
          ) : i.can_pay && !print ? (
            <PayInvoiceForm token={token} amount={formatCents(i.balance_cents)} />
          ) : (
            <p>
              {c.name} will tell you how to pay the {formatCents(i.balance_cents)} due.
              {c.phone ? ` Questions? Call ${c.phone}.` : ""}
            </p>
          )}
        </section>
      ) : null}

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-[15px]">
        <p>
          {c.legal_name ?? c.name}
          {c.address ? ` · ${c.address}` : ""}
        </p>
        <p className="mt-1 text-text-muted">Powered by LeakBook</p>
      </footer>
    </article>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between text-xl font-bold" : "flex justify-between"}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
