import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  JOB_TYPE_LABELS,
  POOL_TYPE_LABELS,
  formatAddress,
  formatSchedule,
  localDate,
  maintenanceSettings,
} from "@leakbook/core";
import { saveCustomerEmails } from "@/app/actions/jobs";
import { DeleteCustomerForm } from "@/components/delete-customer";
import { MaintenancePlans } from "@/components/maintenance-plans";
import { SField, SettingsForm } from "@/components/settings-forms";
import { ContactButtons } from "@/components/contact-buttons";
import {
  Checkbox,
  Empty,
  Grouped,
  PageHeader,
  Row,
  SectionTitle,
  StatusBadge,
} from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, getCustomer, getTeam } from "@/lib/data";

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
  const { customer, properties, plans, jobs } = data;
  const now = new Date();
  const [team, company] = await Promise.all([getTeam(office), getCompany(office)]);
  const techs = team
    .filter((t) => t.status === "active")
    .map((t) => ({ id: t.user_id, name: t.name }));
  const today = localDate(now, office.company.timezone);
  const doneCounts: Record<string, number> = {};
  for (const j of jobs)
    if (j.service_plan_id && j.status === "done")
      doneCounts[j.service_plan_id] = (doneCounts[j.service_plan_id] ?? 0) + 1;

  return (
    <>
      <PageHeader
        title={customer.name}
        back={{ href: "/customers", label: "Customers" }}
        subtitle={[KIND[customer.kind], customer.company_name].filter(Boolean).join(" · ")}
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <section aria-labelledby="contact-title">
            <SectionTitle>
              <span id="contact-title">Contact</span>
            </SectionTitle>
            <div className="card px-4 py-3">
              {customer.phone || customer.email ? (
                <div className="-mt-2">
                  <ContactButtons
                    name={customer.name}
                    phone={customer.phone}
                    email={customer.email}
                  />
                </div>
              ) : (
                <p className="text-text-muted">No contact details.</p>
              )}
              {customer.notes ? <p className="mt-3 whitespace-pre-line">{customer.notes}</p> : null}
            </div>
          </section>
          <section aria-labelledby="emails-title">
            <SectionTitle>
              <span id="emails-title">Emails</span>
            </SectionTitle>
            <div className="card p-4">
              <SettingsForm action={saveCustomerEmails}>
                <input type="hidden" name="customer" value={customer.id} />
                <SField
                  label="Main email"
                  name="email"
                  type="email"
                  defaultValue={customer.email ?? ""}
                />
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
            </div>
          </section>
        </div>
        <div className="space-y-8 lg:col-span-2">
          {properties.length === 0 ? <Empty>No properties.</Empty> : null}
          {properties.map((p) => {
            // Maintenance visits are summed up by their plan, not listed one by one.
            const visits = jobs.filter((j) => j.property_id === p.id && j.type !== "maintenance");
            return (
              <section key={p.id} aria-label={formatAddress(p)} className="space-y-6">
                <div className="card p-4">
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
                    <p className="mt-2 rounded-xl bg-status-warning/10 px-3 py-2">
                      {p.access_notes}
                    </p>
                  ) : null}
                  <MaintenancePlans
                    customerId={customer.id}
                    propertyId={p.id}
                    plans={plans.filter((plan) => plan.property_id === p.id)}
                    techs={techs}
                    today={today}
                    visitMinutes={maintenanceSettings(company.settings).visitMinutes}
                    doneCounts={doneCounts}
                    canEdit={office.isOwner}
                  />
                </div>
                {visits.length === 0 ? (
                  <div>
                    <SectionTitle>Leak detection and repairs</SectionTitle>
                    <p className="card px-4 py-3 text-text-muted">No visits yet.</p>
                  </div>
                ) : (
                  <Grouped title="Leak detection and repairs">
                    {visits.map((j) => (
                      <Row
                        key={j.id}
                        href={`/jobs/${j.id}`}
                        label={
                          <>
                            <span className="font-semibold">
                              {j.number ? `Job #${j.number}` : "New job"}
                            </span>
                            <span className="text-text-muted"> · {JOB_TYPE_LABELS[j.type]}</span>
                          </>
                        }
                        detail={
                          <>
                            {formatSchedule(
                              j.scheduled_start ?? j.started_at ?? null,
                              now,
                              office.company.timezone,
                            )}
                            {j.techName ? ` · ${j.techName}` : ""}
                          </>
                        }
                        value={<StatusBadge status={j.status} />}
                      />
                    ))}
                  </Grouped>
                )}
              </section>
            );
          })}
        </div>
      </div>
      {office.isOwner ? (
        <section className="mt-10 max-w-xl" aria-labelledby="delete-customer">
          <h2 id="delete-customer" className="sr-only">
            Delete Customer
          </h2>
          <div className="card p-4">
            <p className="mb-3 text-[0.9375rem] text-text-muted">
              Removes {customer.name} and their pools from Tidemark. Only possible when every job is
              paid or canceled; finished jobs, reports, and invoices are kept.
            </p>
            <DeleteCustomerForm id={customer.id} name={customer.name} />
          </div>
        </section>
      ) : null}
    </>
  );
}
