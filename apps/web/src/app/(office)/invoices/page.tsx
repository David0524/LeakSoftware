import { offersPool } from "@leakbook/core";
import type { Metadata } from "next";
import Link from "next/link";
import {
  INVOICE_FILTERS,
  INVOICE_SORTS,
  INVOICE_STATUS_LABELS,
  filterInvoices,
  formatCents,
  invoiceBalance,
  invoiceOverdue,
  dateFormat,
} from "@leakbook/core";
import { SortMenu } from "@/components/sort-menu";
import {
  Button,
  ButtonLink,
  Empty,
  Grouped,
  PageHeader,
  RowContent,
  pillClass,
} from "@/components/ui";
import { InvoiceActions, type InvoiceRowData } from "@/components/list-actions";
import { getLine } from "@/lib/messages";
import { RowMenuButton } from "@/components/row-actions";
import { siteOrigin } from "@/lib/origin";
import type { InvoiceListRow } from "@/lib/data";
import { getOffice } from "@/lib/auth";
import { listInvoices, unbilledMaintenance, getCompany } from "@/lib/data";
import { MonthlyBilling } from "@/components/monthly-billing";

export const metadata: Metadata = { title: "Invoices · Sundeck Pro" };

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const office = await getOffice();
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const [all, unbilled, company, origin, line] = await Promise.all([
    listInvoices(office),
    unbilledMaintenance(office),
    getCompany(office),
    siteOrigin(),
    getLine(office),
  ]);
  // A row's swipe actions and menu (gestures.md section 12), from what the job page offers.
  const actions = (i: InvoiceListRow): InvoiceRowData => ({
    id: i.id,
    jobId: i.job_id,
    number: i.number,
    customer: i.customer ?? "Customer",
    status: i.status,
    balance: invoiceBalance(i),
    link: i.token ? `${origin}/i/${i.token}` : null,
    canManage: office.isManager,
    role: office.company.role,
    unpaid: i.amount_paid_cents === 0,
    total: i.total_cents,
    paid: i.amount_paid_cents,
    contact: { email: i.customerEmail, phone: i.customerPhone, texting: line?.status === "active" },
  });
  const open = all.filter((i) => i.status === "sent" || i.status === "partially_paid");
  const owed = open.reduce((sum, i) => sum + invoiceBalance(i), 0);
  const tz = office.company.timezone;
  const today = dateFormat("en-CA", { timeZone: tz }).format(new Date());
  // Filter, search, and sort (owner, 2026-10-20: "add some filtering and sorting"), kept in
  // the address so Back and a shared link keep them.
  const filter = INVOICE_FILTERS.find((f) => f.key === one("filter"))?.key ?? "all";
  const sort = INVOICE_SORTS.find((x) => x.key === one("sort"))?.key ?? "newest";
  const q = one("q").trim();
  const invoices = filterInvoices(all, { filter, sort, q, today });
  const href = (next: { filter?: string; sort?: string; q?: string }) => {
    const p = new URLSearchParams();
    const f = next.filter ?? filter;
    const so = next.sort ?? sort;
    const qq = next.q ?? q;
    if (f !== "all") p.set("filter", f);
    if (so !== "newest") p.set("sort", so);
    if (qq) p.set("q", qq);
    return `/invoices${p.size ? `?${p}` : ""}`;
  };
  const count = (key: string) =>
    key === "all" ? all.length : filterInvoices(all, { filter: key, today }).length;
  const thisMonth = `${dateFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: tz }).format(new Date())}-01`;
  const monthLabel = (month: string) =>
    dateFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${month}T12:00:00Z`),
    );
  const day = (iso: string | null) =>
    iso
      ? dateFormat("en-US", { dateStyle: "medium", timeZone: tz }).format(
          new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
        )
      : "";

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={
          open.length
            ? `${open.length} open · ${formatCents(owed)} owed`
            : "Nothing owed right now."
        }
        actions={
          office.isManager ? (
            <>
              <ButtonLink kind="secondary" href="/invoices/export?kind=invoices">
                Export Invoices
              </ButtonLink>
              <ButtonLink kind="secondary" href="/invoices/export?kind=payments">
                Export Payments
              </ButtonLink>
            </>
          ) : null
        }
      />
      {offersPool(company.settings) ? (
        <MonthlyBilling months={unbilled} thisMonth={thisMonth} />
      ) : null}
      {all.length ? (
        <>
          <nav
            aria-label="Filter invoices"
            className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 whitespace-nowrap sm:mx-0 sm:flex-wrap sm:px-0"
          >
            {INVOICE_FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href({ filter: f.key })}
                aria-current={f.key === filter ? "page" : undefined}
                className={pillClass(f.key === filter)}
              >
                {f.label} <span className="tabular-nums opacity-70">{count(f.key)}</span>
              </Link>
            ))}
          </nav>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <form action="/invoices" role="search" className="flex min-w-0 flex-1 gap-2">
              {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
              {sort !== "newest" ? <input type="hidden" name="sort" value={sort} /> : null}
              <label htmlFor="invoice-q" className="sr-only">
                Search invoices
              </label>
              <input
                id="invoice-q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Customer, invoice, or job number"
                className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-control-border bg-surface px-3 focus:outline-3 focus:outline-focus"
              />
              <Button type="submit" kind="secondary">
                Search
              </Button>
            </form>
            <SortMenu
              options={INVOICE_SORTS}
              value={sort}
              hrefFor={Object.fromEntries(INVOICE_SORTS.map((x) => [x.key, href({ sort: x.key })]))}
            />
          </div>
        </>
      ) : null}
      {all.length === 0 ? (
        <Empty>No invoices yet. Create one from a job once the work is done.</Empty>
      ) : invoices.length === 0 ? (
        <Empty>
          {q ? `No invoices match “${q}”.` : "No invoices here."}{" "}
          <Link href="/invoices" className="font-semibold text-link">
            Show All
          </Link>
        </Empty>
      ) : (
        <>
          {/* Phones: an inset grouped list, a row per invoice. */}
          <Grouped className="sm:hidden">
            {invoices.map((i) => (
              <InvoiceActions key={i.id} as="li" invoice={actions(i)}>
                <RowContent
                  href={`/jobs/${i.job_id}?tab=wrap-up`}
                  label={<span className="font-semibold">{i.customer}</span>}
                  detail={
                    <>
                      <span className="block">
                        #{i.number}
                        {i.period_month
                          ? ` · Maintenance, ${monthLabel(i.period_month)}`
                          : i.jobNumber
                            ? ` · Job #${i.jobNumber}`
                            : ""}
                      </span>
                      <span className="block">
                        {invoiceOverdue(i, today) ? "Overdue" : INVOICE_STATUS_LABELS[i.status]}
                        {i.sent_at ? ` · sent ${day(i.sent_at)}` : ""}
                        {i.status === "sent" || i.status === "partially_paid"
                          ? ` · ${formatCents(invoiceBalance(i))} due`
                          : ""}
                      </span>
                    </>
                  }
                  value={
                    <span className="font-semibold text-text tabular-nums">
                      {formatCents(i.total_cents)}
                    </span>
                  }
                />
              </InvoiceActions>
            ))}
          </Grouped>
          <div className="hidden overflow-x-auto card sm:block">
            <table className="w-full text-left">
              <thead className="border-b border-border text-[0.9375rem] text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Invoice
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Sent
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Total
                  </th>
                  <th scope="col" className="py-3 pr-12 pl-4 text-right font-medium">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <InvoiceActions
                    key={i.id}
                    as="tr"
                    invoice={actions(i)}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${i.job_id}?tab=wrap-up`}
                        className="inline-flex min-h-11 items-center font-semibold text-link underline-offset-4 hover:underline"
                      >
                        #{i.number}
                        {i.period_month
                          ? ` · Maintenance, ${monthLabel(i.period_month)}`
                          : i.jobNumber
                            ? ` · Job #${i.jobNumber}`
                            : ""}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{i.customer}</td>
                    <td className="px-4 py-3">
                      {invoiceOverdue(i, today) ? (
                        <span className="font-semibold text-status-fail">Overdue</span>
                      ) : (
                        INVOICE_STATUS_LABELS[i.status]
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{day(i.sent_at)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCents(i.total_cents)}
                    </td>
                    {/* Room kept at the end for the row's "⋯" button (gestures.md section 12). */}
                    <td className="relative py-3 pr-12 pl-4 text-right tabular-nums">
                      {i.status === "void" || i.status === "draft"
                        ? ""
                        : formatCents(invoiceBalance(i))}
                      <RowMenuButton />
                    </td>
                  </InvoiceActions>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
