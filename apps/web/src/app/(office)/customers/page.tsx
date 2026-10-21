import type { Metadata } from "next";
import { formatAddress, offersPool, propertyLocation } from "@leakbook/core";
import { CustomerActions } from "@/components/list-actions";
import { getLine } from "@/lib/messages";
import { CustomerFilters } from "@/components/customer-filters";
import { Empty, Grouped, PageHeader, RowContent } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { CUSTOMER_SORTS, getCompany, listCustomers, type CustomerSort } from "@/lib/data";
import { Suspense } from "react";
import { ScreenTip } from "@/components/screen-tip";

export const metadata: Metadata = { title: "Customers · Sundeck Pro" };

/** Customer kinds, as on the customer's page; plural for the Show menu. */
const KINDS: Record<string, string> = {
  homeowner: "Homeowners",
  pool_company: "Pool Companies",
  builder: "Builders",
  insurer: "Insurers",
  property_manager: "Property Managers",
  other: "Other",
};

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const office = await getOffice();
  const { q, sort: sortParam, show: showParam } = await searchParams;
  const search = typeof q === "string" ? q : "";
  const [company, line] = await Promise.all([getCompany(office), getLine(office)]);
  const shows = [
    { value: "all", label: "All Customers" },
    ...(offersPool(company.settings)
      ? [
          { value: "plan", label: "On a Plan" },
          { value: "no_plan", label: "No Plan" },
        ]
      : []),
    ...Object.entries(KINDS).map(([value, label]) => ({ value, label })),
  ];
  const sort: CustomerSort =
    typeof sortParam === "string" && sortParam in CUSTOMER_SORTS
      ? (sortParam as CustomerSort)
      : "name";
  const show =
    typeof showParam === "string" && shows.some((o) => o.value === showParam) ? showParam : "all";
  const customers = await listCustomers(office, search, { sort, show });
  // "Oct 17", with the year only when it isn't this year.
  const thisYear = new Date().getFullYear();
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone: office.company.timezone,
      month: "short",
      day: "numeric",
      ...(new Date(iso).getFullYear() !== thisYear ? { year: "numeric" } : {}),
    });

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
      <CustomerFilters
        search={search}
        sort={sort}
        show={show}
        sorts={Object.entries(CUSTOMER_SORTS).map(([value, label]) => ({ value, label }))}
        shows={shows}
      />
      {customers.length === 0 ? (
        <Empty>
          {search
            ? `No customers match “${search}”.`
            : show !== "all"
              ? "No customers here."
              : "No customers yet. They’re added when a job is created on the phone."}
        </Empty>
      ) : (
        <Grouped className="max-w-3xl">
          {customers.map((c) => (
            <CustomerActions
              key={c.id}
              customer={{
                id: c.id,
                name: c.name,
                phone: c.phone ?? null,
                inboxHref: line?.status === "active" ? `/messages/new?customer=${c.id}` : null,
                address: c.properties[0] ? formatAddress(c.properties[0]) : null,
                location: c.properties[0] ? propertyLocation(c.properties[0]) : null,
              }}
            >
              <RowContent
                href={`/customers/${c.id}`}
                value={
                  sort === "last_visit"
                    ? c.lastVisit
                      ? day(c.lastVisit)
                      : "No visits"
                    : sort === "newest" || sort === "oldest"
                      ? c.created_at
                        ? `Added ${day(c.created_at)}`
                        : undefined
                      : undefined
                }
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
            </CustomerActions>
          ))}
        </Grouped>
      )}
    </>
  );
}
