import type { Metadata } from "next";
import Link from "next/link";
import { INVOICE_STATUS_LABELS, formatCents, invoiceBalance } from "@leakbook/core";
import { ButtonLink, Empty, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listInvoices } from "@/lib/data";

export const metadata: Metadata = { title: "Invoices · Tidemark" };

export default async function InvoicesPage() {
  const office = await getOffice();
  const invoices = await listInvoices(office);
  const open = invoices.filter((i) => i.status === "sent" || i.status === "partially_paid");
  const owed = open.reduce((sum, i) => sum + invoiceBalance(i), 0);
  const tz = office.company.timezone;
  const day = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: tz }).format(
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
          office.isOwner ? (
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
      {invoices.length === 0 ? (
        <Empty>No invoices yet. Create one from a job once the work is done.</Empty>
      ) : (
        <>
          {/* Phones: one card per invoice. */}
          <ul className="space-y-3 sm:hidden">
            {invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/jobs/${i.job_id}#invoice`} className="block card p-4 active:bg-bg">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-link">
                      #{i.number}
                      {i.jobNumber ? (
                        <span className="font-normal text-text-muted"> · Job #{i.jobNumber}</span>
                      ) : null}
                    </span>
                    <span className="font-semibold tabular-nums">{formatCents(i.total_cents)}</span>
                  </span>
                  <span className="mt-1 block font-medium">{i.customer}</span>
                  <span className="block text-[15px] text-text-muted">
                    {INVOICE_STATUS_LABELS[i.status]}
                    {i.sent_at ? ` · sent ${day(i.sent_at)}` : ""}
                    {i.status === "sent" || i.status === "partially_paid"
                      ? ` · ${formatCents(invoiceBalance(i))} due`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto card sm:block">
            <table className="w-full text-left">
              <thead className="border-b border-border text-[15px] text-text-muted">
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
                        {i.jobNumber ? ` · Job #${i.jobNumber}` : ""}
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
