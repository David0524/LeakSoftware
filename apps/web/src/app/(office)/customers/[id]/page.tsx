import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JOB_TYPE_LABELS, POOL_TYPE_LABELS, formatAddress, formatSchedule } from "@leakbook/core";
import { saveCustomerEmails } from "@/app/actions/jobs";
import { DeleteCustomerForm } from "@/components/delete-customer";
import { SField, SettingsForm } from "@/components/settings-forms";
import { Card, Checkbox, Empty, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCustomer } from "@/lib/data";

export const metadata: Metadata = { title: "Customer · Tidemark" };

const KIND: Record<string, string> = {
  homeowner: "Homeowner",
  pool_company: "Pool company",
  builder: "Builder",
  insurer: "Insurer",
  property_manager: "Property manager",
  other: "Other",
};

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const office = await getOffice();
  const data = await getCustomer(office, id);
  if (!data) notFound();
  const { customer, properties, jobs } = data;
  const now = new Date();

  return (
    <>
      <p className="mb-2">
        <Link
          href="/customers"
          className="inline-flex min-h-11 items-center gap-1 text-link underline-offset-4 hover:underline"
        >
          ← Customers
        </Link>
      </p>
      <PageHeader
        title={customer.name}
        subtitle={[KIND[customer.kind], customer.company_name].filter(Boolean).join(" · ")}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <SectionTitle>Contact</SectionTitle>
          {customer.phone ? (
            <p>
              <a href={`tel:${customer.phone}`} className="text-link">
                {customer.phone}
              </a>
            </p>
          ) : null}
          {customer.email ? (
            <p>
              <a href={`mailto:${customer.email}`} className="text-link">
                {customer.email}
              </a>
            </p>
          ) : null}
          {!customer.phone && !customer.email ? (
            <p className="text-text-muted">No contact details.</p>
          ) : null}
          {customer.notes ? <p className="mt-3 whitespace-pre-line">{customer.notes}</p> : null}
          <h3 className="mt-5 mb-2 font-display text-lg font-bold">Emails</h3>
          <SettingsForm action={saveCustomerEmails}>
            <input type="hidden" name="customer" value={customer.id} />
            <SField label="Email" name="email" type="email" defaultValue={customer.email ?? ""} />
            <SField
              label="Other emails"
              name="cc_emails"
              defaultValue={(customer.cc_emails ?? []).join(" ")}
              hint="They get reports too. Separate with spaces."
            />
            <Checkbox
              name="no_followups"
              label="No reminder or review emails"
              defaultChecked={customer.marketing_opt_out ?? false}
            />
          </SettingsForm>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          {properties.length === 0 ? <Empty>No properties.</Empty> : null}
          {properties.map((p) => {
            const visits = jobs.filter((j) => j.property_id === p.id);
            return (
              <Card key={p.id}>
                <h2 className="font-display text-xl font-bold">{formatAddress(p)}</h2>
                <p className="text-text-muted">
                  {[
                    p.pool_type ? POOL_TYPE_LABELS[p.pool_type] : null,
                    p.has_spa ? "Pool and spa" : "Pool",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {p.access_notes ? (
                  <p className="mt-2 border-l-4 border-status-warning pl-3">{p.access_notes}</p>
                ) : null}
                <h3 className="mt-4 mb-2 font-display text-sm font-semibold tracking-widest text-text-muted uppercase">
                  Visits
                </h3>
                {visits.length === 0 ? (
                  <p className="text-text-muted">No visits yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {visits.map((j) => (
                      <li key={j.id} className="flex flex-wrap items-center gap-3 py-2">
                        <Link
                          href={`/jobs/${j.id}`}
                          className="font-semibold text-link underline-offset-4 hover:underline"
                        >
                          {j.number ? `Job #${j.number}` : "New job"}
                        </Link>
                        <span>{JOB_TYPE_LABELS[j.type]}</span>
                        <StatusBadge status={j.status} />
                        <span className="text-text-muted">
                          {formatSchedule(
                            j.scheduled_start ?? j.started_at ?? null,
                            now,
                            office.company.timezone,
                          )}
                        </span>
                        {j.techName ? (
                          <span className="text-text-muted">· {j.techName}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </div>
      {office.isOwner ? (
        <section className="mt-10 border-t border-border pt-6" aria-labelledby="delete-customer">
          <h2 id="delete-customer" className="mb-2 font-display text-xl font-bold">
            Delete Customer
          </h2>
          <p className="mb-3 text-text-muted">
            Removes {customer.name} and their pools from Tidemark. Only possible when every job is
            paid or canceled; finished jobs, reports, and invoices are kept.
          </p>
          <DeleteCustomerForm id={customer.id} name={customer.name} />
        </section>
      ) : null}
    </>
  );
}
