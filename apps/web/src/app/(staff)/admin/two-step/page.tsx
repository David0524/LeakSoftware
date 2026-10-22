import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TwoStepSettings } from "@/components/two-step";
import { buttonClass, PageHeader } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/server/leads";

export const metadata: Metadata = { title: "Two-Step Sign-In" };

/**
 * Two-step sign-in for staff, inside the portal (owner, 2026-10-22: staff accounts need not
 * belong to a shop, and the office's More › Two-Step Sign-In needs one). Every other portal
 * page needs it on.
 */
export default function StaffTwoStepPage() {
  return (
    <Suspense fallback={<div className="h-64" aria-label="Loading" />}>
      <StaffTwoStep />
    </Suspense>
  );
}

async function StaffTwoStep() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/admin/two-step");
  if (!isStaff(user)) redirect("/home");
  const { data } = await (
    await createClient()
  )
    .from("profile")
    .select("two_step")
    .eq("id", user.id)
    .maybeSingle();
  const on = Boolean(data?.two_step);
  return (
    <>
      <PageHeader
        title="Two-Step Sign-In"
        subtitle="The admin portal needs it: your password, then a code from an authenticator app."
      />
      <div className="card max-w-md space-y-4 p-5">
        <TwoStepSettings on={on} />
        {on && user.aal === "aal2" ? (
          <Link href="/admin" className={buttonClass("primary", "w-full")}>
            Open the Admin Portal
          </Link>
        ) : null}
      </div>
      <p className="mt-4 max-w-md text-[0.9375rem] text-text-muted">
        Once it’s on, the portal opens. If it asks again, sign out and back in with the code.
      </p>
    </>
  );
}
