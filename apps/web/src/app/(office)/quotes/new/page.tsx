import type { Metadata } from "next";
import { formatAddress, type Customer, type Property } from "@leakbook/core";
import { NewQuoteForm } from "@/components/new-quote-form";
import { Notice, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCustomer, listCustomers, mayMakeJobs } from "@/lib/data";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = { title: "New Quote · Sundeck Pro" };

/**
 * New Quote (docs/design/2026-11-24-standalone-quotes.md): a quote for a new or existing
 * customer without making a job. ?customer= (from a customer page) picks that customer.
 */
export default async function NewQuotePage({ searchParams }: PageProps<"/quotes/new">) {
  const office = await getOffice();
  const { customer } = await searchParams;
  const picked = typeof customer === "string" ? customer : "";
  const back = picked
    ? { href: `/customers/${picked}`, label: "Customer" }
    : { href: "/quotes", label: "Quotes" };
  // The same people who can make jobs (New Job's rule).
  if (!(await mayMakeJobs(office)))
    return (
      <>
        <PageHeader title="New Quote" back={back} />
        <Notice>Your office makes new jobs. Ask an owner or admin to add this one.</Notice>
      </>
    );
  const listed = await listCustomers(office, "");
  const option = (c: Customer, pools: Property[]) => ({
    id: c.id,
    name: c.name,
    detail: office.canContact ? [c.phone, c.email].filter(Boolean).join(" · ") : "",
    pools: pools.map((p) => ({ id: p.id, label: formatAddress(p) })),
  });
  const customers = listed.map((c) => option(c, c.properties));
  // The list holds the first few hundred: the customer a page opened it for is always there.
  if (picked && isUuid(picked) && !customers.some((c) => c.id === picked)) {
    const one = await getCustomer(office, picked);
    if (one) customers.unshift(option(one.customer, one.properties));
  }
  return (
    <>
      <PageHeader title="New Quote" back={back} />
      <NewQuoteForm customerId={picked} customers={customers} />
    </>
  );
}
