import type { Metadata } from "next";
import {
  companyServices,
  formatAddress,
  maintenanceSettings,
  seesAllJobs,
  type CompanySettings,
} from "@leakbook/core";
import { NewJobForm } from "@/components/new-job-form";
import { Notice, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, getTeam, listConfig, listCustomers, mayMakeJobs } from "@/lib/data";

export const metadata: Metadata = { title: "New Job · Tidemark" };

interface PriceItem {
  id: string;
  name: string;
  category: string | null;
  price_cents: number;
  active: boolean;
  deleted_at: string | null;
}

/** A new detection job from the office: the same fields as the phone's New Job screen. */
export default async function NewJobPage() {
  const office = await getOffice();
  // Owners can stop techs making jobs (owner setting, 2026-10-18).
  if (!(await mayMakeJobs(office)))
    return (
      <>
        <PageHeader title="New Job" back={{ href: "/jobs", label: "Jobs" }} />
        <Notice>Your office makes new jobs. Ask an owner to add this one.</Notice>
      </>
    );
  const [customers, team, company, prices] = await Promise.all([
    listCustomers(office, ""),
    getTeam(office),
    getCompany(office),
    listConfig<PriceItem>(office, "price_book_item"),
  ]);
  const settings = company.settings as Partial<CompanySettings>;
  return (
    <>
      <PageHeader
        title="New Job"
        back={{ href: "/jobs", label: "Jobs" }}
        subtitle={
          companyServices(company.settings) === "pool"
            ? "A pool service visit, or a plan that repeats. Repair jobs come from accepted quotes."
            : "Repair jobs come from accepted quotes."
        }
      />
      <NewJobForm
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          detail: [c.phone, c.email].filter(Boolean).join(" · "),
          pools: c.properties.map((p) => ({ id: p.id, label: formatAddress(p) })),
        }))}
        team={team
          .filter((m) => m.status === "active")
          .map((m) => ({ id: m.user_id, name: m.name }))}
        canPlan={office.isOwner}
        services={companyServices(company.settings)}
        visitMinutes={maintenanceSettings(company.settings).visitMinutes}
        lockedTech={seesAllJobs(office.company.role, company.settings) ? undefined : office.user.id}
        fees={prices
          .filter((p) => p.active && !p.deleted_at && p.category === "Detection")
          .map((p) => ({ id: p.id, name: p.name, cents: p.price_cents }))}
        questions={settings.intake_questions ?? []}
      />
    </>
  );
}
