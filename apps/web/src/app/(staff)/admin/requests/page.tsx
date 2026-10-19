import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Empty, PageHeader } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { adminClient } from "@/server/admin";
import { isStaff } from "@/server/leads";

export const metadata: Metadata = {
  title: "Feature Requests · Sundeck Pro Staff",
  robots: { index: false },
};

interface RequestRow {
  id: string;
  name: string | null;
  email: string | null;
  company_name: string | null;
  request: string;
  page: string | null;
  created_at: string;
}

/** What shops asked for with Request a Feature (owner, 2026-10-19). Staff only. */
export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="h-64" aria-label="Loading" />}>
      <Requests />
    </Suspense>
  );
}

async function Requests() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/admin/requests");
  if (!isStaff(user)) redirect("/home");
  if (user.aal !== "aal2")
    return (
      <>
        <PageHeader title="Feature Requests" />
        <Empty>
          Requests include people’s contact details, so this page needs two-step sign-in. Turn it on
          in{" "}
          <Link href="/more/two-step" className="text-link underline">
            More › Two-Step Sign-In
          </Link>
          , then sign in again.
        </Empty>
      </>
    );
  const admin = adminClient();
  const { data } = admin
    ? await admin
        .from("feature_request")
        .select("id, name, email, company_name, request, page, created_at")
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };
  const rows = (data ?? []) as RequestRow[];
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  });
  return (
    <>
      <PageHeader
        title="Feature Requests"
        subtitle="What shops asked for, newest first. Each one is also emailed to the office."
      />
      {rows.length === 0 ? (
        <Empty>No requests yet.</Empty>
      ) : (
        <ul className="space-y-3" aria-label="Feature requests">
          {rows.map((r) => (
            <li key={r.id} className="card p-4">
              <p className="whitespace-pre-line">{r.request}</p>
              <p className="mt-2 text-[0.9375rem] text-text-muted">
                {[
                  r.company_name,
                  r.name,
                  r.email,
                  day.format(new Date(r.created_at)),
                  r.page ? `from ${r.page}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
