import { offersLeak, offersPool } from "@leakbook/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  JOB_TYPE_LABELS,
  POOL_TYPE_LABELS,
  directionsHref,
  formatAddress,
  formatSchedule,
  localDate,
  maintenanceSettings,
  type PoolType,
} from "@leakbook/core";
import { saveCustomer, savePool } from "@/app/actions/jobs";
import { DeleteCustomerForm } from "@/components/delete-customer";
import { MaintenancePlans, type CleaningType } from "@/components/maintenance-plans";
import {
  SField,
  SSelect,
  SSwitch,
  STextArea,
  SettingsFields,
  SettingsForm,
} from "@/components/settings-forms";
import { SheetNotices, SheetRow } from "@/components/settings-list";
import { ContactButtons } from "@/components/contact-buttons";
import { Empty, Grouped, PageHeader, Row, StatusBadge } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, getCustomer, getTeam, listConfig, type ComponentType } from "@/lib/data";
import { getLine } from "@/lib/messages";

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
  // All three at once: each used to wait for the one before.
  const [data, team, company, line, componentTypes, priceBook] = await Promise.all([
    getCustomer(office, id),
    getTeam(office),
    getCompany(office),
    getLine(office),
    listConfig<ComponentType>(office, "component_type"),
    listConfig<{ component_type_key: string | null; price_cents: number }>(
      office,
      "price_book_item",
    ),
  ]);
  if (!data) notFound();
  // Checklist items done on a schedule, for a plan's Regular Cleanings (owner, 2026-10-18),
  // plus any a plan still uses after the item was changed.
  const usedTypes = new Set(
    data.plans.flatMap((plan) => plan.cleanings.map((c) => c.component_type_id)),
  );
  const cleaningTypes: CleaningType[] = componentTypes
    .filter(
      (t) => t.job_type === "maintenance" && ((t.on_schedule && t.active) || usedTypes.has(t.id)),
    )
    .map((t) => ({
      id: t.id,
      name: t.name,
      defaultPriceCents:
        priceBook.find((item) => item.component_type_key === t.key)?.price_cents ?? null,
    }));
  const { customer, properties, plans, jobs } = data;
  const now = new Date();
  const techs = team
    .filter((t) => t.status === "active")
    .map((t) => ({ id: t.user_id, name: t.name }));
  const today = localDate(now, office.company.timezone);
  const doneCounts: Record<string, number> = {};
  for (const j of jobs)
    if (j.service_plan_id && j.status === "done")
      doneCounts[j.service_plan_id] = (doneCounts[j.service_plan_id] ?? 0) + 1;

  const kindOptions = Object.entries(KIND).map(([value, label]) => ({ value, label }));
  const poolOptions = [
    { value: "", label: "Not sure" },
    ...(Object.keys(POOL_TYPE_LABELS) as PoolType[]).map((k) => ({
      value: k,
      label: POOL_TYPE_LABELS[k],
    })),
  ];
  const cc = customer.cc_emails ?? [];

  // Laid out like a contact card in iOS (owner, 2026-10-15: "this page doesn't look very
  // Apple"): call, text, and email up top, details as grouped rows, and each group's details
  // edited in a sheet ("There is no way to change a homeowner's address").
  return (
    <SheetNotices>
      <PageHeader
        title={customer.name}
        back={{ href: "/customers", label: "Customers" }}
        subtitle={[KIND[customer.kind], customer.company_name].filter(Boolean).join(" · ")}
      />
      <div className="-mt-2 mb-6">
        <ContactButtons
          name={customer.name}
          phone={customer.phone}
          email={customer.email}
          textHref={line?.status === "active" ? `/messages/new?customer=${customer.id}` : undefined}
        />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-3">
        <Grouped title="Contact">
          <Row label="Phone" value={customer.phone ?? "None"} />
          <Row
            label="Email"
            value={<span className="break-all">{customer.email ?? "None"}</span>}
          />
          {cc.length ? (
            <Row label="Other emails" detail={<span className="break-all">{cc.join(", ")}</span>} />
          ) : null}
          <Row
            label="Reminder and review emails"
            value={customer.marketing_opt_out ? "Off" : "On"}
          />
          {customer.notes ? (
            <Row
              label="Notes"
              detail={<span className="whitespace-pre-line">{customer.notes}</span>}
            />
          ) : null}
          <SheetRow
            title="Contact Details"
            label={<span className="text-link">Edit Contact Details</span>}
          >
            <SettingsForm action={saveCustomer} primary full>
              <input type="hidden" name="customer" value={customer.id} />
              <SettingsFields labelWidth="6.5rem">
                <SField label="Name" name="name" defaultValue={customer.name} required />
                <SSelect
                  label="Type"
                  name="kind"
                  defaultValue={customer.kind}
                  options={kindOptions}
                />
                <SField
                  label="Company"
                  name="company_name"
                  defaultValue={customer.company_name ?? ""}
                  placeholder="Optional"
                />
                <SField
                  label="Phone"
                  name="phone"
                  type="tel"
                  defaultValue={customer.phone ?? ""}
                  autoComplete="off"
                />
                <SField
                  label="Email"
                  name="email"
                  type="email"
                  defaultValue={customer.email ?? ""}
                  autoComplete="off"
                />
              </SettingsFields>
              <SettingsFields>
                <SField
                  label="Other emails"
                  name="cc_emails"
                  defaultValue={cc.join(" ")}
                  hint="They get reports too. Separate with spaces."
                  stacked
                />
                <STextArea label="Notes" name="notes" defaultValue={customer.notes ?? ""} />
                <SSwitch
                  name="no_followups"
                  label="No reminder or review emails"
                  defaultChecked={customer.marketing_opt_out ?? false}
                />
              </SettingsFields>
            </SettingsForm>
          </SheetRow>
        </Grouped>

        <div className="space-y-8 lg:col-span-2">
          {properties.length === 0 ? <Empty>No pools.</Empty> : null}
          {properties.map((p, i) => {
            const address = formatAddress(p);
            // Maintenance visits are summed up by their plan, not listed one by one.
            const visits = jobs.filter((j) => j.property_id === p.id && j.type !== "maintenance");
            return (
              <section key={p.id} aria-label={address} className="space-y-8">
                <Grouped title={properties.length > 1 ? `Pool ${i + 1}` : "Pool"}>
                  <SheetRow
                    title="Pool Details"
                    label={<span className="font-semibold">{address}</span>}
                    detail={[
                      p.pool_type ? POOL_TYPE_LABELS[p.pool_type] : null,
                      p.has_spa ? "Pool and spa" : "Pool",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    value={<span className="text-link">Edit</span>}
                  >
                    <SettingsForm action={savePool} primary full>
                      <input type="hidden" name="property" value={p.id} />
                      <SettingsFields labelWidth="6.5rem">
                        <SField
                          label="Street"
                          name="address_line1"
                          defaultValue={p.address_line1 ?? ""}
                          autoComplete="off"
                          required
                        />
                        <SField
                          label="Unit"
                          name="address_line2"
                          defaultValue={p.address_line2 ?? ""}
                          placeholder="Optional"
                          autoComplete="off"
                        />
                        <SField
                          label="City"
                          name="city"
                          defaultValue={p.city ?? ""}
                          autoComplete="off"
                        />
                        <SField
                          label="State"
                          name="state"
                          defaultValue={p.state ?? ""}
                          maxLength={2}
                          autoComplete="off"
                        />
                        <SField
                          label="ZIP"
                          name="postal_code"
                          defaultValue={p.postal_code ?? ""}
                          inputMode="numeric"
                          autoComplete="off"
                        />
                      </SettingsFields>
                      <SettingsFields labelWidth="6.5rem">
                        <SSelect
                          label="Pool type"
                          name="pool_type"
                          defaultValue={p.pool_type ?? ""}
                          options={poolOptions}
                        />
                        <SSwitch name="has_spa" label="Has a spa" defaultChecked={p.has_spa} />
                        <STextArea
                          label="Access notes"
                          name="access_notes"
                          defaultValue={p.access_notes ?? ""}
                          hint="Gate code, dog, where to park."
                        />
                      </SettingsFields>
                    </SettingsForm>
                  </SheetRow>
                  {p.access_notes ? <Row label="Access notes" detail={p.access_notes} /> : null}
                  <Row
                    href={directionsHref({ address })}
                    label={<span className="text-link">Get Directions</span>}
                  />
                </Grouped>
                {offersPool(company.settings) ? (
                  <MaintenancePlans
                    customerId={customer.id}
                    propertyId={p.id}
                    plans={plans.filter((plan) => plan.property_id === p.id)}
                    cleaningTypes={cleaningTypes}
                    techs={techs}
                    today={today}
                    visitMinutes={maintenanceSettings(company.settings).visitMinutes}
                    doneCounts={doneCounts}
                    canEdit={office.isOwner}
                  />
                ) : null}
                <Grouped
                  title={offersLeak(company.settings) ? "Leak detection and repairs" : "Repairs"}
                >
                  {visits.length === 0 ? (
                    <Row label={<span className="text-text-muted">No visits yet</span>} />
                  ) : (
                    visits.map((j) => (
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
                    ))
                  )}
                </Grouped>
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
          <DeleteCustomerForm id={customer.id} name={customer.name} />
          <p className="mt-2 px-4 text-[0.8125rem] text-text-muted">
            Removes {customer.name} and their pools from Tidemark. Only possible when every job is
            paid or canceled; finished jobs, reports, and invoices are kept.
          </p>
        </section>
      ) : null}
    </SheetNotices>
  );
}
