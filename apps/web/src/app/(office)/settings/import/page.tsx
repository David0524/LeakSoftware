import type { Metadata } from "next";
import { companyServices } from "@leakbook/core";
import { ImportWizard } from "@/components/import-wizard";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";

export const metadata: Metadata = { title: "Import Customers · Sundeck Pro" };

/** Owners: bring customers, pools, and visit plans over from a CSV (owner, 2026-10-16). */
export default async function ImportPage() {
  const company = await getCompany(await getOffice());
  return (
    <>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Import Customers"
        subtitle="Bring your customers over from a spreadsheet or the software you use now."
      />
      <ImportWizard services={companyServices(company.settings)} />
    </>
  );
}
