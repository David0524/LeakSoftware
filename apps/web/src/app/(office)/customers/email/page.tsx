import type { Metadata } from "next";
import { MASS_EMAIL_TITLE, massEmailAudience } from "@leakbook/core";
import { MassEmailForm } from "@/components/mass-email";
import { Notice, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { massEmailCount, massEmailSetup } from "@/server/mass-email";

export const metadata: Metadata = { title: "Email Customers · Sundeck Pro" };

/** Email Customers (owner, 2026-10-22): owners and admins send one email to many customers. */
export default async function EmailCustomersPage() {
  const office = await getOffice();
  const back = { href: "/customers", label: "Customers" };
  if (!office.isManager)
    return (
      <>
        <PageHeader title={MASS_EMAIL_TITLE} back={back} />
        <Notice>Only owners and admins can email customers.</Notice>
      </>
    );
  const db = await createClient();
  const [setup, count] = await Promise.all([
    massEmailSetup(db, office.company.id),
    massEmailCount(db, office.company.id, massEmailAudience({})),
  ]);
  return (
    <>
      <PageHeader title={MASS_EMAIL_TITLE} back={back} />
      {setup ? (
        <MassEmailForm
          setup={setup}
          initialCount={count}
          me={office.user.email}
          timeZone={office.company.timezone}
        />
      ) : (
        <Notice tone="error">Couldn’t load this. Reload the page to try again.</Notice>
      )}
    </>
  );
}
