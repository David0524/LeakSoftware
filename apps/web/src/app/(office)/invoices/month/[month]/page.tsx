import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { billingMonthName, monthBillingSubtitle, offersPool } from "@leakbook/core";
import { MonthBillingView } from "@/components/month-billing";
import { Notice, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getChargeItems, getCompany, getMonthBilling } from "@/lib/data";
import { getLine } from "@/lib/messages";
import { validMonth } from "@/server/monthly-billing";

export const metadata: Metadata = { title: "Monthly Billing · Sundeck Pro" };

// Send All runs on this page's action; a big shop's month takes a while (four at a time).
export const maxDuration = 300;

/**
 * A month's Monthly Billing (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md):
 * each customer's draft with Add Charge, then Send All; and what was sent.
 */
export default async function MonthBillingPage({
  params,
  searchParams,
}: PageProps<"/invoices/month/[month]">) {
  const { month } = await params;
  if (!validMonth(month)) notFound();
  const office = await getOffice();
  const title = `${billingMonthName(month, false)} Billing`;
  const back = { href: "/invoices", label: "Invoices" };
  if (!office.isManager)
    return (
      <>
        <PageHeader title={title} back={back} />
        <Notice>Only owners and admins can bill the month.</Notice>
      </>
    );
  const [billing, items, line, company] = await Promise.all([
    getMonthBilling(office, month),
    getChargeItems(office),
    getLine(office),
    getCompany(office),
  ]);
  if (!offersPool(company.settings)) notFound();
  const open = (await searchParams).invoice;
  return (
    <>
      <PageHeader title={title} subtitle={monthBillingSubtitle(billing)} back={back} />
      <MonthBillingView
        billing={billing}
        items={items}
        texting={line?.status === "active"}
        timeZone={office.company.timezone}
        openInvoice={typeof open === "string" ? open : null}
      />
    </>
  );
}
