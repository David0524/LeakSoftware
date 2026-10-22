import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth-card";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { Banner } from "@/components/doc-ui";
import { RESET_LINK_EXPIRED } from "@/lib/password-reset-email";

export const metadata: Metadata = { title: "Reset Password · Sundeck Pro" };

/** Forgot Password? (owner, 2026-10-22): an email with a link to choose a new password. */
export default function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  return (
    <AuthCard
      title="Reset Password"
      intro="Enter your account’s email. We’ll send a link to choose a new password."
    >
      <Suspense fallback={<FormSkeleton />}>
        <ForgotBody searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function ForgotBody({ searchParams }: Pick<PageProps<"/forgot-password">, "searchParams">) {
  const { error } = await searchParams;
  return (
    <>
      {error ? (
        <div className="mb-4">
          <Banner tone="error">{RESET_LINK_EXPIRED}</Banner>
        </div>
      ) : null}
      <ForgotPasswordForm />
    </>
  );
}
