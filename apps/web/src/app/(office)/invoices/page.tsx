import { offersPool } from "@leakbook/core";
import type { Metadata } from "next";
import Link from "next/link";
import { INVOICE_STATUS_LABELS, formatCents, invoiceBalance, dateFormat } from "@leakbook/core";
import { ButtonLink, Empty, Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listInvoices, unbilledMaintenance, getCompany } from "@/lib/data";
import { MonthlyBilling } from "@/components/monthly-billing";
import { Suspense } from "react";
import { ScreenTip } from "@/components/screen-tip";

export const metadata: Metadata = { title: "Invoices · Sundeck Pro" };

export default async function InvoicesPage() {
  const office = await getOffice();
  const [invoices, unbilled, company] = await Promise.all([
    listInvoices(office),
    unbilledMaintenance(office),
    getCompany(office),
  ]);
  const open = invoices.filter((i) => i.status === "sent" || i.status === "partially_paid");
  const owed = open.reduce((sum, i) => sum + invoiceBalance(i), 0);
  const tz = office.company.timezone;
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
      <Suspense fallback={null}>
        <ScreenTip screen="invoices" />
      </Suspense>
      {offersPool(company.settings) ? (
        <MonthlyBilling months={unbilled} thisMonth={thisMonth} />
      ) : null}
      {invoices.length === 0 ? (
        <Empty>No invoices yet. Create one from a job once the work is done.</Empty>
      ) : (
        <>
          {/* Phones: an inset grouped list, a row per invoice. */}
          <Grouped className="sm:hidden">
            {invoices.map((i) => (
              <Row
                key={i.id}
                href={`/jobs/${i.job_id}#invoice`}
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
                      {INVOICE_STATUS_LABELS[i.status]}
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
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${i.job_id}#invoice`}
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
                    <td className="px-4 py-3">{INVOICE_STATUS_LABELS[i.status]}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{day(i.sent_at)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCents(i.total_cents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {i.status === "void" || i.status === "draft"
                        ? ""
                        : formatCents(invoiceBalance(i))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
