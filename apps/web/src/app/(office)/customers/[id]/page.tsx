import { RememberRecent } from "@/components/remember-recent";
import {
  CUSTOMER_EMAILS_LABEL,
  CUSTOMER_EMAILS_OFF_LABEL,
  FEEDBACK_WORDS,
  autopaySettings,
  mapStatus,
  offersLeak,
  offersPool,
  shopInvoiceDay,
} from "@leakbook/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotOnMapTag } from "@/components/not-on-map";
import { routingConfigured } from "@/server/routing";
import { isUuid } from "@/lib/uuid";
import {
  JOB_TYPE_LABELS,
  poolSummary,
  directionsHref,
  formatAddress,
  formatSchedule,
  localDate,
  maintenanceSettings,
  cleaningDefaultMonths,
  cleaningKind,
  readingSummary,
  type ChemicalReading,
} from "@leakbook/core";
import { saveCustomer } from "@/app/actions/jobs";
import { PoolDetailsForm } from "@/components/pool-details";
import { DeleteCustomerForm } from "@/components/delete-customer";
import { AutopayGroup } from "@/components/autopay";
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
import { ButtonLink, Empty, Grouped, PageHeader, Row } from "@/components/ui";
import { CustomerIssues } from "@/components/issues";
import { customerIssues } from "@/lib/issues";
import { Draft } from "@/components/draft-keeper";
import { LiveStatusBadge } from "@/components/instant";
import { getOffice } from "@/lib/auth";
import {
  getChemicalReadings,
  getCompany,
  getCustomer,
  getSavedMethod,
  getTeam,
  listConfig,
  mayMakeJobs,
  type ComponentType,
} from "@/lib/data";
import { feedbackList } from "@/lib/feedback";
import { getLine } from "@/lib/messages";
import { FeedbackRowItem } from "@/components/feedback-rows";

