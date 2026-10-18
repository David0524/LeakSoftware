import type { Metadata } from "next";
import { formatAddress } from "@leakbook/core";
import { Button, Empty, Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listCustomers } from "@/lib/data";
import { Suspense } from "react";
import { ScreenTip } from "@/components/screen-tip";

export const metadata: Metadata = { title: "Customers · Tidemark" };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const office = await getOffice();
  const { q } = await searchParams;
  const search = typeof q === "string" ? q : "";
  const customers = await listCustomers(office, search);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={
          <span className="hidden sm:inline">
            Homeowners, pool companies, and everyone you bill.
          </span>
        }
      />
      <Suspense fallback={null}>
        <ScreenTip screen="customers" />
      </Suspense>
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
          className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-control-border bg-surface px-3 focus:outline-3 focus:outline-focus"
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
        <Grouped className="max-w-3xl">
          {customers.map((c) => (
            <Row
              key={c.id}
              href={`/customers/${c.id}`}
              label={
                <>
                  <span className="font-semibold">{c.name}</span>
                  {c.company_name ? (
                    <span className="text-text-muted"> · {c.company_name}</span>
                  ) : null}
                </>
              }
              detail={
                <>
                  {/* Phones show the number only (one line); the email joins it when wider. */}
                  <span className="block truncate">
                    {c.phone ?? null}
                    {c.email ? (
                      <span className={c.phone ? "hidden sm:inline" : undefined}>
                        {c.phone ? " · " : ""}
                        {c.email}
                      </span>
                    ) : null}
                    {!c.phone && !c.email ? "No contact details" : null}
                  </span>
                  {c.properties.length > 0 ? (
                    <span className="block text-text">
                      {c.properties.map((p) => formatAddress(p)).join("; ")}
                    </span>
                  ) : null}
                </>
              }
            />
          ))}
        </Grouped>
      )}
    </>
  );
}
