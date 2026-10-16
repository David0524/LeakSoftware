import type { Metadata } from "next";
import { TwoStepSettings } from "@/components/two-step";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Two-Step Sign-In · Tidemark" };

/** More › Two-Step Sign-In (owner, 2026-10-16): for everyone on the team. */
export default async function TwoStepPage() {
  const office = await getOffice();
  const { data } = await (
    await createClient()
  )
    .from("profile")
    .select("two_step")
    .eq("id", office.user.id)
    .maybeSingle();
  return (
    <>
      <PageHeader back={{ href: "/more", label: "More" }} title="Two-Step Sign-In" />
      <div className="card max-w-md p-5">
        <TwoStepSettings on={Boolean(data?.two_step)} />
      </div>
    </>
  );
}
