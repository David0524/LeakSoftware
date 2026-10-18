import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { companyServices } from "@leakbook/core";
import { ImportWizard } from "@/components/import-wizard";
import { Empty, PageHeader } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { adminClient } from "@/server/admin";
import { isStaff } from "@/server/leads";

export const metadata: Metadata = {
  title: "Import for a Shop · Sundeck Pro Staff",
  robots: { index: false },
};

/**
 * Staff: import a shop's customers during the setup call (owner, 2026-10-16), so the shop's
 * file comes straight into Sundeck Pro instead of by email.
 */
export default function StaffImportPage({ searchParams }: PageProps<"/admin/import">) {
  return (
    <Suspense fallback={<div className="h-64" aria-label="Loading" />}>
      <StaffImport searchParams={searchParams} />
    </Suspense>
  );
}

async function StaffImport({
  searchParams,
}: {
  searchParams: PageProps<"/admin/import">["searchParams"];
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/admin/leads");
  if (!isStaff(user)) redirect("/home");
  const back = { href: "/admin/leads", label: "Leads" };
  if (user.aal !== "aal2")
    return (
      <>
        <PageHeader back={back} title="Import for a Shop" />
        <Empty>Turn on two-step sign-in to import for a shop.</Empty>
      </>
    );
  const { company } = await searchParams;
  const admin = adminClient();
  const { data: shop } =
    admin && typeof company === "string" && /^[0-9a-f-]{36}$/i.test(company)
      ? await admin.from("company").select("id, name, settings").eq("id", company).maybeSingle()
      : { data: null };
  if (!shop)
    return (
      <>
        <PageHeader back={back} title="Import for a Shop" />
        <Empty>
          Open a shop from{" "}
          <Link href="/admin/leads?show=all" className="text-link underline">
            Leads
          </Link>
          .
        </Empty>
      </>
    );
  return (
    <>
      <PageHeader
        back={back}
        title={`Import for ${shop.name as string}`}
        subtitle="Their customers, pools, and visit plans, straight into their shop."
      />
      <ImportWizard companyId={shop.id as string} services={companyServices(shop.settings)} />
    </>
  );
}
