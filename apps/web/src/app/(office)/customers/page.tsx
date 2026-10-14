import type { Metadata } from "next";
import Link from "next/link";
import { formatAddress } from "@leakbook/core";
import { Button, Empty, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listCustomers } from "@/lib/data";

export const metadata: Metadata = { title: "Customers · Tidemark" };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const office = await getOffice();
  const { q } = await searchParams;
  const search = typeof q === "string" ? q : "";
  const customers = await listCustomers(office, search);

  return (
    <>
      <PageHeader title="Customers" subtitle="Homeowners, pool companies, and everyone you bill." />
      <form role="search" className="mb-5 flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">
          Search customers
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Name, phone, or email"
          className="min-h-11 flex-1 rounded-xl border border-control-border bg-surface px-3 focus:outline-3 focus:outline-focus"
        />
        <Button type="submit" kind="secondary">
          Search
        </Button>
      </form>
      {customers.length === 0 ? (
        <Empty>
          {search
            ? `No customers match “${search}”.`
            : "No customers yet. They’re added when a job is created on the phone."}
        </Empty>
      ) : (
        <ul className="divide-y divide-border card">
          {customers.map((c) => (
            <li key={c.id}>
              <Link href={`/customers/${c.id}`} className="block px-4 py-3 hover:bg-bg">
                <span className="font-semibold text-link">{c.name}</span>
                {c.company_name ? (
                  <span className="text-text-muted"> · {c.company_name}</span>
                ) : null}
                <span className="block text-[0.9375rem] text-text-muted">
                  {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
                </span>
                {c.properties.length > 0 ? (
                  <span className="block text-[0.9375rem]">
                    {c.properties.map((p) => formatAddress(p)).join("; ")}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