export const metadata: Metadata = { title: "Customer · Sundeck Pro" };

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
  if (!isUuid(id)) notFound();
  const office = await getOffice();
  // All three at once: each used to wait for the one before.
  const [
    data,
    team,
    company,
    line,
    componentTypes,
    priceBook,
    feedback,
    savedMethod,
    issues,
    canQuote,
  ] = await Promise.all([
    getCustomer(office, id),
    getTeam(office),
    getCompany(office),
    getLine(office),
    listConfig<ComponentType>(office, "component_type"),
    listConfig<{ component_type_key: string | null; price_cents: number }>(
      office,
      "price_book_item",
    ),
    // Owners and admins see what this customer told the shop (owner's competitor notes,
    // 2026-11-16).
    office.isManager ? feedbackList(office.company.id, id) : Promise.resolve(null),
    // Autopay (docs/design/2026-11-16-autopay.md): owners and admins only.
    office.isManager ? getSavedMethod(office, id) : null,
    customerIssues(office, id),
    // New Quote: the same people who can make jobs.
    mayMakeJobs(office),
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
      defaultMonths: cleaningDefaultMonths(company.settings, t.key),
      kind: cleaningKind(t),
    }));
  const { customer, properties, plans, jobs } = data;
  // Each pool's latest chemical log entry (owner, 2026-10-19).
  const lastReadings = new Map(
    (
      await Promise.all(
        properties.map(
          async (p) =>
            [p.id, (await getChemicalReadings(office, p.id, 1).catch(() => []))[0]] as const,
        ),
      )
    ).filter((e): e is readonly [string, ChemicalReading] => !!e[1]),
  );
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
  const cc = customer.cc_emails ?? [];

  // Laid out like a contact card in iOS (owner, 2026-10-15: "this page doesn't look very
  // Apple"): call, text, and email up top, details as grouped rows, and each group's details
  // edited in a sheet ("There is no way to change a homeowner's address").
  return (
    <SheetNotices>
      {/* First under Recent in search (docs/plans/search-and-activity.md). */}
      <RememberRecent
        userId={office.user.id}
        item={{
          kind: "customer",
          id: customer.id,
          title: customer.name,
          detail: customer.phone?.trim() || customer.email?.trim() || null,
          open: { screen: "customer", id: customer.id },
        }}
      />
      <PageHeader
        title={customer.name}
        back={{ href: "/customers", label: "Customers" }}
        subtitle={[KIND[customer.kind], customer.company_name].filter(Boolean).join(" · ")}
      />
      {/* Call, text and email only with Text and Call Customers (owner, 2026-11-23). */}
      {office.canContact || canQuote ? (
        <div className="-mt-2 mb-6 space-y-4">
          {office.canContact ? (
            <ContactButtons
              name={customer.name}
              phone={customer.phone}
              email={customer.email}
              textHref={
                line?.status === "active" ? `/messages/new?customer=${customer.id}` : undefined
              }
            />
          ) : null}
          {/* A quote without making a job (docs/design/2026-11-24-standalone-quotes.md). */}
          {canQuote ? (
            <ButtonLink kind="secondary" href={`/quotes/new?customer=${customer.id}`}>
              New Quote
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
      <div className="grid items-start gap-8 lg:grid-cols-3">
        <div className="space-y-8">
          <Grouped title="Contact">
            {/* Numbers and emails only with Text and Call Customers (owner, 2026-11-23). */}
            {office.canContact ? (
              <>
                <Row label="Phone" value={customer.phone ?? "None"} />
                <Row
                  label="Email"
                  value={<span className="break-all">{customer.email ?? "None"}</span>}
                />
              </>
            ) : null}
            {cc.length ? (
              <Row
                label="Other emails"
                detail={<span className="break-all">{cc.join(", ")}</span>}
              />
            ) : null}
            <Row label={CUSTOMER_EMAILS_LABEL} value={customer.marketing_opt_out ? "Off" : "On"} />
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
              <Draft form="customer" id={customer.id}>
                <SettingsForm action={saveCustomer} full>
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
                    {office.canContact ? (
                      <>
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
                      </>
                    ) : null}
                  </SettingsFields>
                  <SettingsFields>
                    {office.canContact ? (
                      <SField
                        label="Other emails"
                        name="cc_emails"
                        defaultValue={cc.join(" ")}
                        hint="They get reports too. Separate with spaces."
                        stacked
                      />
                    ) : null}
                    <STextArea label="Notes" name="notes" defaultValue={customer.notes ?? ""} />
                    <SSwitch
                      name="no_followups"
                      label={CUSTOMER_EMAILS_OFF_LABEL}
                      defaultChecked={customer.marketing_opt_out ?? false}
                    />
                  </SettingsFields>
                </SettingsForm>
              </Draft>
            </SheetRow>
          </Grouped>
          {office.isManager ? (
            <AutopayGroup
              customerId={customer.id}
              autopay={Boolean(customer.autopay)}
              method={savedMethod}
              shopOn={autopaySettings(company.settings).on}
              email={customer.email ?? null}
              phone={customer.phone ?? null}
              texting={line?.status === "active"}
              canEdit={office.isManager}
              today={today}
            />
          ) : null}
        </div>

        <div className="space-y-8 lg:col-span-2">
          {/* Problems techs reported on visits (docs/design/2026-11-16-service-issues.md). */}
          <CustomerIssues issues={issues} timeZone={office.company.timezone} />
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
                    label={
                      <>
                        <span className="font-semibold">{address}</span>
                        {mapStatus(p, routingConfigured()) === "missing" ? (
                          <NotOnMapTag className="mt-0.5 flex" />
                        ) : null}
                      </>
                    }
                    detail={poolSummary(p)}
                    value={<span className="text-link">Edit</span>}
                  >
                    <PoolDetailsForm pool={p} />
                  </SheetRow>
                  {p.access_notes ? <Row label="Access notes" detail={p.access_notes} /> : null}
                  {p.notes ? (
                    <Row
                      label="Pool notes"
                      detail={<span className="whitespace-pre-line">{p.notes}</span>}
                    />
                  ) : null}
                  {offersPool(company.settings) ? (
                    <Row
                      href={`/chemicals?property=${p.id}`}
                      label={<span className="text-link">Chemical</span>}
                      detail={
                        lastReadings.get(p.id)
                          ? `Last: ${readingSummary(lastReadings.get(p.id)!)} · ${formatSchedule(lastReadings.get(p.id)!.recorded_at, now, office.company.timezone)}`
                          : "Readings and the chemical log"
                      }
                    />
                  ) : null}
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
                    canEdit={office.isManager}
                    shopInvoiceDay={shopInvoiceDay(company.settings)}
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
                        value={<LiveStatusBadge jobId={j.id} status={j.status} />}
                      />
                    ))
                  )}
                </Grouped>
              </section>
            );
          })}
        </div>
      </div>
      {feedback && feedback.rows.length > 0 ? (
        <section className="mt-10 max-w-xl" aria-label={FEEDBACK_WORDS.customerSection}>
          <Grouped
            title={FEEDBACK_WORDS.customerSection}
            footer={
              <Link href="/feedback" className="text-link underline-offset-4 hover:underline">
                {FEEDBACK_WORDS.seeAll}
              </Link>
            }
          >
            {feedback.rows.slice(0, 5).map((r) => (
              <FeedbackRowItem
                key={r.id}
                row={r}
                timeZone={office.company.timezone}
                now={now}
                showCustomer={false}
              />
            ))}
          </Grouped>
        </section>
      ) : null}
      {office.isManager ? (
        <section className="mt-10 max-w-xl" aria-labelledby="delete-customer">
          <h2 id="delete-customer" className="sr-only">
            Delete Customer
          </h2>
          <DeleteCustomerForm id={customer.id} name={customer.name} />
          <p className="mt-2 px-4 text-[0.8125rem] text-text-muted">
            Removes {customer.name} and their pools from Sundeck Pro. Only possible when every job
            is paid or canceled; finished jobs, reports, and invoices are kept.
          </p>
        </section>
      ) : null}
    </SheetNotices>
  );
}
