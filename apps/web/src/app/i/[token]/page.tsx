import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  cardFeeChoice,
  formatCents,
  formatQuantity,
  monthName,
  latestReceiptPayment,
  lineTotal,
  paymentMethodLabel,
  textOnBrand,
  dateFormat,
} from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import { PayInvoiceForm } from "@/components/invoice-actions";
import { cx } from "@/components/ui";
import { publicClient } from "@/server/reports";
import { cardFeeFor, paymentsConfigured } from "@/server/stripe";
import { ContactLine } from "@/components/contact-line";
import {
  Banner,
  DOC_PAGE,
  PHONE_CARD,
  PHONE_GROUP,
  PHONE_GROUP_TITLE,
  PHONE_LABEL,
  PHONE_ROW,
  PHONE_VALUE,
  actionCardClass,
} from "@/components/doc-ui";
import { PdfLink } from "@/components/pdf-link";
import { DocSkeleton } from "@/components/page-skeleton";
import { documentMetadata, fromPreviewFetcher } from "@/server/link-preview";

/** The tab says "Invoice"; a shared link previews the invoice itself (server/link-preview). */
export async function generateMetadata({ params }: PageProps<"/i/[token]">): Promise<Metadata> {
  return documentMetadata("invoice", (await params).token, "Invoice");
}

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
    /** A chemical line's unit, "gal" (owner, 2026-10-24). */
    unit?: string | null;
  }[];
  payments: {
    id: string;
    amount_cents: number;
    method: string;
    check_number: string | null;
    status: string;
    paid_at: string | null;
  }[];
  can_pay: boolean;
}

