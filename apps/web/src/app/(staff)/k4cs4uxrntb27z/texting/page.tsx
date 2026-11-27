import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { formatPhone, KIND_TITLE, type RegistrationKind } from "@leakbook/core";
import { RetryTexting } from "@/components/admin/actions";
import { Empty, PageHeader } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { adminClient } from "@/server/admin";
import { isStaff } from "@/server/leads";
import { STEP_LABEL } from "@/server/texting-registration";

export const metadata: Metadata = { title: "Texting", robots: { index: false } };

interface Row {
  id: string;
  company_id: string;
  kind: RegistrationKind;
  stage: string;
  step: string;
  twilio: Record<string, string>;
  problem: string | null;
  last_error: string | null;
  attempts: number;
  next_check_at: string;
  created_at: string;
  company: { name: string } | null;
}

const STAGE: Record<string, string> = {
  registering: "Registering",
  verify_number: "Verifying the number",
  needs_changes: "Needs changes (waiting on the shop)",
  ready: "Ready",
  cancelled: "Cancelled",
};

/**
 * Every shop's texting registration (docs/plans/texting-registration.md): where it is, what
 * Twilio last said, and Retry Now. Use My Own Number waits at "hosted" until staff start the
 * hosting order in the shop's subaccount in Twilio's Console (the API is Twilio-only preview).
 */
export default function TextingPage() {
  return (
    <Suspense fallback={<div className="h-64" aria-label="Loading" />}>
      <Registrations />
    </Suspense>
  );
}

async function Registrations() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/k4cs4uxrntb27z/texting");
  if (!isStaff(user)) redirect("/sign-in/staff");
  const admin = adminClient();
  const { data } = admin
    ? await admin
        .from("texting_registration")
        .select(
          "id, company_id, kind, stage, step, twilio, problem, last_error, attempts, next_check_at, created_at, company:company!texting_registration_company_id_fkey(name)",
        )
        .neq("stage", "cancelled")
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] };
  const rows = (data ?? []) as unknown as Row[];
  const when = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
  return (
    <>
      <PageHeader
        title="Texting"
        subtitle="Each shop’s number registration with the phone companies. Checked every 30 minutes."
      />
      {rows.length === 0 ? (
        <Empty>No registrations yet.</Empty>
      ) : (
        <ul className="space-y-3" aria-label="Texting registrations">
          {rows.map((r) => (
            <li key={r.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{r.company?.name ?? r.company_id}</p>
                <p className="text-[0.9375rem] text-text-muted">
                  {KIND_TITLE[r.kind]}
                  {r.twilio.number ? ` · ${formatPhone(r.twilio.number)}` : ""}
                </p>
              </div>
              <p>
                {STAGE[r.stage] ?? r.stage}
                {r.stage === "registering" ? ` · ${STEP_LABEL[r.step] ?? r.step}` : ""}
              </p>
              {r.problem ? <p className="text-status-fail">{r.problem}</p> : null}
              {r.last_error ? (
                <p className="text-[0.9375rem] text-status-fail">
                  Error ({r.attempts} {r.attempts === 1 ? "try" : "tries"}): {r.last_error}
                </p>
              ) : null}
              <p className="text-[0.9375rem] text-text-muted">
                Started {when.format(new Date(r.created_at))}
                {r.stage === "registering"
                  ? ` · next check ${when.format(new Date(r.next_check_at))}`
                  : ""}
                {r.twilio.account_sid ? ` · subaccount ${r.twilio.account_sid}` : ""}
              </p>
              {r.stage === "registering" ? <RetryTexting registrationId={r.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
