import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth-card";
import { SetupForm } from "@/components/auth-forms";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set Up Your Company · Tidemark" };

export default function SetupPage() {
  return (
    <AuthCard
      title="Set Up Your Company"
      intro="Your account isn’t part of a company yet. Create one, or ask your shop’s owner for an invite link."
    >
      <Suspense fallback={<FormSkeleton />}>
        <SetupBody />
      </Suspense>
    </AuthCard>
  );
}

async function SetupBody() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/setup");
  const supabase = await createClient();
  const { count } = await supabase
    .from("membership")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("deleted_at", null);
  if (count) redirect("/today");
  return <SetupForm suggested={String(user.user_metadata?.company_name ?? "")} />;
}