/** The customer's invoice, and once paid their receipt. No sign-in, only the link. */
export default function CustomerInvoicePage({ params, searchParams }: PageProps<"/i/[token]">) {
  return (
    <main className={DOC_PAGE}>
      <Suspense fallback={<DocSkeleton label="your invoice" />}>
        <InvoicePage params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const date = (iso: string, timeZone: string) =>
  dateFormat("en-US", { dateStyle: "long", timeZone }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
  );

async function InvoicePage({ params, searchParams }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const { paid, print } = await searchParams;
  const db = publicClient();
  // A link-preview fetcher (Messages, Mail, Slack) reading the page isn't the customer opening it.
  const { data } = await db.rpc("invoice_for_token", {
    link_token: token,
    count_view: !paid && !print && !(await fromPreviewFetcher()),
  });
  const i = data as TokenInvoice | null;
  if (!i) notFound();
  // A monthly invoice sent with the month's service report links it (owner, 2026-10-24).
  const { data: monthReport } = await db.rpc("month_report_link", { link_token: token });
  const report = monthReport as { token: string; month: string; visits: number } | null;
  // The shop passes the card fee on: card or bank, chosen before paying (owner, 2026-10-19).
  const feeBps = paymentsConfigured() && i.can_pay ? await cardFeeFor("invoice", i.invoice_id) : 0;

  const c = i.company;
  const tz = c.timezone;
  const logo = c.logo_path
    ? (await db.storage.from("company-assets").createSignedUrl(c.logo_path, 3600)).data
    : null;
  const onBrand = textOnBrand(c.brand_primary, tokens.color.brand.navy, tokens.color.brand.paper);
  const processing = i.payments.find((p) => p.status === "pending");
  const received = i.payments.filter((p) => p.status === "succeeded");
  const isReceipt = i.status === "paid";
  // Part paid (cash or a check, say): the page is that payment's receipt too (2026-10-22).
  const lastPaid = i.status === "partially_paid" ? latestReceiptPayment(received) : null;
  const isPrint = !!print;
  const title = `${isReceipt ? "Receipt" : "Invoice"}${i.number ? ` #${i.number}` : ""}`;

  return (
    <article className="mx-auto max-w-2xl p-4 sm:p-8">
      <header
        className="-mx-4 flex flex-wrap items-center justify-between gap-4 px-5 py-5 max-sm:-mt-4 sm:mx-0 sm:rounded-lg"
        style={{ backgroundColor: c.brand_primary, color: onBrand }}
      >
        {/* Phones: the PDF link sits at the end of the shop's row; wider, next to the title. */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto sm:flex-nowrap">
          {logo?.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img
              src={logo.signedUrl}
              alt={`${c.name} logo`}
              className="max-h-14 max-w-48 rounded bg-paper p-1 max-sm:max-w-40"
            />
          ) : null}
          <div className={cx("min-w-0", logo?.signedUrl && "max-sm:order-last max-sm:basis-full")}>
            <p className="font-display text-2xl font-extrabold">{c.name}</p>
            <p className="text-[0.9375rem]">
              <ContactLine phone={c.phone} email={c.email} />
            </p>
          </div>
          {!print ? (
            <PdfLink href={`/i/${token}/pdf`} className="ml-auto inline-flex sm:hidden" />
          ) : null}
        </div>
        <div className="flex items-center gap-4 sm:ml-auto">
          {/* Left-aligned when it wraps under the shop on phones; right-aligned beside it. */}
          <div className="text-left sm:text-right">
            <h1 className="font-display text-xl font-bold">{title}</h1>
            {i.sent_at ? <p className="text-[0.9375rem]">{date(i.sent_at, tz)}</p> : null}
          </div>
          {!print ? <PdfLink href={`/i/${token}/pdf`} className="hidden sm:inline-flex" /> : null}
        </div>
      </header>

      {i.status === "void" ? (
        <div className="mt-6">
          <Banner tone="warning" print={isPrint}>
            This invoice was canceled. Nothing is due on it. Contact {c.name}
            {c.phone ? ` at ${c.phone}` : ""} with any questions.
          </Banner>
        </div>
      ) : null}

      {/* Phones: an iOS grouped list of label and value rows; wider and printed, two columns. */}
      <dl
        className={cx(
          "mt-6 grid grid-cols-2 gap-x-6 gap-y-1 text-[0.9375rem] max-sm:block max-sm:text-[1.0625rem]",
          PHONE_GROUP,
        )}
      >
        {i.customer ? (
          <div className={PHONE_ROW}>
            <dt className={cx("text-text-muted", PHONE_LABEL)}>Billed to</dt>
            <dd className={cx("font-medium", PHONE_VALUE)}>{i.customer.name}</dd>
          </div>
        ) : null}
        {i.property ? (
          <div className={PHONE_ROW}>
            <dt className={cx("text-text-muted", PHONE_LABEL)}>Property</dt>
            <dd className={cx("font-medium", PHONE_VALUE)}>{i.property.address}</dd>
          </div>
        ) : null}
        {i.job_number ? (
          <div className={PHONE_ROW}>
            <dt className={cx("text-text-muted", PHONE_LABEL)}>Job</dt>
            <dd className={cx("font-medium", PHONE_VALUE)}>#{i.job_number}</dd>
          </div>
        ) : null}
        {i.due_date && !isReceipt && i.status !== "void" ? (
          <div className={PHONE_ROW}>
            <dt className={cx("text-text-muted", PHONE_LABEL)}>Due</dt>
            <dd className={cx("font-medium", PHONE_VALUE)}>
              {i.sent_at && i.due_date <= i.sent_at.slice(0, 10)
                ? "On receipt"
                : date(i.due_date, tz)}
            </dd>
          </div>
        ) : null}
      </dl>

      {report && !print ? (
        <Link
          href={`/r/${report.token}`}
          className="mt-4 flex min-h-14 items-center gap-3 rounded-xl bg-surface px-4 py-3 hover:bg-text/[0.03] sm:bg-bg"
          data-testid="month-report-link"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-link/10 text-link"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M9 13h6M9 17h6" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              {monthName(report.month, tz)} Service Report
            </span>
            <span className="block text-[0.9375rem] text-text-muted">
              {report.visits} {report.visits === 1 ? "visit" : "visits"}: water tests, chemicals
              added, photos
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-xl leading-none text-text-muted/70">
            ›
          </span>
        </Link>
      ) : null}

      <section aria-labelledby="items" className="mt-6">
        <h2
          id="items"
          className={cx("mb-2 border-b-2 pb-1 font-display text-2xl font-bold", PHONE_GROUP_TITLE)}
          style={{ borderColor: c.brand_primary }}
        >
          Work
        </h2>
        <ul className={cx("divide-y divide-neutral-200 max-sm:divide-separator", PHONE_GROUP)}>
          {i.lines
            .filter((l) => l.kind === "item")
            .map((l) => (
              <li key={l.id} className="flex justify-between gap-4 py-3 max-sm:pr-4">
                <div>
                  <p className="font-medium">{l.description}</p>
                  <p className="text-[0.9375rem] text-text-muted">
                    {[
                      l.unit
                        ? `${formatQuantity(Number(l.quantity), l.unit)} × ${formatCents(l.unit_price_cents)}`
                        : Number(l.quantity) !== 1
                          ? `${Number(l.quantity)} × ${formatCents(l.unit_price_cents)}`
                          : null,
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
        <dl
          className={cx(
            "mt-2 space-y-1 border-t-2 border-neutral-300 pt-3 tabular-nums",
            "max-sm:mt-4 max-sm:space-y-0 max-sm:border-t-0 max-sm:pt-0",
            PHONE_GROUP,
          )}
        >
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
              label={`${paymentMethodLabel(p.method, p.check_number)}${p.paid_at ? `, ${date(p.paid_at, tz)}` : ""}`}
              value={`−${formatCents(p.amount_cents)}`}
            />
          ))}
          {i.status !== "void" ? (
            <Row label="Balance due" value={formatCents(i.balance_cents)} strong />
          ) : null}
        </dl>
        {i.notes ? <p className={cx("mt-4 whitespace-pre-line", PHONE_CARD)}>{i.notes}</p> : null}
      </section>

      {i.status !== "void" ? (
        <section aria-labelledby="pay" className={actionCardClass(isPrint)}>
          <h2 id="pay" className="mb-3 font-display text-2xl font-bold">
            {isReceipt ? "Paid in Full" : "Pay This Invoice"}
          </h2>
          {lastPaid ? (
            <p className="mb-4" data-testid="payment-received">
              Thank you for your payment of {formatCents(lastPaid.amount_cents)} (
              {paymentMethodLabel(lastPaid.method, lastPaid.check_number)}
              {lastPaid.paid_at ? `, ${date(lastPaid.paid_at, tz)}` : ""}). The balance due is{" "}
              {formatCents(i.balance_cents)}.
            </p>
          ) : null}
          {isReceipt ? (
            <p>Paid{i.paid_at ? ` on ${date(i.paid_at, tz)}` : ""}. Thank you for your business!</p>
          ) : processing ? (
            <Banner print={isPrint}>
              Your bank payment of {formatCents(processing.amount_cents)} is processing. It usually
              clears in 4 business days; there’s nothing more to do.
            </Banner>
          ) : paid ? (
            <Banner print={isPrint}>
              Payment received. It can take a moment to show here; refresh shortly.
            </Banner>
          ) : (i.can_pay || !paymentsConfigured()) && !print ? (
            <PayInvoiceForm
              token={token}
              amount={formatCents(i.balance_cents)}
              demo={!paymentsConfigured()}
              cardFee={feeBps ? cardFeeChoice(i.balance_cents, feeBps) : null}
            />
          ) : (
            <p>
              {c.name} will tell you how to pay the {formatCents(i.balance_cents)} due.
              {c.phone ? ` Questions? Call ${c.phone}.` : ""}
            </p>
          )}
        </section>
      ) : null}

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-[0.9375rem] max-sm:border-t-0 max-sm:px-4 max-sm:pt-0">
        <p>
          {c.legal_name ?? c.name}
          {c.address ? ` · ${c.address}` : ""}
        </p>
        <p className="mt-1 text-text-muted">Powered by Sundeck Pro</p>
      </footer>
    </article>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between", strong && "text-xl font-bold", PHONE_ROW)}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
