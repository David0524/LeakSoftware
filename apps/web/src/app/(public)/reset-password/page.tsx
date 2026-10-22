import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth-card";
import { NewPasswordForm } from "@/components/auth-forms";
import { cookies } from "next/headers";
import { Banner } from "@/components/doc-ui";
import { buttonClass } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { RESET_COOKIE } from "@/lib/password-reset-email";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New Password · Sundeck Pro" };

/**
 * Where the reset email's link lands, signed in by it (owner, 2026-10-22). With two-step on,
 * the authenticator code comes first, so an email alone can't change the password.
 */
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a New Password">
      <Suspense fallback={<FormSkeleton />}>
        <ResetBody />
      </Suspense>
    </AuthCard>
  );
}

async function ResetBody() {
  const [user, jar] = await Promise.all([getUser(), cookies()]);
  if (!user || !jar.has(RESET_COOKIE))
    return (
      <div className="space-y-4">
        <Banner tone="error">That reset link has expired or was already used.</Banner>
        <Link href="/forgot-password" className={buttonClass("primary", "w-full")}>
          Get a New Link
        </Link>
      </div>
    );
  if (user.aal !== "aal2") {
    const { data } = await (
      await createClient()
    )
      .from("profile")
      .select("two_step")
      .eq("id", user.id)
      .maybeSingle();
    if (data?.two_step) redirect("/sign-in/verify?next=/reset-password");
  }
  return (
    <>
      {user.email ? (
        <p className="mb-4 text-text-muted max-sm:text-center">For {user.email}</p>
      ) : null}
      <NewPasswordForm />
    </>
  );
}
