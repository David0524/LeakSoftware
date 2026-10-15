import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatCents, lineTotal, textOnBrand, dateFormat } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import { AcceptForm, PayDepositForm } from "@/components/quote-actions";
import { cx } from "@/components/ui";
import { publicClient } from "@/server/reports";
import { paymentsConfigured } from "@/server/stripe";
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

export const metadata: Metadata = { title: "Repair Quote", robots: { index: false } };

interface TokenQuote {
  quote_id: string;
  number: number | null;
  status: "sent" | "accepted" | "declined" | "expired";
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number;
  valid_until: string | null;
  notes: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_by_name: string | null;
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
    description: string;
    quantity: number;
    unit_price_cents: number;
    taxable: boolean;
    warranty_months: number | null;
    finding: string | null;
  }[];
  payments: { amount_cents: number; method: string; status: string; paid_at: string | null }[];
  can_pay: boolean;
}

/** The customer's quote: no sign-in, only the unguessable link. Phone-sized first. */
export default function CustomerQuotePage({ params, searchParams }: PageProps<"/q/[token]">) {
  return (
    <main className={DOC_PAGE}>
      <Suspense fallback={<p className="p-8 text-center text-neutral-500">Loading your quote…</p>}>
        <QuotePage params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const date = (iso: string, timeZone: string, withTime = false) =>
  dateFormat("en-US", {
    dateStyle: "long",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone,
  }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

async function QuotePage({ params, searchParams }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const { paid, print } = await searchParams;
  const isPrint = !!print;
  const db = publicClient();
  const { data } = await db.rpc("quote_for_token", { link_token: token, count_view: !paid });
  const q = data as TokenQuote | null;
  if (!q) notFound();

  const c = q.company;
  const tz = c.timezone;
  const logo = c.logo_path
    ? (await db.storage.from("company-assets").createSignedUrl(c.logo_path, 3600)).data
    : null;
  const onBrand = textOnBrand(c.brand_primary, tokens.color.brand.navy, tokens.color.brand.paper);
  const live = q.payments.filter((p) => p.status === "succeeded" || p.status === "pending");
  const paidDeposit = live.find((p) => p.status === "succeeded");
  const processing = live.find((p) => p.status === "pending");
  const total = formatCents(q.total_cents);

  return (
    <article className="mx-auto max-w-2xl p-4 sm:p-8">
      <header
        className="-mx-4 -mt-4 flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:mx-0 sm:mt-0 sm:rounded-lg"
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
            <p className="text-[0.9375rem]">
              <ContactLine phone={c.phone} email={c.email} />
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <h1 className="font-display text-xl font-bold">
            Repair Quote{q.number ? ` #${q.number}` : ""}
          </h1>
          {q.sent_at ? <p className="text-[0.9375rem]">{date(q.sent_at, tz)}</p> : null}
        </div>
      </header>

      {/* Phones: an iOS grouped list of label and value rows; wider and printed, two columns. */}
      <dl
        className={cx(
          "mt-6 grid grid-cols-2 gap-x-6 gap-y-1 text-[0.9375rem] max-sm:block max-sm:text-[1.0625rem]",
          PHONE_GROUP,
        )}
      >
        {q.customer ? (
          <div className={PHONE_ROW}>
            <dt className={cx("text-text-muted", PHONE_LABEL)}>Prepared for</dt>
            <dd className={cx("font-medium", PHONE_VALUE)}>{q.customer.name}</dd>
          </div>
        ) : null}
        {q.property ? (
          <div className={PHONE_ROW}>
            <dt className={cx("text-text-muted", PHONE_LABEL)}>Property</dt>
            <dd className={cx("font-medium", PHONE_VALUE)}>{q.property.address}</dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="work" className="mt-6">
        <h2
          id="work"
          className={cx("mb-2 border-b-2 pb-1 font-display text-2xl font-bold", PHONE_GROUP_TITLE)}
          style={{ borderColor: c.brand_primary }}
        >
          Work
        </h2>
        <ul className={cx("divide-y divide-neutral-200 max-sm:divide-separator", PHONE_GROUP)}>
          {q.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-4 py-3 max-sm:pr-4">
              <div>
                <p className="font-medium">{l.description}</p>
                <p className="text-[0.9375rem] text-text-muted">
                  {[
                    l.quantity !== 1
                      ? `${Number(l.quantity)} × ${formatCents(l.unit_price_cents)}`
                      : null,
                    l.finding ? `For: ${l.finding}` : null,
                    l.warranty_months ? `${l.warranty_months}-month warranty` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <p className="shrink-0 font-medium tabular-nums">
                {formatCents(
                  lineTotal({ quantity: Number(l.quantity), unit_price_cents: l.unit_price_cents }),
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
          <Row label="Subtotal" value={formatCents(q.subtotal_cents)} />
          {q.discount_cents > 0 ? (
            <Row label="Discount" value={`−${formatCents(q.discount_cents)}`} />
          ) : null}
          {q.tax_cents > 0 ? (
            <Row label={`Tax (${c.tax_rate_bps / 100}%)`} value={formatCents(q.tax_cents)} />
          ) : null}
          <Row label="Total" value={total} strong />
          {q.deposit_cents > 0 ? (
            <Row label="Deposit due when you accept" value={formatCents(q.deposit_cents)} />
          ) : null}
        </dl>
        {q.notes ? <p className={cx("mt-4 whitespace-pre-line", PHONE_CARD)}>{q.notes}</p> : null}
      </section>

      <section aria-labelledby="next" className={actionCardClass(isPrint)}>
        <h2 id="next" className="mb-3 font-display text-2xl font-bold">
          {q.status === "accepted"
            ? "Accepted"
            : q.status === "expired"
              ? "Expired"
              : "Accept This Quote"}
        </h2>
        {q.status === "sent" ? (
          <>
            {q.valid_until ? (
              <p className="mb-4 text-[0.9375rem] text-text-muted">
                Good through {date(q.valid_until, tz)}.
              </p>
            ) : null}
            <AcceptForm
              token={token}
              shop={c.name}
              total={total}
              defaultName={q.customer?.name ?? ""}
              print={isPrint}
            />
          </>
        ) : null}
        {q.status === "expired" ? (
          <p>
            This quote expired on {date(q.valid_until!, tz)}. Contact {c.name}
            {c.phone ? ` at ${c.phone}` : ""} for an updated quote.
          </p>
        ) : null}
        {q.status === "declined" ? <p>This quote was declined.</p> : null}
        {q.status === "accepted" ? (
          <div className="space-y-4">
            <p>
              Accepted by {q.accepted_by_name}
              {q.accepted_at ? ` on ${date(q.accepted_at, tz, true)}` : ""}. {c.name} will contact
              you to schedule the repair.
            </p>
            {paidDeposit ? (
              <Banner tone="success" print={isPrint}>
                Deposit of {formatCents(paidDeposit.amount_cents)} received. Thank you!
              </Banner>
            ) : processing ? (
              <Banner print={isPrint}>
                Your bank payment of {formatCents(processing.amount_cents)} is processing. It
                usually clears in 4 business days; there’s nothing more to do.
              </Banner>
            ) : paid ? (
              <Banner print={isPrint}>
                Payment received. It can take a moment to show here; refresh shortly.
              </Banner>
            ) : q.deposit_cents > 0 && (q.can_pay || !paymentsConfigured()) ? (
              <PayDepositForm
                token={token}
                amount={formatCents(q.deposit_cents)}
                demo={!paymentsConfigured()}
                print={isPrint}
              />
            ) : q.deposit_cents > 0 ? (
              <p>
                {c.name} will tell you how to pay the {formatCents(q.deposit_cents)} deposit.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-[0.9375rem] max-sm:border-t-0 max-sm:px-4 max-sm:pt-0">
        <p>
          {c.legal_name ?? c.name}
          {c.address ? ` · ${c.address}` : ""}
        </p>
        <p className="mt-1 text-text-muted">Powered by Tidemark</p>
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
